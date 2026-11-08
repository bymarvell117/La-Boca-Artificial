// Respiración y aerodinámica: pulmones, diafragma, músculos intercostales,
// tráquea y la entrada/salida del aire por boca y nariz.
//
// Unidades: presión en cmH2O, volumen en litros, flujo en L/s,
// áreas en cm² (aprox.).

const K_ORIFICIO = 0.53; // U = K · A · sqrt(ΔP)
const VOL_REPOSO = 2.5; // capacidad residual funcional
const VOL_MIN = 1.2; // volumen residual
const VOL_MAX = 6.0; // capacidad pulmonar total
const ELASTANCIA = 5; // cmH2O por litro (retroceso elástico)
const COMPLIANCIA_BOCA = 5.6e-4; // L/cmH2O (paredes del tracto)
const AREA_TRAQUEA = 2.5;

const P_DIAFRAGMA = 25; // presión máxima del diafragma (inspiración)
const P_INTERCOSTALES = 20; // presión máxima de los intercostales

// Flujo por un orificio (con signo).
const orificio = (A, dP) => (dP >= 0 ? 1 : -1) * K_ORIFICIO * A * Math.sqrt(Math.abs(dP));

// Áreas en serie (dos estrechamientos seguidos).
export const enSerie = (a, b) => (a <= 0 || b <= 0 ? 0 : 1 / Math.sqrt(1 / (a * a) + 1 / (b * b)));

export class Pulmones {
  constructor() {
    this.volumen = 3.0;
    this.pPulmon = 0; // presión alveolar
    this.pBoca = 0; // presión supraglótica (dentro de la boca)
    this.flujoGlotis = 0; // + sale de los pulmones, − entra
    this.flujoSalida = 0; // flujo por boca + nariz
    this.flujoBoca = 0;
    this.flujoNariz = 0;

    // Activación muscular (0..1)
    this.diafragma = 0;
    this.intercostalesExt = 0; // elevan las costillas (inspiran)
    this.intercostalesInt = 0; // bajan las costillas (espiran)

    // Control automático
    this.modo = 'tranquila'; // tranquila | habla | pausa | inspirar | manual
    this.presionObjetivo = 7;
    this.expansion = 0; // 0..1, expansión activa de la cavidad (oclusivas sonoras)
    this.cicloT = 0;
  }

  retroceso(v) {
    return ELASTANCIA * (v - VOL_REPOSO);
  }

  // Decide la activación muscular según el modo.
  controlar(dt) {
    this.factorSuave = 1 - Math.exp(-dt / 0.03);
    const rec = this.retroceso(this.volumen);
    if (this.modo === 'manual') return;

    let pMus = 0;
    if (this.modo === 'habla') {
      // Mantener una presión estable para hablar (lo que hace el cuerpo de verdad).
      pMus = this.presionObjetivo - rec;
    } else if (this.modo === 'pausa') {
      // Retener el aire: los músculos equilibran el retroceso (sin flujo).
      pMus = -rec;
    } else if (this.modo === 'inspirar') {
      pMus = this.volumen < 4.2 ? -22 : -rec;
    } else {
      // Respiración tranquila: ~15 respiraciones por minuto.
      this.cicloT = (this.cicloT + dt) % 4;
      pMus = this.cicloT < 1.6 ? -6 * Math.sin((Math.PI * this.cicloT) / 1.6) : 0;
      if (this.volumen < 2.3) pMus = Math.min(pMus, -3);
    }
    this.aplicarPresionMuscular(pMus);
  }

  // Reparte una presión muscular entre diafragma e intercostales.
  aplicarPresionMuscular(pMus) {
    // los músculos no cambian de golpe (~30 ms)
    this.pMusSuave = (this.pMusSuave ?? pMus) + (pMus - (this.pMusSuave ?? pMus)) * this.factorSuave;
    pMus = this.pMusSuave;
    if (pMus < 0) {
      const f = Math.min(1, -pMus / (P_DIAFRAGMA * 0.7 + P_INTERCOSTALES * 0.3));
      this.diafragma = f;
      this.intercostalesExt = f * 0.8;
      this.intercostalesInt = 0;
    } else {
      this.diafragma = 0;
      this.intercostalesExt = 0;
      this.intercostalesInt = Math.min(1, pMus / P_INTERCOSTALES);
    }
  }

  presionMuscular() {
    return (
      -P_DIAFRAGMA * 0.7 * this.diafragma -
      P_INTERCOSTALES * 0.3 * this.intercostalesExt +
      P_INTERCOSTALES * this.intercostalesInt
    );
  }

  // Avanza dt segundos.
  //  areaGlotis: apertura media de la glotis (cm²)
  //  areaFaringe, areaBoca, areaNariz: estrechamientos mínimos de cada vía
  actualizar(dt, areaGlotis, areaFaringe, areaBoca, areaNariz) {
    this.controlar(dt);
    this.pPulmon = this.retroceso(this.volumen) + this.presionMuscular();

    const aGlot = enSerie(AREA_TRAQUEA, Math.max(areaGlotis, 1e-4));
    const aSup = enSerie(areaFaringe, areaBoca + areaNariz);

    // Presión en la boca: Euler implícito resuelto por bisección
    // (estable aunque la boca se abra de golpe).
    const pl = this.pPulmon;
    const p0 = this.pBoca;
    // Con la boca cerrada y la voz activa, mejillas y faringe se expanden
    // (y la laringe baja): la cavidad admite más aire y la presión sube despacio.
    const c = dt / (COMPLIANCIA_BOCA * (1 + 5 * this.expansion));
    const f = (p) => p - p0 - c * (orificio(aGlot, pl - p) - orificio(aSup, p));
    let lo = Math.min(0, pl, p0) - 1;
    let hi = Math.max(0, pl, p0) + 1;
    for (let i = 0; i < 40; i++) {
      const m = 0.5 * (lo + hi);
      if (f(m) > 0) hi = m;
      else lo = m;
    }
    const pb = 0.5 * (lo + hi);
    this.pBoca = pb;

    this.flujoGlotis = orificio(aGlot, pl - pb);
    this.flujoSalida = orificio(aSup, pb);
    const total = areaBoca + areaNariz;
    const parteBoca = total > 0 ? areaBoca / total : 0;
    this.flujoBoca = this.flujoSalida * parteBoca;
    this.flujoNariz = this.flujoSalida * (1 - parteBoca);

    this.volumen -= this.flujoGlotis * dt;
    if (this.volumen < VOL_MIN) this.volumen = VOL_MIN;
    if (this.volumen > VOL_MAX) this.volumen = VOL_MAX;
  }
}

export const LIMITES_VOLUMEN = { VOL_MIN, VOL_MAX, VOL_REPOSO };
