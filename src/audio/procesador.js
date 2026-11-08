// AudioWorklet: ejecuta la Boca Artificial en el hilo de audio del navegador.
// Recibe órdenes por `port` y envía el estado ~60 veces por segundo para el dibujo.

import { BocaArtificial } from '../core/boca.js';

class ProcesadorBoca extends AudioWorkletProcessor {
  constructor() {
    super();
    this.boca = new BocaArtificial(sampleRate);
    this.bloques = 0;
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.tipo === 'fijar') this.boca.fijar(m.objetivos);
      else if (m.tipo === 'decir') this.boca.decir(m.plan);
      else if (m.tipo === 'parar') this.boca.parar();
      else if (m.tipo === 'volumen') this.boca.ganancia = m.valor;
    };
  }

  process(_entradas, salidas) {
    const canal = salidas[0][0];
    if (!canal) return true;
    this.boca.procesar(canal);
    for (let c = 1; c < salidas[0].length; c++) salidas[0][c].set(canal);
    if (++this.bloques % 6 === 0) this.port.postMessage(this.boca.instantanea());
    return true;
  }
}

registerProcessor('boca-artificial', ProcesadorBoca);
