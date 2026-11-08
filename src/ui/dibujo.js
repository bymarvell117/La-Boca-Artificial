// Dibujo del aparato fonador en corte sagital (de perfil, mirando a la derecha).
// Todo se dibuja con código a partir del estado de la simulación.

import { N, NARIZ_N, INDICE_VELO, INDICE_DIENTES } from '../core/anatomia.js';

const ANCHO = 640;
const ALTO = 880;
const ESCALA_D = 16; // px por unidad de diámetro
const PARED = 13; // grosor fijo hacia la pared posterior/superior

// ---------- Geometría --------------------------------------------------------

function polilineaPorLongitud(puntos, n) {
  // Reparte n+1 puntos a igual distancia sobre una polilínea.
  const largos = [0];
  for (let i = 1; i < puntos.length; i++) {
    largos.push(largos[i - 1] + Math.hypot(puntos[i][0] - puntos[i - 1][0], puntos[i][1] - puntos[i - 1][1]));
  }
  const total = largos[largos.length - 1];
  const out = [];
  let j = 1;
  for (let k = 0; k <= n; k++) {
    const s = (total * k) / n;
    while (j < largos.length - 1 && largos[j] < s) j++;
    const t = (s - largos[j - 1]) / (largos[j] - largos[j - 1] || 1);
    const [x0, y0] = puntos[j - 1];
    const [x1, y1] = puntos[j];
    out.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
  }
  return out;
}

function conNormales(pts) {
  // normal hacia la pared fija (atrás en la faringe, arriba en la boca)
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return { x: p[0], y: p[1], nx: dy / l, ny: -dx / l };
  });
}

function construirGeometria() {
  // Línea media del tracto: glotis → faringe → curva → boca → labios.
  const linea = [[300, 470], [300, 350]];
  for (let k = 1; k <= 12; k++) {
    const a = Math.PI + (Math.PI / 2) * (k / 12);
    linea.push([350 + 50 * Math.cos(a), 350 + 50 * Math.sin(a)]);
  }
  linea.push([512, 300]);
  // Centros de segmento (N) y de unión (N+1)
  const uniones = conNormales(polilineaPorLongitud(linea, N));

  // Cavidad nasal: desde la puerta del velo, sube por la nasofaringe y sale por la narina.
  const pv = uniones[INDICE_VELO];
  const inicioNariz = [pv.x + pv.nx * (PARED + 6), pv.y + pv.ny * (PARED + 6)];
  const nariz = conNormales(
    polilineaPorLongitud(
      [inicioNariz, [298, 262], [330, 228], [400, 214], [470, 220], [515, 238], [548, 262]],
      NARIZ_N,
    ),
  );

  // Camino de la tráquea (pulmones → glotis)
  const traquea = polilineaPorLongitud([[300, 640], [300, 470]], 20);
  return { uniones, nariz, traquea };
}

const G = construirGeometria();

// ---------- Paleta ------------------------------------------------------------

function leerPaleta() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  return {
    fondo: v('--lienzo'),
    piel: v('--piel'),
    pielBorde: v('--piel-borde'),
    mucosa: v('--mucosa'),
    mucosaOscura: v('--mucosa-oscura'),
    aire: v('--aire'),
    hueso: v('--hueso'),
    diente: v('--diente'),
    lengua: v('--lengua'),
    labio: v('--labio'),
    pulmon: v('--pulmon'),
    musculo: v('--musculo'),
    cartilago: v('--cartilago'),
    texto: v('--texto'),
    textoSuave: v('--texto-suave'),
    acento: v('--acento'),
    presion: v('--presion'),
    particula: v('--particula'),
  };
}

// ---------- Dibujante -----------------------------------------------------------

export class Dibujo {
  constructor(lienzo) {
    this.lienzo = lienzo;
    this.ctx = lienzo.getContext('2d');
    this.paleta = leerPaleta();
    this.mostrarNombres = true;
    this.particulas = [];
    this.ultimo = performance.now();
    this.ajustar();
    new ResizeObserver(() => this.ajustar()).observe(lienzo);
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener?.('change', () => (this.paleta = leerPaleta()));
  }

  refrescarPaleta() {
    this.paleta = leerPaleta();
  }

