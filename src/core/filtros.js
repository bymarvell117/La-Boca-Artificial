// Filtros sencillos (biquad RBJ) y ruido.

export class Resonador {
  // Pasa-banda de ganancia unidad en el pico.
  constructor(sr, frecuencia, q) {
    const w = (2 * Math.PI * frecuencia) / sr;
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    this.b0 = alpha / a0;
    this.b2 = -alpha / a0;
    this.a1 = (-2 * Math.cos(w)) / a0;
    this.a2 = (1 - alpha) / a0;
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
  }
  paso(x) {
    const y = this.b0 * x + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

// Ruido blanco con semilla, para resultados reproducibles.
export class Ruido {
  constructor(semilla = 987654321) {
    this.s = semilla >>> 0;
  }
  blanco() {
    this.s ^= this.s << 13;
    this.s >>>= 0;
    this.s ^= this.s >>> 17;
    this.s ^= this.s << 5;
    this.s >>>= 0;
    return this.s / 2147483648 - 1;
  }
}

// Filtro de un polo (paso-altos) para quitar continua y dar brillo al ruido.
export class PasoAltos {
  constructor(sr, fc) {
    this.a = Math.exp((-2 * Math.PI * fc) / sr);
    this.x1 = 0;
    this.y1 = 0;
  }
  paso(x) {
    const y = this.a * (this.y1 + x - this.x1);
    this.x1 = x;
    this.y1 = y;
    return y;
  }
}

// Biquad general (fórmulas RBJ): paso-bajos, paso-altos y estante de graves.
export class Biquad {
  constructor(b0, b1, b2, a0, a1, a2) {
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
  }
  static pasaBajos(sr, fc, q = Math.SQRT1_2) {
    const w = (2 * Math.PI * fc) / sr;
    const c = Math.cos(w);
    const al = Math.sin(w) / (2 * q);
    return new Biquad((1 - c) / 2, 1 - c, (1 - c) / 2, 1 + al, -2 * c, 1 - al);
  }
  static pasaAltos(sr, fc, q = Math.SQRT1_2) {
    const w = (2 * Math.PI * fc) / sr;
    const c = Math.cos(w);
    const al = Math.sin(w) / (2 * q);
    return new Biquad((1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + al, -2 * c, 1 - al);
  }
  // Baja (o sube) los graves por debajo de fc, en dB.
  static estanteGraves(sr, fc, db) {
    const A = Math.pow(10, db / 40);
    const w = (2 * Math.PI * fc) / sr;
    const c = Math.cos(w);
    const al = (Math.sin(w) / 2) * Math.SQRT2;
    const r = 2 * Math.sqrt(A) * al;
    return new Biquad(
      A * (A + 1 - (A - 1) * c + r), 2 * A * (A - 1 - (A + 1) * c), A * (A + 1 - (A - 1) * c - r),
      A + 1 + (A - 1) * c + r, -2 * (A - 1 + (A + 1) * c), A + 1 + (A - 1) * c - r,
    );
  }
  paso(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}
