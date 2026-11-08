// Laringe y cuerdas vocales: generan el pulso de aire que hace vibrar el tracto.
//
// Usa un pulso de Rosenberg (flujo glotal) con jitter, shimmer y vibrato
// suaves. Las cuerdas sólo vibran si están juntas (aducción) y si la
// diferencia de presión entre pulmones y boca es suficiente.

export const tensionAFrecuencia = (t) => 70 * Math.pow(2, t * 3.5);
export const frecuenciaATension = (f) => Math.log2(Math.max(70, f) / 70) / 3.5;

export class Glotis {
  constructor(sr) {
    this.sr = sr;
    this.fase = 0;
    this.f0 = 120;
    this.flujoPrevio = 0;
    this.apertura = 0; // 0..1, apertura instantánea (para el dibujo)
    this.amplitud = 0; // amplitud de vibración actual (suavizada)
    this.cocienteAbierto = 0.6;
    this.periodoJitter = 1;
    this.shimmer = 1;
    this.tVibrato = 0;
    this.semilla = 12345;
  }

  azar() {
    // generador simple y determinista (para pruebas reproducibles)
    this.semilla = (this.semilla * 1664525 + 1013904223) >>> 0;
    return this.semilla / 4294967296;
  }

  // Pulso de Rosenberg: flujo entre 0 y 1 dentro de un periodo.
  static pulso(fase, oq) {
    const tp = oq * 0.62; // apertura
    const tn = oq - tp; // cierre
    if (fase < tp) return 0.5 * (1 - Math.cos((Math.PI * fase) / tp));
    if (fase < oq) return Math.cos((Math.PI * (fase - tp)) / (2 * tn));
    return 0;
  }

  // Devuelve una muestra (derivada del flujo glotal, que es lo que se oye).
  //  f0: frecuencia deseada; ampObjetivo: 0..1.5; aduccion: 0..1
  muestra(f0, ampObjetivo, aduccion) {
    const dt = 1 / this.sr;
    this.f0 += (f0 - this.f0) * 0.002;
    this.amplitud += (ampObjetivo - this.amplitud) * 0.003;

    this.tVibrato += dt;
    const vibrato = 1 + 0.006 * Math.sin(2 * Math.PI * 5.2 * this.tVibrato);
    const f = this.f0 * vibrato * this.periodoJitter;

    this.fase += f * dt;
    if (this.fase >= 1) {
      this.fase -= 1;
      this.periodoJitter = 1 + (this.azar() - 0.5) * 0.012;
      this.shimmer = 1 + (this.azar() - 0.5) * 0.06;
      // Voz apretada: cierre más largo. Voz soplada: más abierta.
      this.cocienteAbierto = Math.min(0.85, Math.max(0.4, 0.95 - 0.5 * aduccion));
    }

    const flujo = Glotis.pulso(this.fase, this.cocienteAbierto) * this.amplitud * this.shimmer;
    const deriv = (flujo - this.flujoPrevio) * this.sr / Math.max(80, this.f0) * 0.12;
    this.flujoPrevio = flujo;
    this.apertura = flujo;
    return { deriv, flujo };
  }
}