  ajustar() {
    const r = this.lienzo.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.lienzo.width = Math.max(1, Math.round(r.width * dpr));
    this.lienzo.height = Math.max(1, Math.round(r.height * dpr));
    const s = Math.min(this.lienzo.width / ANCHO, this.lienzo.height / ALTO);
    this.escala = s;
    this.dx = (this.lienzo.width - ANCHO * s) / 2;
    this.dy = (this.lienzo.height - ALTO * s) / 2;
  }

  // Paredes del tracto según los diámetros.
  paredes(e) {
    const fija = [];
    const movil = [];
    const u = G.uniones;
    for (let i = 0; i <= N; i++) {
      const d = e.dTracto[Math.min(N - 1, i)] * ESCALA_D;
      const p = u[i];
      // Labios: se abren simétricos; el resto: la pared de atrás/arriba es fija.
      const t = Math.min(1, Math.max(0, (i - 39) / 3));
      const arriba = PARED * (1 - t) + (d / 2) * t;
      const abajo = (PARED - d) * (1 - t) + (-d / 2) * t;
      fija.push([p.x + p.nx * arriba, p.y + p.ny * arriba]);
      movil.push([p.x + p.nx * abajo, p.y + p.ny * abajo]);
    }
    return { fija, movil };
  }

  dibujar(e) {
    const ahora = performance.now();
    const dt = Math.min(0.05, (ahora - this.ultimo) / 1000);
    this.ultimo = ahora;

    const c = this.ctx;
    const P = this.paleta;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = P.fondo;
    c.fillRect(0, 0, this.lienzo.width, this.lienzo.height);
    c.setTransform(this.escala, 0, 0, this.escala, this.dx, this.dy);

    const w = this.paredes(e);
    this.torso(e);
    this.cabeza(e);
    this.nariz(e);
    this.senos(e);
    this.tracto(e, w);
    this.lengua(e, w);
    this.paladar(e, w);
    this.velo(e, w);
    this.dientesYLabios(e, w);
    this.laringe(e);
    this.aire(e, dt);
    this.cuerdasArriba(e);
    if (this.mostrarNombres) this.nombres(e, w);
    this.fonemaActual(e);
  }

  // --- Partes -----------------------------------------------------------------

  ruta(puntos, cerrar = false) {
    const c = this.ctx;
    c.beginPath();
    puntos.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    if (cerrar) c.closePath();
  }

