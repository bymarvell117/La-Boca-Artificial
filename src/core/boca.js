// La Boca Artificial: une pulmones, laringe, tracto, nariz y cajas de
// resonancia en un solo sintetizador. Funciona igual en el navegador
// (AudioWorklet) y en Node (pruebas).

import {
  N,
  NARIZ_N,
  INDICE_VELO,
  INDICE_DIENTES,
  REPOSO,
  diametrosTracto,
  diametrosNariz,
  area,
} from './anatomia.js';
import { Tracto } from './tracto.js';
import { Pulmones } from './pulmones.js';
import { Glotis, tensionAFrecuencia } from './glotis.js';
import { Resonador, Ruido, PasoAltos } from './filtros.js';

// Velocidad de cada articulador (constante de tiempo en segundos).
export const INERCIA = {
  lenguaPos: 0.06,
  lenguaAltura: 0.045,
  puntaPos: 0.03,
  puntaApertura: 0.012,
  labios: 0.018,
  mandibula: 0.05,
  velo: 0.035,
  laringe: 0.1,
  aduccion: 0.015,
  tension: 0.04,
  esfuerzo: 0.1,
  resonancia: 0.2,
  diafragma: 0.08,
  intercostales: 0.08,
};

export const VALORES_INICIALES = {
  ...REPOSO,
  labios: 0, // boca cerrada al respirar tranquilo
  velo: 1, // aire por la nariz
  aduccion: 0.1, // cuerdas separadas
  tension: 0.35,
  esfuerzo: 0.5,
  resonancia: 0.5,
  diafragma: 0,
  intercostales: 0,
};

