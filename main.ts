import {mkdirSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

// Stack VM for make.fun's tiny ISA, matching the reference VM rule for rule:
// wrapping 32-bit math, unsigned ops read unsigned, sign-extended PUSH8,
// shift counts masked to 5 bits, every trap with its own exit code, and the
// step and output limits, all checked in the reference's order.
// Opcode byte -> [immediate bytes, pops, pushes]; the binary ops (0x10..0x22
// except NEG and NOT) share [0, 2, 1] and are filled in after the table.
const T = {0:[0,0,0],1:[1,0,1],2:[4,0,1],3:[0,1,0],4:[0,1,2],5:[0,2,2],6:[0,2,3],7:[0,3,3],23:[0,1,1],27:[0,1,1],48:[2,0,0],49:[2,1,0],50:[2,1,0],51:[2,0,0],52:[0,0,0],64:[0,1,1],65:[0,2,0],80:[0,1,0],81:[0,1,0],82:[0,0,1],83:[0,1,0]};
for (const o of [16,17,18,19,20,21,22,24,25,26,28,29,30,32,33,34]) T[o] = [0,2,1];

// Runs one program P on input I; returns [output bytes, exit code].
function run(P, I) {
  const n = P.length, D = new Int32Array(256), C = new Int32Array(64), M = new Int32Array(256), O = new Uint8Array(65536);
  let s = 0, c = 0, l = 0, q = 0, p = 0, t = 0;
  const done = e => [O.slice(0, l), e];
  for (;;) {
    if (t === 1e6) return done(10);
    if (p < 0 || p >= n) return done(9);
    const o = P[p], e = T[o];
    if (!e) return done(5);
    if (p + e[0] >= n) return done(9);
    t++;
    const x = p + 1 + e[0];
    if (s < e[1]) return done(2);
    if (s - e[1] + e[2] > 256) return done(3);
    p = x;
    switch (o) {
      case 0: return done(0);
      case 1: D[s++] = P[x-1] << 24 >> 24; break;
      case 2: D[s++] = P[x-4] | P[x-3] << 8 | P[x-2] << 16 | P[x-1] << 24; break;
      case 3: s--; break;
      case 4: D[s] = D[s-1]; s++; break;
      case 5: { const v = D[s-1]; D[s-1] = D[s-2]; D[s-2] = v; break; }
      case 6: D[s] = D[s-2]; s++; break;
      case 7: { const v = D[s-3]; D[s-3] = D[s-2]; D[s-2] = D[s-1]; D[s-1] = v; break; }
      case 23: D[s-1] = -D[s-1] | 0; break;
      case 27: D[s-1] = ~D[s-1]; break;
      case 48: case 49: case 50: {
        const r = (P[x-2] | P[x-1] << 8) << 16 >> 16;
        let k = 1;
        if (o !== 48) { const v = D[--s]; k = o === 49 ? v === 0 : v !== 0; }
        if (k) p = x + r;
        break;
      }
      case 51: if (c === 64) return done(7); C[c++] = x; p = P[x-2] | P[x-1] << 8; break;
      case 52: if (!c) return done(8); p = C[--c]; break;
      case 64: { const a = D[s-1]; if (a < 0 || a > 255) return done(6); D[s-1] = M[a]; break; }
      case 65: { const a = D[s-1]; if (a < 0 || a > 255) return done(6); M[a] = D[s-2]; s -= 2; break; }
      case 80: {
        const v = String(D[s-1]);
        if (l + v.length > 65536) return done(11);
        s--;
        for (let i = 0; i < v.length; i++) O[l++] = v.charCodeAt(i);
        break;
      }
      case 81: if (l === 65536) return done(11); O[l++] = D[--s] & 255; break;
      case 82: D[s++] = q < I.length ? I[q++] : -1; break;
      case 83: return done(D[--s] & 255);
      default: {
        const b = D[s-1], a = D[s-2];
        if (!b && o >= 19 && o <= 22) return done(4);
        let r;
        switch (o) {
          case 16: r = a + b | 0; break;
          case 17: r = a - b | 0; break;
          case 18: r = Math.imul(a, b); break;
          case 19: r = a === -2147483648 && b === -1 ? a : a / b | 0; break;
          case 20: r = b === -1 ? 0 : a % b | 0; break;
          case 21: r = Math.floor((a >>> 0) / (b >>> 0)) | 0; break;
          case 22: r = (a >>> 0) % (b >>> 0) | 0; break;
          case 24: r = a & b; break;
          case 25: r = a | b; break;
          case 26: r = a ^ b; break;
          case 28: r = a << (b & 31); break;
          case 29: r = a >> (b & 31); break;
          case 30: r = a >>> (b & 31) | 0; break;
          case 32: r = a === b ? 1 : 0; break;
          case 33: r = a < b ? 1 : 0; break;
          default: r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        }
        D[s-2] = r; s--;
      }
    }
  }
}

const I = process.env.MAKEFUN_INPUT_DIR || '/input', U = process.env.MAKEFUN_OUTPUT_DIR || '/output';
for (const d of readdirSync(I).sort()) {
  let out = new Uint8Array(0), code = 0;
  try {
    let inp;
    try { inp = readFileSync(join(I, d, 'input.bin')); } catch { inp = Buffer.alloc(0); }
    [out, code] = run(readFileSync(join(I, d, 'program.bin')), inp);
  } catch { /* best effort: empty output, code 0 */ }
  const g = join(U, d);
  mkdirSync(g, {recursive: true});
  writeFileSync(join(g, 'stdout.bin'), Buffer.from(out));
  writeFileSync(join(g, 'exit.txt'), code + '\n');
}