  torso(e) {
    const c = this.ctx;
    const P = this.paleta;
    // Cuello y tronco
    c.fillStyle = P.piel;
    c.strokeStyle = P.pielBorde;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(230, 420);
    c.bezierCurveTo(232, 470, 236, 520, 200, 560);
    c.bezierCurveTo(150, 575, 80, 590, 70, 640);
    c.lineTo(66, ALTO);
    c.lineTo(574, ALTO);
    c.lineTo(570, 640);
    c.bezierCurveTo(560, 590, 480, 575, 430, 560);
    c.bezierCurveTo(410, 530, 420, 470, 440, 420);
    c.closePath();
    c.fill();
    c.stroke();

    // Pulmones (se inflan con el volumen)
    const v = e.volumen;
    const s = 0.82 + 0.25 * ((v - 1.2) / 4.8);
    const tono = Math.min(1, Math.abs(e.pPulmon) / 15);
    const diaf = e.diafragma;
    const baseY = 800 + 26 * diaf;
    for (const lado of [-1, 1]) {
      c.save();
      c.translate(320 + lado * 95, 620);
      c.scale(s * (lado < 0 ? -1 : 1), s);
      c.beginPath();
      c.moveTo(-10, 0);
      c.bezierCurveTo(-60, 10, -95, 90, -100, (baseY - 620) / s - 10);
      c.quadraticCurveTo(-50, (baseY - 640) / s, 18, (baseY - 625) / s);
      c.bezierCurveTo(-5, 120, 0, 40, -10, 0);
      c.closePath();
      c.fillStyle = P.pulmon;
      c.globalAlpha = 0.85;
      c.fill();
      c.globalAlpha = 1;
      if (tono > 0.05) {
        c.fillStyle = e.pPulmon > 0 ? P.presion : P.aire;
        c.globalAlpha = tono * 0.35;
        c.fill();
        c.globalAlpha = 1;
      }
      c.strokeStyle = P.mucosaOscura;
      c.lineWidth = 1.5 / s;
      c.stroke();
      c.restore();
    }

    // Tráquea con anillos y bronquios
    c.strokeStyle = P.cartilago;
    c.fillStyle = P.mucosa;
    c.fillRect(291, 505, 18, 120);
    c.lineWidth = 2;
    for (let y = 510; y < 622; y += 9) {
      c.beginPath();
      c.moveTo(289, y);
      c.lineTo(311, y);
      c.stroke();
    }
    c.lineWidth = 9;
    c.strokeStyle = P.mucosa;
    c.lineCap = 'round';
    for (const lado of [-1, 1]) {
      c.beginPath();
      c.moveTo(300, 622);
      c.quadraticCurveTo(300 + lado * 20, 640, 300 + lado * 55, 668);
      c.stroke();
    }
    c.lineCap = 'butt';

    // Costillas e intercostales: se separan al inspirar y se juntan al espirar.
    const sep = 1 + 0.18 * e.intercostalesExt - 0.12 * e.intercostalesInt + 0.05 * ((v - 2.5) / 2);
    for (let k = 0; k < 6; k++) {
      const y = 600 + k * 30 * sep;
      for (const lado of [-1, 1]) {
        c.beginPath();
        c.moveTo(320 + lado * 22, y);
        c.bezierCurveTo(320 + lado * 120, y - 22, 320 + lado * 205, y + 4, 320 + lado * 225, y + 40);
        c.strokeStyle = P.hueso;
        c.lineWidth = 6;
        c.globalAlpha = 0.7;
        c.stroke();
        c.globalAlpha = 1;
        // músculo intercostal entre costillas
        if (k < 5) {
          const act = Math.max(e.intercostalesExt, e.intercostalesInt);
          c.strokeStyle = P.musculo;
          c.globalAlpha = 0.25 + 0.6 * act;
          c.lineWidth = 2;
          for (let m = 0; m < 4; m++) {
            const x = 320 + lado * (70 + m * 35);
            c.beginPath();
            c.moveTo(x, y + 6 - m * 1);
            c.lineTo(x + lado * 10, y + 30 * sep - 6);
            c.stroke();
          }
          c.globalAlpha = 1;
        }
      }
    }

    // Diafragma: cúpula que baja y se aplana al contraerse.
    const cima = 770 + 34 * diaf;
    c.beginPath();
    c.moveTo(96, 860);
    c.bezierCurveTo(110, cima - 30 + 25 * diaf, 250, cima - 10, 320, cima);
    c.bezierCurveTo(390, cima - 10, 530, cima - 30 + 25 * diaf, 544, 860);
    c.lineTo(544, 872);
    c.bezierCurveTo(530, cima - 14 + 25 * diaf, 390, cima + 6, 320, cima + 16);
    c.bezierCurveTo(250, cima + 6, 110, cima - 14 + 25 * diaf, 96, 872);
    c.closePath();
    c.fillStyle = P.musculo;
    c.globalAlpha = 0.45 + 0.5 * diaf;
    c.fill();
    c.globalAlpha = 1;
  }

  cabeza() {
    const c = this.ctx;
    const P = this.paleta;
    c.fillStyle = P.piel;
    c.strokeStyle = P.pielBorde;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(230, 430); // nuca
    c.bezierCurveTo(160, 380, 140, 250, 170, 160);
    c.bezierCurveTo(200, 70, 300, 30, 400, 45);
    c.bezierCurveTo(470, 55, 500, 100, 505, 150); // frente
    c.bezierCurveTo(507, 175, 515, 190, 525, 205);
    c.lineTo(556, 258); // dorso de la nariz
    c.quadraticCurveTo(560, 270, 545, 272); // punta
    c.lineTo(530, 276);
    c.quadraticCurveTo(528, 286, 530, 290); // surco nasolabial / labio superior
    c.lineTo(530, 330);
    c.quadraticCurveTo(532, 370, 505, 392); // mentón
    c.bezierCurveTo(470, 410, 440, 410, 430, 425);
    c.lineTo(440, 430);
    c.closePath();
    c.fill();
    c.stroke();
    // oreja
    c.beginPath();
    c.ellipse(255, 245, 16, 26, -0.15, 0, Math.PI * 2);
    c.strokeStyle = P.pielBorde;
    c.globalAlpha = 0.6;
    c.stroke();
    c.globalAlpha = 1;
  }

