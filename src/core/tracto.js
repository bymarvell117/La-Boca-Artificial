// Guía de ondas del tracto vocal (modelo de tubos de Kelly-Lochbaum).
//
// El aire del tracto se modela como una cadena de tubos cortos. En cada unión
// entre tubos una parte de la onda de presión pasa y otra rebota, según la
// diferencia de área. La nariz es una segunda cadena unida al tracto por la
// puerta del velo (unión de tres vías).

import { N, NARIZ_N, INDICE_VELO, area } from './anatomia.js';

const AREA_MIN = 1e-4;
export let PERDIDA_PARED = 0.01;
export const fijarPerdidaPared = (x) => (PERDIDA_PARED = x);

export class Tracto {
  constructor() {
    this.R = new Float64Array(N); // ondas hacia los labios
    this.L = new Float64Array(N); // ondas hacia la glotis
    this.jR = new Float64Array(N + 1);
    this.jL = new Float64Array(N + 1);
    this.A = new Float64Array(N).fill(1);
    this.G = new Float64Array(N).fill(0.999);
    this.dA = new Float64Array(N);

    this.nR = new Float64Array(NARIZ_N);
    this.nL = new Float64Array(NARIZ_N);
    this.njR = new Float64Array(NARIZ_N + 1);
    this.njL = new Float64Array(NARIZ_N + 1);
    this.nA = new Float64Array(NARIZ_N).fill(1);
    this.nG = new Float64Array(NARIZ_N).fill(0.999);
    this.dnA = new Float64Array(NARIZ_N);
    this.pasosRestantes = 0;

    // Rebotes en los extremos. En la glotis depende de lo abierta que esté
    // (fijado desde fuera cada muestra). En labios y narinas, los graves
    // rebotan casi del todo y los agudos salen más (filtro paso-bajo).
    this.reflexGlotis = 0.92;
    this.reflexLabios = -0.97;
    this.reflexNariz = -0.95;
    this.filtroRadiacion = 0.45; // 0..1: cuanto menor, más agudos escapan
    this.lpLabios = 0;
    this.lpNariz = 0;
    this.perdida = 0.9996;

    this.salidaLabios = 0;
    this.salidaNariz = 0;
  }

  // Fija las áreas a partir de diámetros (tracto y nariz). Si `pasos` > 0,
  // las áreas cambian poco a poco durante esos pasos (sin chasquidos).
  fijarDiametros(dTracto, dNariz, pasos = 0) {
    for (let i = 0; i < N; i++) {
      const obj = Math.max(AREA_MIN, area(dTracto[i]));
      this.dA[i] = pasos > 0 ? (obj - this.A[i]) / pasos : 0;
      if (pasos === 0) this.A[i] = obj;
    }
    for (let i = 0; i < NARIZ_N; i++) {
      const obj = Math.max(AREA_MIN, area(dNariz[i]));
      this.dnA[i] = pasos > 0 ? (obj - this.nA[i]) / pasos : 0;
      if (pasos === 0) this.nA[i] = obj;
    }
    this.pasosRestantes = pasos;
    this.actualizarPerdidas();
  }

  // Paredes blandas: los tramos estrechos pierden más energía.
  actualizarPerdidas() {
    for (let i = 0; i < N; i++) this.G[i] = this.perdida - PERDIDA_PARED / (1 + 6 * this.A[i]);
    for (let i = 0; i < NARIZ_N; i++) this.nG[i] = this.perdida - PERDIDA_PARED / (1 + 6 * this.nA[i]) - 0.002;
  }

  interpolar() {
    if (this.pasosRestantes <= 0) return;
    this.pasosRestantes--;
    for (let i = 0; i < N; i++) this.A[i] += this.dA[i];
    for (let i = 0; i < NARIZ_N; i++) this.nA[i] += this.dnA[i];
    if ((this.pasosRestantes & 15) === 0) this.actualizarPerdidas();
  }

  // Un paso de propagación. `entradaGlotis` es la onda que entra desde las
  // cuerdas vocales. `ruido` se inyecta en el índice `iRuido` (turbulencia).
  paso(entradaGlotis, ruido, iRuido, ruidoDientes, iDientes) {
    this.interpolar();
    const { R, L, jR, jL, A, nR, nL, njR, njL, nA } = this;
    const k = INDICE_VELO;

    jR[0] = L[0] * this.reflexGlotis + entradaGlotis;
    this.lpLabios += this.filtroRadiacion * (R[N - 1] - this.lpLabios);
    jL[N] = this.lpLabios * this.reflexLabios;

    let narizEntra = 0;
    for (let i = 1; i < N; i++) {
      const a1 = A[i - 1];
      const a2 = A[i];
      if (i === k) {
        const a3 = nA[0];
        const p = (2 * (a1 * R[i - 1] + a2 * L[i] + a3 * nL[0])) / (a1 + a2 + a3);
        jR[i] = p - L[i];
        jL[i] = p - R[i - 1];
        narizEntra = p - nL[0];
      } else {
        const p = (2 * (a1 * R[i - 1] + a2 * L[i])) / (a1 + a2);
        jR[i] = p - L[i];
        jL[i] = p - R[i - 1];
      }
    }

    const G = this.G;
    for (let i = 0; i < N; i++) {
      R[i] = jR[i] * G[i];
      L[i] = jL[i + 1] * G[i];
    }

    // Turbulencia: ruido en el punto más estrecho y en los dientes.
    // El chorro de aire viaja hacia afuera: el ruido entra en la onda R.
    if (ruido !== 0 && iRuido >= 0 && iRuido < N - 1) R[iRuido + 1] += ruido;
    if (ruidoDientes !== 0) R[iDientes] += ruidoDientes;

    // Lo que sale es caudal: presión × área de la abertura.
    this.salidaLabios = R[N - 1] * A[N - 1];

    // Cavidad nasal
    njR[0] = narizEntra;
    this.lpNariz += this.filtroRadiacion * (nR[NARIZ_N - 1] - this.lpNariz);
    njL[NARIZ_N] = this.lpNariz * this.reflexNariz;
    for (let i = 1; i < NARIZ_N; i++) {
      const a1 = nA[i - 1];
      const a2 = nA[i];
      const p = (2 * (a1 * nR[i - 1] + a2 * nL[i])) / (a1 + a2);
      njR[i] = p - nL[i];
      njL[i] = p - nR[i - 1];
    }
    const nG = this.nG;
    for (let i = 0; i < NARIZ_N; i++) {
      nR[i] = njR[i] * nG[i];
      nL[i] = njL[i + 1] * nG[i];
    }
    // La onda que vuelve de la nariz hacia el tracto entra por la unión del velo
    // en el siguiente paso (nL[0]).
    this.salidaNariz = nR[NARIZ_N - 1] * nA[NARIZ_N - 1];
  }
}
