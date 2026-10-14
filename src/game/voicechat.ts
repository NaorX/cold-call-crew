import { bus } from './bus';
import { crew, send } from './net';
import { audio, masterNode } from './audio';

interface Peer {
  pc: RTCPeerConnection;
  panner: PannerNode;
  el: HTMLAudioElement;
  makingOffer: boolean;
}

const ICE = [{ urls: 'stun:stun.l.google.com:19302' }];

class VoiceChat {
  private peers = new Map<string, Peer>();
  private local: MediaStream | null = null;
  muted = false;
  active = false;
  private analyser: AnalyserNode | null = null;
  private buf = new Float32Array(512);
  speaking = false;

  async start() {
    if (this.active || !crew.online) return;
    try {
      this.local = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch {
      bus.emit('toast', { text: 'Voice chat needs microphone access.', kind: 'bad' });
      return;
    }
    this.active = true;
    const ctx = audio();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    ctx.createMediaStreamSource(this.local).connect(this.analyser);
    this.sync();
    bus.emit('voice:changed');
  }

  stop() {
    for (const id of [...this.peers.keys()]) this.drop(id);
    this.local?.getTracks().forEach((t) => t.stop());
    this.local = null;
    this.active = false;
    bus.emit('voice:changed');
  }

  toggleMute() {
    this.muted = !this.muted;
    this.local?.getAudioTracks().forEach((t) => (t.enabled = !this.muted));
    bus.emit('voice:changed');
  }

  sync() {
    if (!this.active) return;
    const ids = new Set(crew.players.map((p) => p.id).filter((id) => id !== crew.me));
    for (const id of ids) if (!this.peers.has(id)) this.connect(id);
    for (const id of [...this.peers.keys()]) if (!ids.has(id)) this.drop(id);
  }

  private connect(id: string): Peer {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const ctx = audio();
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1.5;
    panner.maxDistance = 30;
    panner.rolloffFactor = 1.6;
    const gain = ctx.createGain();
    gain.gain.value = 1.4;
    panner.connect(gain).connect(masterNode());
    const el = new Audio();
    el.muted = true;
    const peer: Peer = { pc, panner, el, makingOffer: false };
    this.peers.set(id, peer);
    this.local?.getTracks().forEach((t) => pc.addTrack(t, this.local!));
    pc.ontrack = (e) => {
      const stream = e.streams[0] || new MediaStream([e.track]);
      el.srcObject = stream;
      void el.play().catch(() => {});
      ctx.createMediaStreamSource(stream).connect(panner);
    };
    pc.onicecandidate = (e) => e.candidate && send({ t: 'signal', to: id, data: { candidate: e.candidate.toJSON() } });
    pc.onnegotiationneeded = async () => {
      if (crew.me > id) return;
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        send({ t: 'signal', to: id, data: { sdp: pc.localDescription } });
      } finally {
        peer.makingOffer = false;
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        this.drop(id);
        setTimeout(() => this.sync(), 2000);
      }
    };
    return peer;
  }

  private drop(id: string) {
    const p = this.peers.get(id);
    if (!p) return;
    p.pc.close();
    p.el.srcObject = null;
    p.panner.disconnect();
    this.peers.delete(id);
  }

  async onSignal(from: string, data: any) {
    if (!this.active) return;
    const peer = this.peers.get(from) || this.connect(from);
    const pc = peer.pc;
    try {
      if (data.sdp) {
        const collision = data.sdp.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
        if (collision && crew.me < from) return;
        await pc.setRemoteDescription(data.sdp);
        if (data.sdp.type === 'offer') {
          await pc.setLocalDescription();
          send({ t: 'signal', to: from, data: { sdp: pc.localDescription } });
        }
      } else if (data.candidate) {
        await pc.addIceCandidate(data.candidate).catch(() => {});
      }
    } catch (err) {
      console.warn('[voice]', err);
    }
  }

  update(me: { x: number; z: number; f: number }, others: Map<string, { x: number; z: number }>) {
    if (!this.active) return;
    const ctx = audio();
    const L = ctx.listener;
    const fx = Math.sin(me.f);
    const fz = Math.cos(me.f);
    if (L.positionX) {
      L.positionX.value = me.x;
      L.positionY.value = 1.5;
      L.positionZ.value = me.z;
      L.forwardX.value = fx;
      L.forwardY.value = 0;
      L.forwardZ.value = fz;
      L.upX.value = 0;
      L.upY.value = 1;
      L.upZ.value = 0;
    }
    for (const [id, p] of this.peers) {
      const o = others.get(id);
      if (!o) continue;
      p.panner.positionX.value = o.x;
      p.panner.positionY.value = 1.5;
      p.panner.positionZ.value = o.z;
    }
    if (this.analyser && !this.muted) {
      this.analyser.getFloatTimeDomainData(this.buf);
      let s = 0;
      for (let i = 0; i < this.buf.length; i++) s += this.buf[i] * this.buf[i];
      const rms = Math.sqrt(s / this.buf.length);
      const on = rms > 0.035;
      if (on !== this.speaking) {
        this.speaking = on;
        bus.emit('me:talking', on);
      }
    }
  }
}

export const voiceChat = new VoiceChat();
bus.on('net:signal', (m: any) => void voiceChat.onSignal(m.from, m.data));
bus.on('net:state', () => voiceChat.sync());