  nariz(e) {
    const c = this.ctx;
    const P = this.paleta;
    const n = G.nariz;
    const arriba = [];
    const abajo = [];
    for (let i = 0; i < n.length; i++) {
      const d = (i === 0 ? Math.max(0.35, e.dNariz[0]) : e.dNariz[Math.min(NARIZ_N - 1, i)]) * 12;
      arriba.push([n[i].x + (n[i].nx * d) / 2, n[i].y + (n[i].ny * d) / 2]);
      abajo.push([n[i].x - (n[i].nx * d) / 2, n[i].y - (n[i].ny * d) / 2]);
    }
    // tejido alrededor
    c.lineJoin = 'round';
    c.strokeStyle = P.mucosaOscura;
    c.lineWidth = 2;
    this.ruta([...arriba, ...abajo.reverse()], true);
    c.fillStyle = P.mucosa;
    c.fill();
    c.stroke();
    // aire dentro
    const flujo = Math.abs(e.flujoNariz);
    if (flujo > 0.02) {
      c.globalAlpha = Math.min(0.5, flujo);
      c.fillStyle = P.aire;
      c.fill();
      c.globalAlpha = 1;
    }
    // cornetes
    c.strokeStyle = P.mucosaOscura;
    c.lineWidth = 3;
    for (const [x, y] of [[380, 222], [420, 230], [455, 236]]) {
      c.beginPath();
      c.arc(x, y, 7, Math.PI * 0.1, Math.PI * 0.9);
      c.stroke();
    }
  }

  senos(e) {
    // Cajas de resonancia: senos frontal y maxilar.
    const c = this.ctx;
    const P = this.paleta;
    const brillo = e.actual.resonancia * Math.min(1, e.flujoNariz > 0 ? e.nivel * 8 + 0.2 : 0.2);
    const senos = [
      [470, 118, 22, 14],
      [430, 258, 26, 15],
    ];
    for (const [x, y, rx, ry] of senos) {
      c.beginPath();
      c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      c.fillStyle = P.aire;
      c.globalAlpha = 0.25 + 0.6 * brillo;
      c.fill();
      c.globalAlpha = 1;
      c.setLineDash([4, 3]);
      c.strokeStyle = P.mucosaOscura;
      c.lineWidth = 1.5;
      c.stroke();
      c.setLineDash([]);
    }
  }

  tracto(e, w) {
    const c = this.ctx;
    const P = this.paleta;
    // Tejido posterior (pared de la faringe) y superior.
    const fuera = G.uniones.map((p) => [p.x + p.nx * (PARED + 26), p.y + p.ny * (PARED + 26)]);
    c.fillStyle = P.mucosa;
    this.ruta([...w.fija.slice(0, INDICE_VELO + 1), ...fuera.slice(0, INDICE_VELO + 1).reverse()], true);
    c.fill();

    // Aire del tracto, coloreado por la presión en la boca.
    this.ruta([...w.fija, ...w.movil.slice().reverse()], true);
    c.fillStyle = P.mucosaOscura;
    c.fill();
    c.fillStyle = P.aire;
    c.globalAlpha = 0.35;
    c.fill();
    c.globalAlpha = 1;
    const pres = Math.min(1, Math.max(0, e.pBoca) / 8);
    if (pres > 0.05) {
      c.fillStyle = P.presion;
      c.globalAlpha = pres * 0.6;
      c.fill();
      c.globalAlpha = 1;
    }
    // Punto de turbulencia
    if (e.friccion > 0.05 && e.iFriccion >= 0) {
      const p = G.uniones[e.iFriccion];
      const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, 16);
      g.addColorStop(0, P.presion);
      g.addColorStop(1, 'transparent');
      c.fillStyle = g;
      c.globalAlpha = Math.min(1, e.friccion);
      c.beginPath();
      c.arc(p.x, p.y, 16, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = 1;
    }
    c.strokeStyle = P.mucosaOscura;
    c.lineWidth = 2;
    this.ruta(w.fija.slice(0, INDICE_VELO + 1));
    c.stroke();
  }

