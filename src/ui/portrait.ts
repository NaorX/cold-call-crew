import type { Look } from '../game/types';

export function portrait(look: Look, mood = 'calm', talking = false): string {
  const s = '#1a1a1a';
  const hair = look.hairColor;
  const skin = look.skin;
  const browTilt = mood === 'angry' ? 8 : mood === 'suspicious' ? 4 : mood === 'scared' || mood === 'sad' ? -8 : mood === 'happy' || mood === 'excited' ? -3 : 0;
  const mouthOpen = talking ? 9 : mood === 'happy' || mood === 'excited' ? 5 : mood === 'scared' ? 7 : 2;
  const mouthCurve = mood === 'happy' || mood === 'excited' ? 10 : mood === 'angry' || mood === 'sad' ? -7 : mood === 'suspicious' ? -2 : 3;

  let back = '';
  let front = '';
  switch (look.hair) {
    case 'short':
      front = `<path d="M38 58 Q40 22 80 20 Q120 22 122 58 Q110 40 80 38 Q52 40 38 58Z" fill="${hair}" stroke="${s}" stroke-width="4"/>`;
      break;
    case 'bun':
      back = `<circle cx="80" cy="20" r="16" fill="${hair}" stroke="${s}" stroke-width="4"/>`;
      front = `<path d="M36 64 Q34 26 80 24 Q126 26 124 64 Q116 42 80 40 Q46 42 36 64Z" fill="${hair}" stroke="${s}" stroke-width="4"/>`;
      break;
    case 'curly':
      front = Array.from({ length: 11 }, (_, i) => {
        const a = Math.PI + (i / 10) * Math.PI;
        return `<circle cx="${80 + Math.cos(a) * 44}" cy="${62 + Math.sin(a) * 42}" r="14" fill="${hair}" stroke="${s}" stroke-width="4"/>`;
      }).join('');
      break;
    case 'long':
      back = `<path d="M32 60 Q30 22 80 20 Q130 22 128 60 L132 132 Q80 140 28 132Z" fill="${hair}" stroke="${s}" stroke-width="4"/>`;
      front = `<path d="M38 60 Q42 26 80 24 Q118 26 122 60 Q104 44 80 42 Q56 44 38 60Z" fill="${hair}" stroke="${s}" stroke-width="4"/>`;
      break;
    case 'mohawk':
      front = `<path d="M70 44 L66 8 L78 20 L82 4 L90 20 L96 10 L92 44Z" fill="${hair}" stroke="${s}" stroke-width="4" stroke-linejoin="round"/>`;
      break;
    case 'cap':
      front = `<path d="M36 56 Q38 18 80 18 Q122 18 124 56Z" fill="#c8432f" stroke="${s}" stroke-width="4"/><path d="M80 52 Q120 46 140 58 Q112 62 80 58Z" fill="#a8331f" stroke="${s}" stroke-width="4"/>`;
      break;
    case 'side':
      front = `<path d="M38 60 Q36 22 84 20 Q124 24 122 54 Q100 36 64 46 Q50 50 38 60Z" fill="${hair}" stroke="${s}" stroke-width="4"/>`;
      break;
    case 'bald':
      front = `<path d="M38 70 Q36 58 42 54" stroke="${hair}" stroke-width="8" fill="none" stroke-linecap="round"/><path d="M122 70 Q124 58 118 54" stroke="${hair}" stroke-width="8" fill="none" stroke-linecap="round"/>`;
      break;
  }

  let facial = '';
  if (look.facial === 'beard') facial += `<path d="M42 86 Q44 140 80 142 Q116 140 118 86 Q104 112 80 112 Q56 112 42 86Z" fill="${hair}" stroke="${s}" stroke-width="4"/>`;
  if (look.facial === 'goatee') facial += `<path d="M70 118 Q80 136 90 118Z" fill="${hair}" stroke="${s}" stroke-width="3"/>`;
  if (look.facial === 'mustache' || look.facial === 'beard')
    facial += `<path d="M58 100 Q70 92 80 98 Q90 92 102 100 Q92 106 80 102 Q68 106 58 100Z" fill="${hair}" stroke="${s}" stroke-width="3"/>`;

  const glasses = look.glasses
    ? `<g fill="none" stroke="${s}" stroke-width="4"><circle cx="64" cy="74" r="13"/><circle cx="96" cy="74" r="13"/><path d="M77 74 L83 74"/></g>`
    : '';

  return `<svg viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg">
    <path d="M30 160 Q34 128 80 126 Q126 128 130 160Z" fill="${look.shirt}" stroke="${s}" stroke-width="4"/>
    ${back}
    <ellipse cx="38" cy="80" rx="8" ry="12" fill="${skin}" stroke="${s}" stroke-width="4"/>
    <ellipse cx="122" cy="80" rx="8" ry="12" fill="${skin}" stroke="${s}" stroke-width="4"/>
    <ellipse cx="80" cy="78" rx="42" ry="48" fill="${skin}" stroke="${s}" stroke-width="4"/>
    ${front}
    <g stroke="${s}" stroke-width="4" stroke-linecap="round">
      <path d="M54 ${58 - browTilt / 2} L72 ${58 + browTilt / 2}"/>
      <path d="M106 ${58 - browTilt / 2} L88 ${58 + browTilt / 2}"/>
    </g>
    <ellipse cx="64" cy="74" rx="7" ry="8" fill="#fff" stroke="${s}" stroke-width="3"/>
    <ellipse cx="96" cy="74" rx="7" ry="8" fill="#fff" stroke="${s}" stroke-width="3"/>
    <circle cx="65" cy="75" r="3.5" fill="${s}"/><circle cx="97" cy="75" r="3.5" fill="${s}"/>
    <path d="M80 78 Q74 92 80 94 Q86 94 84 88" fill="none" stroke="${s}" stroke-width="3" stroke-linecap="round"/>
    ${glasses}
    <path d="M66 ${110 - mouthCurve / 2} Q80 ${110 + mouthCurve} 94 ${110 - mouthCurve / 2} Q80 ${110 + mouthCurve + mouthOpen} 66 ${110 - mouthCurve / 2}Z" fill="#5a1414" stroke="${s}" stroke-width="3" stroke-linejoin="round"/>
    ${facial}
  </svg>`;
}
