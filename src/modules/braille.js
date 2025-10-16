import { registerModule } from '../registry.js';
import { manifest } from './braille.manifest.js';

export { manifest };

const letters = {
  a: 0x2801,
  b: 0x2803,
  c: 0x2809,
  d: 0x2819,
  e: 0x2811,
  f: 0x280b,
  g: 0x281b,
  h: 0x2813,
  i: 0x280a,
  j: 0x281a,
  k: 0x2805,
  l: 0x2807,
  m: 0x280d,
  n: 0x281d,
  o: 0x2815,
  p: 0x280f,
  q: 0x281f,
  r: 0x2817,
  s: 0x280e,
  t: 0x281e,
  u: 0x2825,
  v: 0x2827,
  w: 0x283a,
  x: 0x282d,
  y: 0x283d,
  z: 0x2835,
};
const numberSign = String.fromCharCode(0x283c);
const space = String.fromCharCode(0x2800);

function toBraille(text) {
  let out = '';
  let numberMode = false;
  for (const ch of text) {
    const lower = ch.toLowerCase();
    if (/[0-9]/.test(ch)) {
      if (!numberMode) {
        out += numberSign;
        numberMode = true;
      }
      const map = 'jabcdefghij';
      const idx = parseInt(ch, 10);
      const code = letters[map[idx]];
      out += String.fromCharCode(code);
      continue;
    } else {
      numberMode = false;
    }
    if (letters[lower]) {
      out += String.fromCharCode(letters[lower]);
    } else if (/\s/.test(ch)) {
      out += space;
    } else {
      out += ch;
    }
  }
  return out;
}

const braille = {
  id: manifest.id,
  manifest,
  init({ state }) {
    const api = {
      transcribe(text) {
        const b = toBraille(text || '');
        state.set('braille.output', b);
        return b;
      },
      transcribeSelection() {
        const t = (window.getSelection?.()?.toString() || '').trim();
        const src = t || document.activeElement?.value || '';
        const b = toBraille(src);
        state.set('braille.output', b);
        return b;
      },
      clear() {
        state.set('braille.output', '');
      },
    };
    if (!window.a11ytb) window.a11ytb = {};
    window.a11ytb.braille = api;
  },
  unmount() {
    if (window.a11ytb) {
      delete window.a11ytb.braille;
    }
  },
};

registerModule(braille);
