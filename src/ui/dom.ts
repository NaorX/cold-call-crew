type Child = Node | string | number | null | undefined | false | Child[];
type Props = Record<string, any> | null;

export function h<K extends keyof HTMLElementTagNameMap>(sel: K | string, props?: Props, ...children: Child[]): HTMLElement {
  const [tagPart, ...rest] = sel.split(/(?=[.#])/);
  const el = document.createElement(tagPart || 'div');
  for (const r of rest) {
    if (r.startsWith('.')) el.classList.add(r.slice(1));
    else if (r.startsWith('#')) el.id = r.slice(1);
  }
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') {
        for (const [sk, sv] of Object.entries(v)) {
          if (sk.startsWith('--')) el.style.setProperty(sk, String(sv));
          else (el.style as any)[sk] = sv;
        }
      }
      else if (k === 'class') el.className += ` ${v}`;
      else if (k in el && k !== 'list') (el as any)[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

function append(el: Node, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

export function clear(el: Element) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;

export const clockHour = { fixed: null as number | null };

export function clockText(minutes: number) {
  const total = clockHour.fixed !== null ? Math.round(clockHour.fixed * 60) : 8 * 60 + Math.floor(Math.max(0, Math.min(480, minutes)) * 1.75);
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  const h12 = ((hh + 11) % 12) + 1;
  return `${h12}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'PM' : 'AM'}`;
}

export function isRtl(text: string) {
  return /[֐-׿؀-ۿ]/.test(text);
}