  lengua(e, w) {
    const c = this.ctx;
    const P = this.paleta;
    const sup = w.movil.slice(5, 38);
    const jaw = e.actual.mandibula;
    // Base de la lengua y suelo de la boca (bajan con la mandíbula).
    const suelo = [
      [w.movil[37][0] + 4, w.movil[37][1] + 14 + jaw * 6],
      [430, 360 + jaw * 22],
      [370, 395 + jaw * 14],
      [325, 410],
      [w.movil[5][0] + 10, w.movil[5][1] + 6],
    ];
    this.ruta([...sup, ...suelo], true);
    c.fillStyle = P.lengua;
    c.fill();
    c.strokeStyle = P.mucosaOscura;
    c.lineWidth = 1.5;
    c.stroke();
    // fibras musculares
    c.strokeStyle = P.mucosaOscura;
    c.globalAlpha = 0.2;
    for (let k = 8; k < 36; k += 4) {
      c.beginPath();
      c.moveTo(w.movil[k][0], w.movil[k][1]);
      c.lineTo(360 + (k - 20) * 2, 395);
      c.stroke();
    }
    c.globalAlpha = 1;
  }

  paladar(e, w) {
    // Paladar duro: hueso fijo encima de la boca, separa boca y nariz.
    const c = this.ctx;
    const P = this.paleta;
    const a = 25;
    const b = 38;
    const abajo = w.fija.slice(a, b);
    const u = G.uniones;
    const arriba = [];
    for (let i = b - 1; i >= a; i--) arriba.push([u[i].x + u[i].nx * (PARED + 9), u[i].y + u[i].ny * (PARED + 9)]);
    this.ruta([...abajo, ...arriba], true);
    c.fillStyle = P.hueso;
    c.fill();
    c.strokeStyle = P.pielBorde;
    c.lineWidth = 1;
    c.stroke();
  }

  velo(e, w) {
    // Paladar blando: sube para cerrar la nariz o baja para abrirla.
    const c = this.ctx;
    const P = this.paleta;
    const v = e.actual.velo;
    const raiz = w.fija[25];
    const base = G.uniones[INDICE_VELO];
    // punta: cerrado → contra la pared de atrás; abierto → cuelga hacia la lengua
    const cerrado = [base.x + base.nx * (PARED + 8), base.y + base.ny * (PARED + 8)];
    const abierto = [base.x + 18, base.y + 16];
    const punta = [cerrado[0] + (abierto[0] - cerrado[0]) * v, cerrado[1] + (abierto[1] - cerrado[1]) * v];
    c.beginPath();
    c.moveTo(raiz[0], raiz[1] - 8);
    c.quadraticCurveTo((raiz[0] + punta[0]) / 2, Math.min(raiz[1], punta[1]) - 14, punta[0], punta[1] - 4);
    c.lineTo(punta[0] + 3, punta[1] + 6); // úvula
    c.quadraticCurveTo((raiz[0] + punta[0]) / 2 + 6, raiz[1] + 2, raiz[0], raiz[1] + 2);
    c.closePath();
    c.fillStyle = P.mucosaOscura;
    c.fill();
  }

