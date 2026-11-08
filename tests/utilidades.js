// Herramientas de análisis para las pruebas.
import { Tracto } from '../src/core/tracto.js';
import { N, NARIZ_N, diametrosTracto, diametrosNariz, REPOSO } from '../src/core/anatomia.js';

// FFT radix-2 in situ.
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const c = Math.cos(ang * k), s = Math.sin(ang * k);
        const ar = re[i + k + len / 2], ai = im[i + k + len / 2];
        const tr = ar * c - ai * s, ti = ar * s + ai * c;
        re[i + k + len / 2] = re[i + k] - tr;
        im[i + k + len / 2] = im[i + k] - ti;
        re[i + k] += tr;
        im[i + k] += ti;
      }
    }
  }
}

// Formantes de una postura: respuesta al impulso del tracto (sin fuente).
export function formantes(articuladores, sr = 48000, cuantos = 3) {
  const a = { ...REPOSO, ...articuladores };
  const dT = diametrosTracto(a, new Float64Array(N));
  const dN = diametrosNariz(a.velo, new Float64Array(NARIZ_N));
  const t = new Tracto();
  t.fijarDiametros(dT, dN);
  const n = 8192;
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    t.paso(i === 0 ? 1 : 0, 0, -1, 0, 0);
    let s = t.salidaLabios + t.salidaNariz;
    t.paso(0, 0, -1, 0, 0);
    s += t.salidaLabios + t.salidaNariz;
    re[i] = s;
  }
  fft(re, im);
  const df = sr / n;
  const mag = [];
  for (let i = 0; i < n / 2; i++) mag.push(Math.hypot(re[i], im[i]));
  const picos = [];
  for (let i = 2; i < mag.length - 2 && i * df < 5000; i++) {
    if (i * df < 150) continue;
    if (mag[i] > mag[i - 1] && mag[i] >= mag[i + 1] && mag[i] > mag[i - 2] && mag[i] >= mag[i + 2]) {
      picos.push(Math.round(i * df));
    }
  }
  return picos.slice(0, cuantos);
}

// Ancho de banda (-3 dB) del primer formante.
export function anchoBandaF1(articuladores, sr = 48000) {
  const a = { ...REPOSO, ...articuladores };
  const t = new Tracto();
  t.fijarDiametros(diametrosTracto(a, new Float64Array(N)), diametrosNariz(a.velo, new Float64Array(NARIZ_N)));
  const n = 32768;
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    t.paso(i === 0 ? 1 : 0, 0, -1, 0, 0);
    let s = t.salidaLabios;
    t.paso(0, 0, -1, 0, 0);
    re[i] = s + t.salidaLabios;
  }
  fft(re, im);
  const df = sr / n;
  const m = [];
  for (let i = 0; i < n / 2; i++) m.push(20 * Math.log10(Math.hypot(re[i], im[i]) + 1e-12));
  let pk = Math.round(200 / df);
  for (let i = pk; i < Math.round(1000 / df); i++) if (m[i] > m[pk]) pk = i;
  let lo = pk, hi = pk;
  while (lo > 0 && m[lo] > m[pk] - 3) lo--;
  while (m[hi] > m[pk] - 3) hi++;
  return Math.round((hi - lo) * df);
}