const AREA_CM2 = 2.5;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const suave = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export class BocaArtificial {
  constructor(sr = 48000) {
    this.sr = sr;
    this.tracto = new Tracto();
    this.pulmones = new Pulmones();
    this.glotis = new Glotis(sr);
    this.ruido = new Ruido();
    this.ruidoHP = new PasoAltos(sr, 1000);
    this.aspHP = new PasoAltos(sr, 300);
    this.dcBloqueo = new PasoAltos(sr, 30);

    // Cajas de resonancia: senos paranasales (maxilar, frontal) y pecho.
    this.senoMaxilar = new Resonador(sr, 520, 4);
    this.senoFrontal = new Resonador(sr, 1150, 5);
    this.pecho = new Resonador(sr, 170, 2);
    // Tráquea: resonancias subglóticas.
    this.traquea1 = new Resonador(sr, 620, 6);
    this.traquea2 = new Resonador(sr, 1450, 7);

    this.objetivo = { ...VALORES_INICIALES };
    this.actual = { ...VALORES_INICIALES };
    this.respiracion = 'tranquila'; // tranquila | habla | inspirar | manual
    this.sinAire = false;

    this.dTracto = new Float64Array(N);
    this.dNariz = new Float64Array(NARIZ_N);

    // amplitudes (por bloque, interpoladas por muestra)
    this.amp = { voz: 0, aspiracion: 0, friccion: 0, dientes: 0 };
    this.ampPrev = { ...this.amp };
    this.iFriccion = -1;
    this.iEstrechez = -1;
    this.pBocaPrevia = 0;
    this.areaGlotisMedia = 0.5;

    this.plan = null;
    this.tPlan = 0;
    this.iPlan = 0;
    this.etiqueta = '';
    this.tiempo = 0;
    this.nivel = 0;
    this.ganancia = 4.5;
    this.salidaPrevia = 0;

    this.actualizarGeometria();
  }

  // --- Control -----------------------------------------------------------

  fijar(objetivos) {
    for (const k in objetivos) {
      if (k === 'respiracion') this.respiracion = objetivos[k];
      else if (k === 'f0') this.objetivo.tension = Math.log2(Math.max(70, objetivos.f0) / 70) / 3.5;
      else if (k in this.objetivo) this.objetivo[k] = objetivos[k];
    }
  }

  // Reproduce un plan: lista de eventos { t, objetivos, etiqueta } ordenados.
  decir(plan) {
    this.plan = plan;
    this.tPlan = 0;
    this.iPlan = 0;
  }

  parar() {
    this.plan = null;
    this.etiqueta = '';
  }

  hablando() {
    return this.plan !== null;
  }

  avanzarPlan(dt) {
    if (!this.plan) return;
    const ev = this.plan.eventos;
    while (this.iPlan < ev.length && ev[this.iPlan].t <= this.tPlan) {
      const e = ev[this.iPlan++];
      this.fijar(e.objetivos);
      if (e.etiqueta !== undefined) this.etiqueta = e.etiqueta;
    }
    this.tPlan += dt;
    if (this.iPlan >= ev.length && this.tPlan > this.plan.duracion) this.parar();
  }

  // --- Física por bloque ---------------------------------------------------

  actualizarGeometria() {
    diametrosTracto(this.actual, this.dTracto);
    diametrosNariz(this.actual.velo, this.dNariz);
    this.tracto.fijarDiametros(this.dTracto, this.dNariz);
  }

  bloqueControl(dt) {
    this.avanzarPlan(dt);

    // Inercia de los articuladores.
    const o = this.objetivo;
    const a = this.actual;
    for (const k in INERCIA) {
      const f = 1 - Math.exp(-dt / INERCIA[k]);
      a[k] += (o[k] - a[k]) * f;
      if (Math.abs(o[k] - a[k]) < 0.004) a[k] = o[k];
    }
    this.actualizarGeometria();

    // Estrechamientos de cada vía de aire.
    const d = this.dTracto;
    // (las áreas acústicas son relativas; ×2.5 da cm² aproximados)
    let faringe = Infinity;
    for (let i = 3; i < INDICE_VELO; i++) faringe = Math.min(faringe, AREA_CM2 * area(d[i]));
    let boca = Infinity;
    let iMin = -1;
    for (let i = INDICE_VELO; i < N; i++) {
      const ar = AREA_CM2 * area(d[i]);
      if (ar < boca) {
        boca = ar;
        iMin = i;
      }
    }
    let nariz = Infinity;
    for (let i = 0; i < NARIZ_N; i++) nariz = Math.min(nariz, AREA_CM2 * area(this.dNariz[i]));

    // Glotis: apertura media según la aducción (y si vibra).
    const ad = a.aduccion;
    const abierta = Math.pow(clamp((0.6 - ad) / 0.6, 0, 1), 1.5) * 1.6;
    this.areaGlotisMedia = 0.03 + abierta + this.glotis.amplitud * 0.12;

    // Pulmones
    const p = this.pulmones;
    p.modo = this.respiracion;
    if (this.respiracion === 'manual') {
      p.diafragma = a.diafragma;
      p.intercostalesExt = Math.max(0, -a.intercostales);
      p.intercostalesInt = Math.max(0, a.intercostales);
    }
    p.presionObjetivo = 4 + 8 * a.esfuerzo;
    // Si se queda sin aire hablando, toma aire (como haría una persona).
    if (this.respiracion === 'habla' && p.volumen < 1.7) {
      this.respiracion = 'inspirar';
      this.sinAire = true;
    }
    if (this.sinAire && (this.respiracion !== 'inspirar' || p.volumen > 3.8)) {
      if (this.respiracion === 'inspirar') this.respiracion = 'habla';
      this.sinAire = false;
    }
    p.actualizar(dt, this.areaGlotisMedia, faringe, boca, nariz);

    // Fuente de voz: necesita cuerdas juntas y presión a través de la glotis.
    const dP = p.pPulmon - p.pBoca;
    const juntas = suave(0.45, 0.62, ad);
    const voz = juntas * clamp((dP - 1.5) / 7, 0, 1.4);

    // Aspiración (aire turbulento en la glotis): más con la glotis abierta.
    const velGlotis = Math.abs(p.flujoGlotis) / Math.max(0.05, this.areaGlotisMedia);
    const aspiracion = clamp(velGlotis * 0.05, 0, 0.6) * (1 - 0.7 * juntas) + 0.04 * voz;

    // Fricación: turbulencia en el punto más estrecho de la boca.
    let friccion = 0;
    let dientes = 0;
    if (boca > 0 && boca < 0.6) {
      // Turbulencia: crece con la velocidad² del chorro y con su grosor.
      const vel = Math.abs(p.flujoBoca) / boca; // L/s por cm²  (×10 = m/s)
      friccion = clamp(1.8 * (vel * vel - 0.5) * Math.sqrt(boca), 0, 1.2) * suave(0.6, 0.05, boca);
      // Sibilantes: la punta lanza el chorro contra los dientes.
      if (iMin >= 32 && iMin <= 37) dientes = friccion * 0.25;
      // Labiodental (f): el labio inferior roza los dientes de arriba.
      if (iMin >= 40) dientes = friccion * 0.3;
      if (p.flujoBoca < 0) friccion *= 0.3; // inhalar por la boca suena suave
    }

    // Explosión: al abrir un cierre, la presión acumulada sale de golpe.
    const caida = this.pBocaPrevia - p.pBoca;
    this.pBocaPrevia = p.pBoca;
    if (caida > 0.3 && boca > 0) friccion += clamp(caida * 0.5, 0, 1.5);

    this.ampPrev = { ...this.amp };
    this.amp = { voz, aspiracion, friccion, dientes };
    // El ruido nace donde el chorro choca con el tubo ya ensanchado.
    let iRuido = iMin;
    if (iMin >= 0) {
      const umbral = Math.max(0.5, 3 * d[iMin]);
      while (iRuido < N - 2 && d[iRuido] < umbral) iRuido++;
    }
    this.iFriccion = iRuido;
    this.iEstrechez = iMin;
  }

  // --- Audio -----------------------------------------------------------------

  // Llena `salida` (Float32Array) con muestras.
  procesar(salida) {
    const n = salida.length;
    const dt = n / this.sr;
    this.bloqueControl(dt);

    const a0 = this.ampPrev;
    const a1 = this.amp;
    const f0 = tensionAFrecuencia(this.actual.tension) * (1 + 0.08 * (this.actual.laringe - 0.5));
    const res = this.actual.resonancia;
    const glot = this.glotis;
    const tr = this.tracto;
    const apertura = 1 - this.actual.aduccion;
    let energia = 0;

    for (let i = 0; i < n; i++) {
      const t = (i + 1) / n;
      const voz = a0.voz + (a1.voz - a0.voz) * t;
      const asp = a0.aspiracion + (a1.aspiracion - a0.aspiracion) * t;
      const fri = a0.friccion + (a1.friccion - a0.friccion) * t;
      const die = a0.dientes + (a1.dientes - a0.dientes) * t;

      const { deriv, flujo } = glot.muestra(f0, voz, this.actual.aduccion);

      // Aspiración modulada por el ciclo glotal, coloreada por la tráquea.
      let ruidoAsp = this.aspHP.paso(this.ruido.blanco()) * asp * (0.4 + 0.6 * (voz > 0.05 ? flujo : 1));
      ruidoAsp += (this.traquea1.paso(ruidoAsp) + this.traquea2.paso(ruidoAsp)) * apertura * 0.8;

      // Pecho: resonancia grave de la voz.
      const fuente = deriv + this.pecho.paso(deriv) * res * 0.4 + ruidoAsp * 0.15;

      const blanco = this.ruidoHP.paso(this.ruido.blanco());
      const ruidoF = blanco * fri * 0.012;
      const ruidoD = blanco * die * 0.02;

      tr.paso(fuente, ruidoF, this.iFriccion, ruidoD, INDICE_DIENTES);
      let labios = tr.salidaLabios;
      let nariz = tr.salidaNariz;
      tr.paso(fuente, ruidoF, this.iFriccion, ruidoD, INDICE_DIENTES);
      labios = 0.5 * (labios + tr.salidaLabios);
      nariz = 0.5 * (nariz + tr.salidaNariz);

      // Senos paranasales: cavidades que resuenan con el sonido nasal.
      nariz += (this.senoMaxilar.paso(nariz) + this.senoFrontal.paso(nariz)) * res * 0.6;

      // Radiación: al salir al aire libre el sonido gana agudos (≈ derivada).
      const sal = labios + nariz * 0.45; // las narinas radian menos que la boca
      const radiado = sal - 0.97 * this.salidaPrevia;
      this.salidaPrevia = sal;

      let s = this.dcBloqueo.paso(radiado) * this.ganancia;
      s = Math.tanh(s); // limitador suave
      salida[i] = s;
      energia += s * s;
    }
    this.nivel = Math.sqrt(energia / n);
    this.tiempo += dt;
  }

  // Estado para dibujar.
  instantanea() {
    const p = this.pulmones;
    return {
      actual: { ...this.actual },
      dTracto: Array.from(this.dTracto),
      dNariz: Array.from(this.dNariz),
      aperturaGlotis: this.glotis.apertura,
      areaGlotis: this.areaGlotisMedia,
      vibracion: this.amp.voz,
      f0: this.glotis.f0,
      volumen: p.volumen,
      pPulmon: p.pPulmon,
      pBoca: p.pBoca,
      flujoGlotis: p.flujoGlotis,
      flujoBoca: p.flujoBoca,
      flujoNariz: p.flujoNariz,
      diafragma: p.diafragma,
      intercostalesExt: p.intercostalesExt,
      intercostalesInt: p.intercostalesInt,
      friccion: this.amp.friccion + this.amp.dientes,
      iFriccion: this.iEstrechez,
      respiracion: this.respiracion,
      etiqueta: this.etiqueta,
      hablando: this.hablando(),
      nivel: this.nivel,
    };
  }
}
