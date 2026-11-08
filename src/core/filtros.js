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
