// Laringe y cuerdas vocales: generan el pulso de aire que hace vibrar el tracto.
//
// Usa el modelo LF (Liljencrants-Fant) de la derivada del flujo glotal,
// controlado por un solo parámetro Rd (Fant 1995): voz tensa ↔ voz relajada.
// Incluye jitter, shimmer y vibrato suaves. Las cuerdas sólo vibran si están
// juntas (aducción) y si hay presión suficiente entre pulmones y boca.

export const tensionAFrecuencia = (t) => 70 * Math.pow(2, t * 3.5);
export const frecuenciaATension = (f) => Math.log2(Math.max(70, f) / 70) / 3.5;

// Parámetros de forma del pulso LF a partir de Rd (0.5 tensa … 2.7 soplada).
export function formaLF(rd) {
  rd = Math.min(2.7, Math.max(0.5, rd));
  const ra = -0.01 + 0.048 * rd;
  const rk = 0.224 + 0.118 * rd;
  const rg = ((rk / 4) * (0.5 + 1.2 * rk)) / (0.11 * rd - ra * (0.5 + 1.2 * rk));
  const ta = ra;
  const tp = 1 / (2 * rg);
  const te = tp + tp * rk;

  const eps = 1 / ta;
  const shift = Math.exp(-eps * (1 - te));
  const delta = 1 - shift;
  let integralRetorno = (1 / eps) * (shift - 1) + (1 - te) * shift;
  integralRetorno /= delta;
  const integralAbajo = -(te - tp) / 2 + integralRetorno;
  const integralArriba = -integralAbajo;

  const omega = Math.PI / tp;
  const s = Math.sin(omega * te);
  const y = (-Math.PI * s * integralArriba) / (tp * 2);
  const alpha = Math.log(y) / (tp / 2 - te);
  const e0 = -1 / (s * Math.exp(alpha * te));
  return { te, tp, eps, shift, delta, omega, alpha, e0 };
}

// Derivada del flujo en la fase t (0..1) del periodo.
export function ondaLF(f, t) {
  if (t > f.te) return (-Math.exp(-f.eps * (t - f.te)) + f.shift) / f.delta;
  return f.e0 * Math.exp(f.alpha * t) * Math.sin(f.omega * t);
}

export class Glotis {
  constructor(sr) {
    this.sr = sr;
    this.fase = 0;
    this.f0 = 120;
    this.apertura = 0; // 0..1, apertura instantánea (para el dibujo)
    this.amplitud = 0; // amplitud de vibración actual (suavizada)
    this.forma = formaLF(1.2);
    this.periodoJitter = 1;
    this.shimmer = 1;
    this.tVibrato = 0;
    this.deriva = 0;
    this.derivaObjetivo = 0;
    this.semilla = 12345;
  }

  azar() {
    // generador simple y determinista (para pruebas reproducibles)
    this.semilla = (this.semilla * 1664525 + 1013904223) >>> 0;
    return this.semilla / 4294967296;
  }

  // Devuelve una muestra: `deriv` (derivada del flujo, lo que excita el
  // tracto) y `flujo` (apertura, 0..1, para modular el ruido y dibujar).
  //  f0: frecuencia deseada; ampObjetivo: 0..1.5; aduccion: 0..1
  muestra(f0, ampObjetivo, aduccion) {
    const dt = 1 / this.sr;
    this.f0 += (f0 - this.f0) * 0.002;
    this.amplitud += (ampObjetivo - this.amplitud) * 0.002;

    this.tVibrato += dt;
    const vibrato = 1 + 0.005 * Math.sin(2 * Math.PI * 5.1 * this.tVibrato);
    // deriva lenta e irregular del tono, como en una voz humana
    this.deriva += (this.derivaObjetivo - this.deriva) * 0.0004;
    const f = this.f0 * vibrato * this.periodoJitter * (1 + this.deriva);

    this.fase += f * dt;
    if (this.fase >= 1) {
      this.fase -= 1;
      this.periodoJitter = 1 + (this.azar() - 0.5) * 0.016;
      this.shimmer = 1 + (this.azar() - 0.5) * 0.08;
      if (this.azar() < 0.08) this.derivaObjetivo = (this.azar() - 0.5) * 0.03;
      // Cuerdas muy juntas → voz tensa (Rd bajo). Poco juntas o poca
      // fuerza → voz relajada/soplada (Rd alto).
      const tension = Math.min(1, Math.max(0, (aduccion - 0.45) / 0.4)) * Math.min(1, 0.4 + this.amplitud * 0.7);
      this.forma = formaLF(2.5 - 1.6 * tension);
    }

    const a = this.amplitud * this.shimmer;
    const deriv = ondaLF(this.forma, this.fase) * a * 0.25;
    const abierto = this.fase < this.forma.te ? Math.sin((Math.PI * this.fase) / this.forma.te) : 0;
    this.apertura = abierto * this.amplitud;
    return { deriv, flujo: abierto };
  }
}