  dientesYLabios(e, w) {
    const c = this.ctx;
    const P = this.paleta;
    const i = INDICE_DIENTES;
    const u = G.uniones[i];
    // incisivo superior (fijo) e inferior (se mueve con la mandíbula)
    const sup = w.fija[i];
    const inf = w.movil[i];
    const dir = [-u.nx, -u.ny];
    const diente = (p, d, largo) => {
      c.beginPath();
      c.moveTo(p[0] - 4, p[1]);
      c.lineTo(p[0] + d[0] * largo - 1, p[1] + d[1] * largo);
      c.lineTo(p[0] + 5, p[1]);
      c.closePath();
      c.fillStyle = P.diente;
      c.fill();
      c.strokeStyle = P.pielBorde;
      c.lineWidth = 1;
      c.stroke();
    };
    diente([sup[0], sup[1] - 6], dir, 16);
    diente([inf[0], inf[1] + 6], [u.nx, u.ny], 14);

    // Labios: dos almohadillas en la salida.
    const lab = e.dTracto[N - 1] * ESCALA_D;
    const fin = G.uniones[N];
    const y0 = fin.y;
    c.fillStyle = P.labio;
    c.beginPath();
    c.ellipse(fin.x + 4, y0 - lab / 2 - 7, 14, 8, -0.2, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.ellipse(fin.x + 2, y0 + lab / 2 + 8, 13, 9, 0.2, 0, Math.PI * 2);
    c.fill();
  }

  laringe(e) {
    const c = this.ctx;
    const P = this.paleta;
    const altura = (e.actual.laringe - 0.5) * -14;
    c.save();
    c.translate(0, altura);
    // cartílago tiroides (nuez)
    c.beginPath();
    c.moveTo(318, 455);
    c.quadraticCurveTo(345, 470, 335, 505);
    c.lineTo(318, 505);
    c.closePath();
    c.fillStyle = P.cartilago;
    c.fill();
    // epiglotis
    c.beginPath();
    c.moveTo(316, 455);
    c.quadraticCurveTo(326, 430, 318, 410);
    c.quadraticCurveTo(312, 432, 312, 455);
    c.fillStyle = P.cartilago;
    c.fill();
    // cuerdas vocales vistas de lado
    const ab = Math.min(12, e.areaGlotis * 6 + e.aperturaGlotis * e.vibracion * 6);
    c.fillStyle = P.musculo;
    c.fillRect(283, 476, 17 - ab / 2, 5);
    c.fillRect(300 + ab / 2, 476, 17 - ab / 2, 5);
    c.restore();
  }

  // Partículas de aire: muestran la entrada y salida del aire.
  aire(e, dt) {
    const c = this.ctx;
    const P = this.paleta;
    const total = Math.abs(e.flujoGlotis);
    const sale = e.flujoGlotis >= 0;
    const tasa = Math.min(120, total * 160);
    this.acum = (this.acum || 0) + tasa * dt;
    while (this.acum > 1) {
      this.acum -= 1;
      const via = Math.random() * (Math.abs(e.flujoBoca) + Math.abs(e.flujoNariz) + 1e-6) < Math.abs(e.flujoNariz) ? 'nariz' : 'boca';
      this.particulas.push({ s: sale ? 0 : 1, via, desvio: (Math.random() - 0.5) * 8 });
    }
    const vel = Math.min(1.6, 0.25 + total * 1.2) * dt * (sale ? 1 : -1);
    this.particulas = this.particulas.filter((p) => p.s >= 0 && p.s <= 1).slice(-160);
    c.fillStyle = P.particula;
    for (const p of this.particulas) {
      p.s += vel;
      const pt = this.puntoCamino(p.s, p.via, e);
      if (!pt) continue;
      c.globalAlpha = 0.75;
      c.beginPath();
      c.arc(pt[0] + p.desvio * pt[2], pt[1] + p.desvio * pt[3], 2.2, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
  }

  // Punto sobre el camino del aire (0 = pulmones, 1 = fuera).
  puntoCamino(s, via, e) {
    const tr = G.traquea;
    const u = G.uniones;
    const caminos = via === 'nariz'
      ? [...tr, ...u.slice(0, INDICE_VELO).map((p) => [p.x + p.nx * 4, p.y + p.ny * 4]), ...G.nariz.map((p) => [p.x, p.y]), [575, 290]]
      : [...tr, ...u.map((p, i) => {
        const d = e.dTracto[Math.min(N - 1, i)] * ESCALA_D;
        return [p.x + p.nx * (PARED - d / 2) * (i < 40 ? 1 : 0), p.y + p.ny * (PARED - d / 2) * (i < 40 ? 1 : 0)];
      }), [560, 300]];
    const k = Math.max(0, Math.min(caminos.length - 1.001, s * (caminos.length - 1)));
    const i = Math.floor(k);
    const t = k - i;
    const a = caminos[i];
    const b = caminos[i + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [a[0] + dx * t, a[1] + dy * t, dy / l, -dx / l];
  }

  // Recuadro: cuerdas vocales vistas desde arriba.
  cuerdasArriba(e) {
    const c = this.ctx;
    const P = this.paleta;
    const cx = 92;
    const cy = 96;
    const r = 66;
    c.save();
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fillStyle = P.mucosaOscura;
    c.fill();
    c.clip();
    // apertura: media (aducción) + vibración instantánea
    const ap = Math.min(1, e.areaGlotis / 1.6 + e.aperturaGlotis * e.vibracion * 0.35);
    const ang = 0.04 + ap * 0.42;
    const delante = [cx, cy - 46];
    for (const lado of [-1, 1]) {
      c.beginPath();
      c.moveTo(delante[0], delante[1]);
      c.lineTo(cx + lado * Math.sin(ang) * 92, cy - 46 + Math.cos(ang) * 92);
      c.lineTo(cx + lado * 60, cy + 50);
      c.lineTo(cx + lado * 60, cy - 60);
      c.closePath();
      c.fillStyle = P.mucosa;
      c.fill();
      // borde blanco de la cuerda
      c.beginPath();
      c.moveTo(delante[0], delante[1]);
      c.lineTo(cx + lado * Math.sin(ang) * 92, cy - 46 + Math.cos(ang) * 92);
      c.strokeStyle = P.diente;
      c.lineWidth = 5;
      c.stroke();
    }
    c.restore();
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.strokeStyle = P.pielBorde;
    c.lineWidth = 2;
    c.stroke();
    let estado = 'Abiertas (respirar)';
    if (e.vibracion > 0.08) estado = 'Vibrando (voz)';
    else if (e.actual.aduccion > 0.55) estado = 'Cerradas';
    else if (e.actual.aduccion > 0.25) estado = 'Entreabiertas (sorda)';
    c.fillStyle = P.texto;
    c.font = '600 12px system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillText('Cuerdas vocales', cx, cy + r + 16);
    c.fillStyle = P.textoSuave;
    c.font = '12px system-ui, sans-serif';
    c.fillText(estado, cx, cy + r + 31);
  }

  nombres(e, w) {
    const c = this.ctx;
    const P = this.paleta;
    const u = G.uniones;
    const n = G.nariz;
    const etiquetas = [
      ['Fosas nasales', [n[14].x, n[14].y], [470, 178]],
      ['Senos (cajas de resonancia)', [462, 112], [410, 84]],
      ['Paladar duro', w.fija[30], [400, 268], 'arriba'],
      ['Velo del paladar', w.fija[21], [208, 300]],
      ['Lengua', w.movil[24], [370, 380]],
      ['Dientes', w.fija[INDICE_DIENTES], [574, 314]],
      ['Labios', [u[N].x + 6, u[N].y], [574, 338]],
      ['Faringe (garganta)', w.fija[10], [212, 380]],
      ['Laringe', [325, 480], [395, 470]],
      ['Tráquea', [300, 560], [212, 560]],
      ['Pulmones', [212, 700], [130, 650]],
      ['Músculos intercostales', [470, 650], [478, 600]],
      ['Diafragma', [320, 790 + 34 * e.diafragma], [430, 846]],
    ];
    c.font = '12px system-ui, sans-serif';
    c.lineWidth = 1;
    for (const [texto, p, l] of etiquetas) {
      c.strokeStyle = P.textoSuave;
      c.globalAlpha = 0.7;
      c.beginPath();
      c.moveTo(p[0], p[1]);
      c.lineTo(l[0], l[1]);
      c.stroke();
      c.globalAlpha = 1;
      c.beginPath();
      c.arc(p[0], p[1], 2.5, 0, Math.PI * 2);
      c.fillStyle = P.acento;
      c.fill();
      c.textAlign = l[0] < p[0] ? 'right' : 'left';
      const tx = l[0] + (l[0] < p[0] ? -4 : 4);
      c.fillStyle = P.fondo;
      c.globalAlpha = 0.75;
      const ancho = c.measureText(texto).width;
      c.fillRect(c.textAlign === 'right' ? tx - ancho - 2 : tx - 2, l[1] - 10, ancho + 4, 15);
      c.globalAlpha = 1;
      c.fillStyle = P.texto;
      c.fillText(texto, tx, l[1] + 1);
    }
    // entrada/salida de aire
    const fl = e.flujoBoca + e.flujoNariz;
    if (Math.abs(fl) > 0.03) {
      c.fillStyle = P.acento;
      c.font = '600 12px system-ui, sans-serif';
      c.textAlign = 'left';
      c.fillText(fl > 0 ? 'Sale aire →' : '← Entra aire', 546, e.flujoNariz > Math.abs(e.flujoBoca) ? 240 : 285);
    }
  }

  fonemaActual(e) {
    if (!e.etiqueta || e.etiqueta === 'inspira') return;
    const c = this.ctx;
    const P = this.paleta;
    c.font = '700 44px system-ui, sans-serif';
    c.textAlign = 'right';
    c.fillStyle = P.acento;
    c.fillText('/' + e.etiqueta + '/', 620, 54);
  }
}
