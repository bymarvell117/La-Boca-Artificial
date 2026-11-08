// Aparato fonador en 3D (Three.js) con formas orgánicas modeladas por código.
// Cada cuadro se actualiza con el estado de la simulación: el tubo de aire,
// la lengua, el velo y la úvula, la mandíbula, los labios, las cuerdas
// vocales, los pulmones, las costillas y el diafragma se mueven según la física.
//
// Unidades: centímetros. Ejes: x hacia delante (cara), y hacia arriba,
// z lateral. El origen está en la glotis.

import * as THREE from 'three';
import { OrbitControls } from '../../vendor/OrbitControls.js';
import { RoomEnvironment } from '../../vendor/RoomEnvironment.js';
import { N, NARIZ_N, INDICE_VELO } from '../core/anatomia.js';
import {
  Anillos, tubo, elipse, esferaDeformada, pintar, moteado, mezcla, fbm, gauss, lerp, limitar, azar, fusionar,
} from './organico.js';

const K = 1.0; // cm de alto de la vía por unidad de diámetro de la simulación
const PARED = 0.9; // distancia de la línea media a la pared fija
const RADIAL = 18; // vértices por anillo del tubo de aire
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------- Línea media del tracto ------------------------------------------

function lineaTracto() {
  // vertical (faringe) → curva → horizontal (boca), 16.6 cm en total
  const L1 = 6.5;
  const R = 2;
  const L2 = Math.PI;
  const L3 = 7;
  const total = L1 + L2 + L3;
  const puntos = [];
  for (let k = 0; k <= N; k++) {
    const s = (total * k) / N;
    let x;
    let y;
    let tx;
    let ty;
    if (s <= L1) {
      x = 0; y = s; tx = 0; ty = 1;
    } else if (s <= L1 + L2) {
      const th = Math.PI - (s - L1) / R;
      x = 2 + R * Math.cos(th);
      y = L1 + R * Math.sin(th);
      tx = Math.sin(th); ty = -Math.cos(th);
    } else {
      x = 2 + (s - L1 - L2); y = L1 + R; tx = 1; ty = 0;
    }
    puntos.push({ x, y, nx: -ty, ny: tx });
  }
  return puntos;
}

const TR = lineaTracto();

// Punto del tracto en un índice fraccionario.
function puntoTR(kf) {
  const i = Math.max(0, Math.min(N - 1, Math.floor(kf)));
  const f = Math.max(0, Math.min(1, kf - i));
  const a = TR[i];
  const b = TR[i + 1];
  const nx = lerp(a.nx, b.nx, f);
  const ny = lerp(a.ny, b.ny, f);
  const l = Math.hypot(nx, ny) || 1;
  return { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f), nx: nx / l, ny: ny / l };
}

// Ancho lateral de la vía (cm) a lo largo del tracto.
function anchoLateral(k, labios) {
  if (k < 3) return 1.4 + 0.3 * k;
  if (k < 17) return 3.0;
  if (k < 25) return 3.2;
  if (k < 37) return 4.0;
  if (k < 40) return 3.6;
  const redondeo = Math.min(1, labios / 1.0);
  return 2.0 + 2.2 * redondeo;
}

// Línea media de la cavidad nasal (desde la puerta del velo hasta la narina)
const CAMINO_NARIZ = new THREE.CatmullRomCurve3([
  V3(-1.2, 6.4, 0), V3(-1.1, 8.6, 0), V3(-0.2, 10.4, 0), V3(2.5, 11.0, 0),
  V3(5.5, 11.0, 0), V3(8.2, 10.6, 0), V3(9.9, 10.15, 0), V3(10.7, 9.95, 0),
]);

// Columna vertebral (centro de los cuerpos vertebrales)
const COLUMNA = new THREE.CatmullRomCurve3([
  V3(-2.5, 9.5, 0), V3(-2.4, 3, 0), V3(-2.8, -4, 0), V3(-4.3, -10, 0),
  V3(-5.8, -16, 0), V3(-6.3, -24, 0), V3(-6.0, -33.5, 0),
]);

// ---------- Silueta de la piel --------------------------------------------------
// [altura, frente, espalda, semiancho] (sin nariz ni labios: van como relieves)
const PERFIL = [
  [24.7, 1.8, 0.2, 0.2], [24.3, 4.6, -2.6, 3.6], [23.0, 7.2, -5.6, 6.0],
  [21.0, 8.9, -7.6, 7.3], [18.5, 9.7, -8.3, 7.7], [16.4, 9.9, -8.3, 7.8],
  [15.0, 9.3, -8.1, 7.6], [13.5, 9.2, -7.7, 7.3], [12.0, 9.1, -7.2, 7.0],
  [10.6, 9.2, -6.6, 6.6], [9.6, 9.4, -6.1, 6.2], [8.5, 9.35, -5.6, 5.8],
  [7.4, 9.25, -5.2, 5.5], [6.4, 9.0, -4.9, 5.2], [5.4, 9.1, -4.7, 4.8],
  [4.4, 7.4, -4.5, 4.6], [3.4, 4.4, -4.5, 4.7], [1.0, 3.7, -4.7, 5.0],
  [-2.0, 3.8, -5.0, 5.3], [-5.0, 4.7, -6.0, 7.6], [-7.5, 6.6, -7.4, 13.2],
  [-9.5, 7.8, -8.2, 17.6], [-12.0, 8.8, -8.6, 18.8], [-15.0, 9.5, -8.8, 17.2],
  [-18.0, 9.9, -8.9, 15.4], [-24.0, 9.9, -8.9, 15.0], [-30.0, 9.4, -8.6, 14.6],
  [-36.0, 8.7, -8.2, 14.2], [-38.5, 8.5, -8.0, 14.1],
];

function perfil(y) {
  const P = PERFIL;
  let i = 0;
  while (i < P.length - 2 && y < P[i + 1][0]) i++;
  const a = P[Math.max(0, i - 1)];
  const b = P[i];
  const c = P[i + 1];
  const d = P[Math.min(P.length - 1, i + 2)];
  const t = limitar((b[0] - y) / (b[0] - c[0]), 0, 1);
  const cr = (p0, p1, p2, p3) => 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  return { xf: cr(a[1], b[1], c[1], d[1]), xb: cr(a[2], b[2], c[2], d[2]), w: Math.max(0.05, cr(a[3], b[3], c[3], d[3])) };
}

// Relieves de la cara y el tronco: (altura, ángulo) → cm hacia fuera
function relieve(y, a) {
  const g = (y0, sy, a0, sa, amp) => amp * gauss(y, y0, sy) * gauss(a, a0, sa);
  const sim = (y0, sy, a0, sa, amp) => g(y0, sy, a0, sa, amp) + g(y0, sy, -a0, sa, amp);
  let r = 0;
  // nariz: dorso, punta y aletas
  r += g(13.4, 0.9, 0, 0.13, 0.45) + g(12.1, 0.8, 0, 0.14, 1.25) + g(10.95, 0.55, 0, 0.17, 2.25);
  r += sim(10.35, 0.42, 0.21, 0.1, 1.05);
  r += g(10.15, 0.3, 0, 0.08, 0.6); // columela
  // labios, surco y mentón
  r += g(9.25, 0.42, 0, 0.42, 0.55) + g(7.85, 0.42, 0, 0.36, 0.62) - g(8.55, 0.16, 0, 0.5, 0.35);
  r -= g(6.9, 0.35, 0, 0.4, 0.25);
  r += g(5.6, 0.75, 0, 0.32, 0.55);
  // arcos ciliares, cuencas, pómulos, sienes
  r += g(16.3, 0.7, 0, 0.75, 0.35);
  r -= sim(14.5, 0.85, 0.42, 0.14, 0.95);
  r += sim(13.0, 1.0, 0.8, 0.22, 0.45);
  r -= sim(16.0, 2.0, 1.25, 0.25, 0.35);
  // mandíbula (ángulo) y nuez
  r += sim(5.6, 1.2, 1.1, 0.35, 0.35);
  r += g(0.9, 0.7, 0, 0.18, 0.5);
  // esternocleidomastoideo, clavículas y pectorales
  r += sim(-1.0, 3.0, 0.55, 0.2, 0.35);
  r += sim(-8.7, 0.6, 0.85, 0.4, 0.4);
  r += sim(-14.5, 3.0, 0.45, 0.35, 0.6);
  return r;
}

// ---------- Paleta ------------------------------------------------------------

function leerPaleta() {
  const cs = getComputedStyle(document.documentElement);
  const c = (n) => new THREE.Color(cs.getPropertyValue(n).trim() || '#ff00ff');
  return {
    piel: c('--piel'),
    mucosa: c('--mucosa'),
    mucosaOscura: c('--mucosa-oscura'),
    aire: c('--aire'),
    hueso: c('--hueso'),
    diente: c('--diente'),
    lengua: c('--lengua'),
    labio: c('--labio'),
    pulmon: c('--pulmon'),
    musculo: c('--musculo'),
    cartilago: c('--cartilago'),
    presion: c('--presion'),
    particula: c('--particula'),
  };
}

// ---------- Escena -------------------------------------------------------------

export class Escena3D {
  constructor(contenedor) {
    this.contenedor = contenedor;
    this.P = leerPaleta();
    this.mostrarNombres = true;

    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.localClippingEnabled = true;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    contenedor.appendChild(r.domElement);
    this.renderer = r;

    this.escena = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(r);
    this.escena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.escena.environmentIntensity = 0.55;

    this.camara = new THREE.PerspectiveCamera(35, 1, 0.5, 400);
    this.controles = new OrbitControls(this.camara, r.domElement);
    this.controles.enableDamping = true;
    this.controles.minDistance = 10;
    this.controles.maxDistance = 160;
    this.vista('general');

    this.escena.add(new THREE.HemisphereLight(0xfff4ee, 0x553838, 0.9));
    const sol = new THREE.DirectionalLight(0xffffff, 1.5);
    sol.position.set(25, 35, 40);
    this.escena.add(sol);
    const contra = new THREE.DirectionalLight(0xffe2d6, 0.7);
    contra.position.set(-35, 10, -30);
    this.escena.add(contra);

    // Plano de corte (sagital): oculta la mitad z > 0 de los tejidos.
    this.corte = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
    this.planosCorte = [];

    this.etiquetas = [];
    this.capaNombres = document.createElement('div');
    this.capaNombres.className = 'nombres3d';
    contenedor.appendChild(this.capaNombres);

    this.construir();
    this.ajustar();
    new ResizeObserver(() => this.ajustar()).observe(contenedor);
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => this.refrescarPaleta());
  }

  refrescarPaleta() {
    this.P = leerPaleta();
    for (const [m, k] of this.materialesColor) m.color.copy(this.P[k]);
    for (const f of this.repintes) f();
  }

  ajustar() {
    const w = this.contenedor.clientWidth || 1;
    const h = this.contenedor.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px';
    this.renderer.domElement.style.height = h + 'px';
    this.camara.aspect = w / h;
    this.camara.updateProjectionMatrix();
  }

  fijarCorte(activo) {
    this.planosCorte = activo ? [this.corte] : [];
    for (const m of this.materialesCortables) {
      m.clippingPlanes = this.planosCorte;
      m.needsUpdate = true;
    }
  }

  fijarPiel(visible) {
    this.grupoPiel.visible = visible;
  }

  // ---------- Materiales ----------------------------------------------------------

  // Material con color de la paleta (`clave`) o con colores de vértice (clave null).
  mat(clave, extra = {}, cortable = true) {
    const m = new THREE.MeshPhysicalMaterial({
      color: clave ? this.P[clave] : 0xffffff,
      // (sheen se activa sólo donde se pide: es caro)
      roughness: 0.6,
      metalness: 0,
      side: THREE.DoubleSide,
      vertexColors: !clave,
      ...extra,
    });
    if (clave) this.materialesColor.push([m, clave]);
    if (cortable) this.materialesCortables.push(m);
    return m;
  }

  mucosa(clave, extra = {}) {
    return this.mat(clave, { roughness: 0.38, clearcoat: 0.55, clearcoatRoughness: 0.3, ...extra });
  }

  hueso(extra = {}) {
    return this.mat(null, { roughness: 0.78, ...extra });
  }

  // Colorea una geometría y la vuelve a colorear al cambiar el tema.
  pintado(geo, fn) {
    const f = () => pintar(geo, fn);
    f();
    this.repintes.push(f);
    return geo;
  }

  malla(geo, material, padre = this.escena) {
    const m = new THREE.Mesh(geo, material);
    padre.add(m);
    return m;
  }

  // ---------- Construcción --------------------------------------------------------

  construir() {
    this.materialesColor = [];
    this.materialesCortables = [];
    this.repintes = [];
    this.construirPiel();
    this.construirColumna();
    this.construirViaAerea();
    this.construirBoca();
    this.construirNariz();
    this.construirLaringe();
    this.construirTorax();
    this.construirParticulas();
    this.construirNombres();
  }

  // --- Piel: superficie continua de cabeza, cuello y busto, orejas y ojos
  construirPiel() {
    const P = this.P;
    this.grupoPiel = new THREE.Group();
    this.escena.add(this.grupoPiel);
    // La piel es translúcida y cubre mucha pantalla: material sencillo (rápido).
    const piel = new THREE.MeshStandardMaterial({
      color: P.piel, transparent: true, opacity: 0.2, depthWrite: false,
      side: THREE.BackSide, // los anillos miran hacia dentro
      roughness: 0.55,
    });
    const pielOreja = new THREE.MeshStandardMaterial({ color: P.piel, transparent: true, opacity: 0.3, depthWrite: false, roughness: 0.55 });
    for (const m of [piel, pielOreja]) {
      this.materialesColor.push([m, 'piel']);
      this.materialesCortables.push(m);
    }

    const alturas = [];
    for (let y = 24.7; y > 3; y -= 0.28) alturas.push(y);
    for (let y = 3; y >= -38.5; y -= 0.6) alturas.push(y);
    const L = 104;
    const m = new Anillos(alturas.length, L, { tapas: true });
    alturas.forEach((y, i) => {
      const { xf, xb, w } = perfil(y);
      const c = (xf + xb) / 2;
      const af = xf - c;
      const ab = c - xb;
      const ex = 2 / lerp(2.0, 2.7, limitar((-y - 2) / 8, 0, 1));
      for (let j = 0; j < L; j++) {
        const a = -Math.PI + (2 * Math.PI * j) / L;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        let x = c + (ca >= 0 ? af : ab) * Math.sign(ca) * Math.pow(Math.abs(ca), ex);
        let z = w * Math.sign(sa) * Math.pow(Math.abs(sa), ex);
        const r = relieve(y, a) + 0.08 * fbm(x * 0.4, y * 0.4, z * 0.4, 2);
        x += r * ca;
        z += r * sa;
        m.poner(i, j, x, y, z);
      }
    });
    this.malla(m.terminar(), piel, this.grupoPiel);

    // Orejas: concha con hélix y lóbulo
    for (const lado of [-1, 1]) {
      const geo = esferaDeformada((v) => {
        const r = Math.hypot(v.x, v.y);
        const fuera = v.z * lado > 0;
        let x = v.x * 1.05;
        let y = v.y * 2.5 - 0.25 * Math.max(0, -v.y) * Math.max(0, -v.y) * 2;
        let z = v.z * 0.42;
        if (fuera) z -= lado * 0.32 * Math.exp(-(r * r) / 0.35); // concha
        x *= 1 - 0.25 * Math.max(0, -v.y); // lóbulo más estrecho
        v.set(x, y, z);
      }, 32, 24);
      const oreja = this.malla(geo, pielOreja, this.grupoPiel);
      oreja.position.set(-1.1, 11.9, lado * 7.2);
      oreja.rotation.z = -0.2;
      oreja.rotation.y = -lado * 0.25;
    }

    // Ojos dentro de las cuencas
    const esclera = this.mat('diente', { roughness: 0.15, clearcoat: 1 });
    const iris = new THREE.MeshPhysicalMaterial({ color: 0x4a3324, roughness: 0.25, clearcoat: 1 });
    this.materialesCortables.push(iris);
    for (const lado of [-1, 1]) {
      const ojo = this.malla(new THREE.SphereGeometry(1.15, 28, 20), esclera);
      ojo.position.set(7.0, 14.5, lado * 3.15);
      const ir = this.malla(new THREE.SphereGeometry(0.55, 20, 12), iris);
      ir.scale.set(0.35, 1, 1);
      ir.position.set(8.05, 14.5, lado * 3.25);
    }
  }

  // --- Columna: vértebras con cuerpo, arco y apófisis, y discos
  construirColumna() {
    const piezas = []; // { geo, matriz, disco }
    const largo = COLUMNA.getLength();
    let s = 0.4;
    while (s < largo - 0.6) {
      const t = COLUMNA.getUtoTmapping(s / largo);
      const p = COLUMNA.getPoint(t);
      const tg = COLUMNA.getTangent(t);
      const cervical = p.y > -5;
      const r = cervical ? 0.72 : lerp(0.95, 1.3, limitar((-p.y - 8) / 22, 0, 1));
      const h = cervical ? 0.68 : r * 0.95;
      const m = new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), tg), V3(1, 1, 1));
      const add = (geo, disco = false, local = null) => piezas.push({ geo, matriz: local ? m.clone().multiply(local) : m, disco });

      // cuerpo con cintura
      const perfilCuerpo = [];
      for (let i = 0; i <= 8; i++) {
        const u = i / 8;
        perfilCuerpo.push(new THREE.Vector2(r * (0.86 + 0.14 * Math.abs(2 * u - 1) ** 2), (u - 0.5) * h));
      }
      add(new THREE.LatheGeometry(perfilCuerpo, 20));
      // arco (láminas y pedículos)
      add(tubo(
        Array.from({ length: 13 }, (_, i) => {
          const a = Math.PI + (Math.PI * i) / 12;
          return V3(-r * 1.2 + Math.cos(a) * r * 0.75, 0, Math.sin(a) * r * 0.75 * 1.15);
        }),
        elipse(() => 0.16 * r + 0.06, () => 0.22 * r + 0.08), 8,
      ));
      // apófisis espinosa (hacia atrás y abajo) y transversas
      add(tubo(
        [V3(-r * 1.9, 0, 0), V3(-r * 1.9 - (cervical ? 0.8 : 1.1), -0.25, 0), V3(-r * 1.9 - (cervical ? 1.2 : 1.5), -(cervical ? 0.35 : 0.8), 0)],
        elipse((q) => 0.22 * (1 - 0.6 * q), (q) => 0.12 * (1 - 0.5 * q)), 8,
      ));
      for (const lado of [-1, 1]) {
        add(tubo(
          [V3(-r * 1.3, 0, lado * r * 0.75), V3(-r * 1.55, 0.05, lado * (r * 0.75 + (cervical ? 0.7 : 1.0))), V3(-r * 1.8, 0.1, lado * (r * 0.75 + (cervical ? 1.0 : 1.5)))],
          elipse((q) => 0.17 * (1 - 0.4 * q), (q) => 0.14 * (1 - 0.3 * q)), 8,
        ));
      }
      // disco intervertebral debajo
      add(new THREE.CylinderGeometry(r * 0.92, r * 0.92, 0.26, 20), true, new THREE.Matrix4().makeTranslation(0, -h / 2 - 0.15, 0));
      s += h + 0.3;
    }
    const { geo, pieza } = fusionar(piezas);
    this.pintado(geo, (x, y, z, i) => moteado(piezas[pieza[i]].disco ? this.P.cartilago : this.P.hueso, x, y, z, 2.2, 0.1));
    this.malla(geo, this.hueso());
  }

  // --- Tubo de aire, pared de la faringe y esófago
  construirViaAerea() {
    const P = this.P;
    this.matAire = new THREE.MeshStandardMaterial({ color: P.aire, transparent: true, opacity: 0.5, roughness: 0.3, side: THREE.DoubleSide, depthWrite: false });
    this.materialesColor.push([this.matAire, 'aire']);
    this.aire = new Anillos(N + 1, RADIAL);
    this.malla(this.aire.geo, this.matAire).renderOrder = 2;

    // Pared muscular de la faringe (constrictores), translúcida
    this.paredFaringe = new Anillos(21, RADIAL);
    const matPared = this.mucosa('musculo', { transparent: true, opacity: 0.32, depthWrite: false });
    this.malla(this.paredFaringe.geo, matPared).renderOrder = 1;

    // Esófago: tubo aplanado detrás de la tráquea
    const eso = new THREE.CatmullRomCurve3([V3(-1.5, 0.2, 0), V3(-1.9, -6, 0), V3(-2.9, -12, 0), V3(-3.9, -20, 0), V3(-4.2, -30, 0)]);
    const geo = tubo(eso.getPoints(40), elipse(() => 0.38, () => 0.75), 14, { arriba: V3(1, 0, 0) });
    this.malla(geo, this.mucosa('mucosaOscura', { transparent: true, opacity: 0.45 }));
  }

  // --- Lengua, paladar, velo, dientes, encías, mandíbula y labios
  construirBoca() {
    const P = this.P;

    // Lengua (se deforma cada cuadro)
    this.lenguaIni = 5;
    this.lenguaFin = 38;
    this.lenguaLados = 28;
    this.lengua = new Anillos(this.lenguaFin - this.lenguaIni + 1, this.lenguaLados, { tapas: true, colores: true });
    this.malla(this.lengua.geo, this.mucosa(null, { roughness: 0.55, clearcoat: 0.45 }));
    this.pintarLengua = () => {
      const T = this.lengua;
      for (let a = 0; a < T.anillos; a++) {
        for (let j = 0; j < T.lados; j++) {
          const arriba = j < T.lados / 2;
          const papila = 0.08 * Math.sin(a * 7.3 + j * 3.1) * Math.sin(j * 5.7 - a * 2.3);
          const base = arriba ? P.lengua : P.mucosaOscura;
          const k = 1 + (arriba ? papila : 0) + 0.06 * fbm(a * 0.5, j * 0.5, 0, 2);
          T.color(a, j, base.r * k, base.g * k, base.b * k);
        }
      }
      T.geo.attributes.color.needsUpdate = true;
    };
    this.pintarLengua();
    this.repintes.push(this.pintarLengua);

    // Paladar duro abovedado con rugas (mucosa abajo, hueso arriba)
    const pasos = [];
    for (let k = 24; k <= 38.5; k += 0.25) pasos.push(k);
    const L = 24;
    const pal = new Anillos(pasos.length, L, { tapas: true, colores: true });
    const pintarPaladar = () => {
      pasos.forEach((k, i) => {
        const p = puntoTR(k);
        const W = anchoLateral(Math.round(k), 1.2) / 2 + 0.45;
        for (let j = 0; j < L; j++) {
          const abajo = j < L / 2;
          const q = abajo ? j / (L / 2 - 1) : (j - L / 2) / (L / 2 - 1);
          const z = abajo ? lerp(-W, W, q) : lerp(W, -W, q);
          const c = 1 - (z / W) * (z / W);
          const ruga = k > 31 ? 0.06 * Math.max(0, Math.sin((k - 31) * 4.2)) * c : 0;
          let d = PARED + 0.05 + 0.32 * Math.sqrt(Math.max(0, c)) - ruga;
          if (!abajo) d = PARED + 0.5 + 0.42 * Math.sqrt(Math.max(0, c));
          pal.poner(i, j, p.x + p.nx * d, p.y + p.ny * d, z);
          const col = abajo ? moteado(P.mucosa, k, z, 0, 1.2, 0.08) : moteado(P.hueso, k, z, 1, 1.5, 0.1);
          pal.color(i, j, col[0], col[1], col[2]);
        }
      });
      pal.terminar();
    };
    pintarPaladar();
    this.repintes.push(pintarPaladar);
    this.malla(pal.geo, this.mucosa(null, { roughness: 0.5 }));

    // Velo del paladar (se deforma) y úvula
    this.veloPasos = [];
    for (let k = INDICE_VELO; k <= 25.5; k += 0.5) this.veloPasos.push(k);
    this.velo = new Anillos(this.veloPasos.length, 20, { tapas: true });
    this.malla(this.velo.geo, this.mucosa('mucosaOscura'));
    const uvula = tubo(
      Array.from({ length: 10 }, (_, i) => V3(0, -i * 0.12, 0)),
      elipse((s) => 0.2 * Math.sqrt(1 - s * 0.6) * (s > 0.85 ? Math.sqrt((1 - s) / 0.15) : 1), (s) => 0.24 * (1 - s * 0.4) * (s > 0.85 ? Math.sqrt((1 - s) / 0.15) : 1)),
      12, { arriba: V3(1, 0, 0) },
    );
    this.uvula = this.malla(uvula, this.mucosa('mucosaOscura'));

    // Dientes con forma por tipo y encías
    const matDiente = this.mat('diente', { roughness: 0.18, clearcoat: 0.9, clearcoatRoughness: 0.15 });
    const matEncia = this.mucosa('mucosa', { roughness: 0.45 });
    this.arcoDental(matDiente, matEncia, 9.42, -1, this.escena);

    // Mandíbula: gira en la articulación temporomandibular
    this.mandibula = new THREE.Group();
    this.mandibula.position.set(-0.6, 9.8, 0);
    this.escena.add(this.mandibula);
    const interior = new THREE.Group();
    interior.position.set(0.6, -9.8, 0);
    this.mandibula.add(interior);
    this.arcoDental(matDiente, matEncia, 7.5, 1, interior);
    this.construirMandibula(interior);

    // Labios (se reconstruyen cada cuadro)
    const matLabio = this.mucosa('labio', { roughness: 0.42, clearcoat: 0.6 });
    this.labioSup = new Anillos(33, 14, { tapas: true });
    this.labioInf = new Anillos(33, 14, { tapas: true });
    this.malla(this.labioSup.geo, matLabio);
    this.malla(this.labioInf.geo, matLabio);
  }

  // Geometría de una pieza dental. tipo: incisivo | canino | premolar | molar
  geometriaDiente(tipo) {
    const raiz = tipo === 'molar' ? 1.0 : 1.25;
    const prof = [
      [0.02, -raiz], [0.11, -raiz * 0.85], [0.2, -raiz * 0.5], [0.26, -0.15], [0.27, 0],
      [0.33, 0.25], [0.36, 0.5], [0.34, 0.72], [0.26, 0.9], [0.0, 0.98],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const geo = new THREE.LatheGeometry(prof, 18);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const ang = Math.atan2(v.z, v.x);
      let { x, y, z } = v;
      if (tipo === 'incisivo') {
        x *= 0.5; z *= 1.15;
        if (y > 0.45) x *= 1 - (y - 0.45) * 1.3; // borde en cincel
        y = Math.min(y, 0.9) * 1.08;
      } else if (tipo === 'canino') {
        x *= 0.85; z *= 0.95;
        if (y > 0.4) { const f = 1 - (y - 0.4) * 1.4; x *= f; z *= f; }
        y *= 1.18;
      } else if (tipo === 'premolar') {
        x *= 0.95; z *= 0.8;
        if (y > 0.6) y = 0.72 + 0.08 * Math.cos(2 * ang);
      } else {
        x *= 1.3; z *= 1.25;
        if (y > 0.6) y = 0.66 + 0.07 * Math.cos(4 * ang); // cúspides
      }
      pos.setXYZ(i, x, y, z);
    }
    geo.computeVertexNormals();
    return geo;
  }

  // Arco de 16 piezas. y: altura del cuello; dir: -1 superiores (cuelgan), +1 inferiores.
  arcoDental(matDiente, matEncia, y, dir, padre) {
    const tipos = ['incisivo', 'incisivo', 'canino', 'premolar', 'premolar', 'molar', 'molar', 'molar'];
    const geos = {};
    const piezas = [];
    const n = 8;
    const camino = [];
    for (const lado of [-1, 1]) {
      for (let i = 0; i < n; i++) {
        const th = ((i + 0.5) / n) * (Math.PI / 2);
        const x = 7.0 - 3.9 * (1 - Math.cos(th)) - (dir > 0 ? 0.25 : 0);
        const z = lado * 2.7 * Math.sin(th);
        const tipo = tipos[i];
        geos[tipo] ||= this.geometriaDiente(tipo);
        const esc = tipo === 'molar' ? 0.95 : 0.9;
        const rot = new THREE.Euler(0, -lado * th, dir < 0 && i < 2 ? -0.12 : 0, 'YXZ');
        piezas.push({
          geo: geos[tipo],
          matriz: new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromEuler(rot), V3(esc, dir * esc * 1.05, esc)),
        });
      }
    }
    const dientes = fusionar(piezas).geo;
    dientes.deleteAttribute('color');
    this.malla(dientes, matDiente, padre);
    // Encía: tubo a lo largo del arco que cubre los cuellos
    for (let i = 0; i <= 40; i++) {
      const th = -Math.PI / 2 + (Math.PI * i) / 40;
      camino.push(V3(7.0 - 3.9 * (1 - Math.cos(th)) - (dir > 0 ? 0.25 : 0), y - dir * 0.25, 2.75 * Math.sin(th)));
    }
    const encia = tubo(camino, elipse(() => 0.42, () => 0.5), 12, { arriba: V3(0, 1, 0) });
    this.malla(encia, matEncia, padre);
  }

  construirMandibula(padre) {
    const P = this.P;
    const matHueso = this.hueso();
    // Cuerpo con mentón
    const cuerpo = new THREE.CatmullRomCurve3([
      V3(-0.3, 6.1, -4.7), V3(1.6, 5.85, -4.6), V3(4.6, 5.75, -3.9), V3(6.9, 6.0, -2.4),
      V3(8.0, 6.15, -0.9), V3(8.25, 6.15, 0), V3(8.0, 6.15, 0.9), V3(6.9, 6.0, 2.4),
      V3(4.6, 5.75, 3.9), V3(1.6, 5.85, 4.6), V3(-0.3, 6.1, 4.7),
    ]).getPoints(80);
    const menton = (s) => gauss(s, 0.5, 0.12);
    const geo = tubo(cuerpo, (s, a) => {
      const h = 0.82 + 0.3 * menton(s);
      const g = 0.3 + 0.16 * menton(s);
      let u = Math.cos(a) * h; // vertical
      let v = Math.sin(a) * g;
      if (u < 0) v += 0.25 * menton(s) * (-u / h); // protuberancia mentoniana
      return [u, v];
    }, 14, { arriba: V3(0, 1, 0) });
    this.pintado(geo, (x, y, z) => moteado(P.hueso, x, y, z, 1.2, 0.1));
    this.malla(geo, matHueso, padre);
    // Rama, cóndilo y apófisis coronoides
    for (const lado of [-1, 1]) {
      const rama = tubo(
        [V3(-0.35, 5.6, lado * 4.7), V3(-0.45, 7.0, lado * 4.62), V3(-0.6, 8.4, lado * 4.52), V3(-0.72, 9.25, lado * 4.45)],
        (s, a) => [Math.cos(a) * (1.05 - 0.45 * s), Math.sin(a) * 0.28],
        12, { arriba: V3(1, 0, 0) },
      );
      this.pintado(rama, (x, y, z) => moteado(P.hueso, x, y, z, 1.2, 0.1));
      this.malla(rama, matHueso, padre);
      const condilo = esferaDeformada((v) => v.set(v.x * 0.42, v.y * 0.32, v.z * 0.85));
      this.pintado(condilo, () => [P.hueso.r, P.hueso.g, P.hueso.b]);
      this.malla(condilo, matHueso, padre).position.set(-0.78, 9.5, lado * 4.4);
      const coronoides = tubo(
        [V3(0.3, 8.0, lado * 4.5), V3(0.65, 8.8, lado * 4.42), V3(0.85, 9.35, lado * 4.35)],
        (s, a) => [Math.cos(a) * 0.4 * (1 - 0.7 * s), Math.sin(a) * 0.15 * (1 - 0.5 * s)],
        10, { arriba: V3(1, 0, 0) },
      );
      this.pintado(coronoides, () => [P.hueso.r, P.hueso.g, P.hueso.b]);
      this.malla(coronoides, matHueso, padre);
    }
  }

  // --- Cavidad nasal, cornetes y senos paranasales
  construirNariz() {
    this.nariz = new Anillos(NARIZ_N + 1, RADIAL);
    this.matNariz = new THREE.MeshStandardMaterial({ color: this.P.aire, transparent: true, opacity: 0.42, roughness: 0.3, side: THREE.DoubleSide, depthWrite: false });
    this.materialesColor.push([this.matNariz, 'aire']);
    this.malla(this.nariz.geo, this.matNariz);
    this.puntosNariz = [];
    this.tangNariz = [];
    for (let k = 0; k <= NARIZ_N; k++) {
      this.puntosNariz.push(CAMINO_NARIZ.getPoint(k / NARIZ_N));
      this.tangNariz.push(CAMINO_NARIZ.getTangent(k / NARIZ_N));
    }

    // Cornetes: volutas a lo largo de la pared lateral
    const matCornete = this.mucosa('mucosaOscura');
    for (const [x0, x1, y, r] of [[2.4, 8.0, 10.45, 0.3], [3.4, 7.0, 11.05, 0.24], [4.2, 6.0, 11.55, 0.17]]) {
      for (const lado of [-1, 1]) {
        const pts = Array.from({ length: 16 }, (_, i) => {
          const t = i / 15;
          return V3(lerp(x0, x1, t), y - 0.12 * Math.sin(Math.PI * t), lado * 0.78);
        });
        const geo = tubo(pts, (s, a) => {
          const f = Math.sin(Math.PI * Math.min(1, s * 1.1)) ** 0.5;
          // sección en voluta: gota que cuelga y se enrolla hacia dentro
          const u = Math.cos(a) * r * f;
          const v = (Math.sin(a) * 0.45 - 0.15) * r * f * (1 + 0.4 * Math.cos(a));
          return [v * 2, u];
        }, 12, { arriba: V3(0, 1, 0) });
        this.malla(geo, matCornete);
      }
    }

    // Senos (cajas de resonancia): cavidades irregulares
    this.matSenos = new THREE.MeshStandardMaterial({ color: this.P.aire, transparent: true, opacity: 0.3, emissive: this.P.aire, emissiveIntensity: 0, depthWrite: false, roughness: 0.4 });
    this.materialesColor.push([this.matSenos, 'aire']);
    const seno = (x, y, z, sx, sy, sz, semilla) => {
      const geo = esferaDeformada((v) => {
        const k = 1 + 0.22 * fbm(v.x * 1.6 + semilla, v.y * 1.6, v.z * 1.6, 3);
        v.set(v.x * sx * k, v.y * sy * k, v.z * sz * k);
      }, 28, 18);
      this.malla(geo, this.matSenos).position.set(x, y, z);
    };
    seno(8.0, 16.4, 0, 0.75, 1.0, 1.9, 1); // frontal
    for (const lado of [-1, 1]) seno(5.5, 11.2, lado * 2.5, 1.6, 1.25, 0.95, lado * 4); // maxilares
    seno(0.4, 11.6, 0, 0.85, 0.75, 0.95, 9); // esfenoidal
    seno(3.0, 13.4, 0, 1.4, 0.6, 1.0, 13); // etmoidales
  }

  // --- Laringe: tiroides, cricoides, aritenoides, cuerdas, epiglotis, hioides
  construirLaringe() {
    const P = this.P;
    this.laringe = new THREE.Group();
    this.escena.add(this.laringe);
    const cart = this.mat(null, { roughness: 0.45, clearcoat: 0.3 });

    // Cartílago tiroides: dos láminas unidas delante (nuez) con escotadura
    for (const s of [-1, 1]) {
      const U = 22;
      const Vn = 14;
      const m = new Anillos(Vn, U, { cerrado: false, colores: true });
      for (let iv = 0; iv < Vn; iv++) {
        const v = iv / (Vn - 1);
        for (let iu = 0; iu < U; iu++) {
          const u = iu / (U - 1);
          const yb = -0.75 + 0.3 * Math.sin(Math.PI * u) - 0.45 * gauss(u, 1, 0.08);
          const yt = 2.0 - 0.6 * gauss(u, 0, 0.14) - 0.15 * Math.sin(Math.PI * u) + 0.9 * gauss(u, 1, 0.07);
          const y = lerp(yb, yt, v);
          const xf = 1.15 + 0.35 * v * v; // la nuez sobresale arriba
          const x = lerp(xf, -0.7, u) + 0.18 * Math.sin(Math.PI * u);
          const z = s * lerp(0.04, 1.62, Math.pow(u, 0.8));
          m.poner(iv, iu, x, y, z);
          const c = moteado(P.cartilago, x, y, z, 2, 0.12);
          m.color(iv, iu, c[0], c[1], c[2]);
        }
      }
      this.malla(m.terminar(), cart, this.laringe);
    }

    // Cricoides: anillo en sello (bajo delante, alto detrás)
    const C = 48;
    const S = 10;
    const cri = new Anillos(C + 1, S, { colores: true });
    for (let i = 0; i <= C; i++) {
      const phi = (2 * Math.PI * i) / C;
      const atras = (1 - Math.cos(phi)) / 2;
      const h = 0.45 + 1.35 * atras ** 3;
      const cx = Math.cos(phi) * 1.0;
      const cz = Math.sin(phi) * 0.95;
      for (let j = 0; j < S; j++) {
        const a = (2 * Math.PI * j) / S;
        const rr = 1 + 0.12 * Math.cos(a);
        const x = cx * rr - 0.05;
        const z = cz * rr;
        const y = -1.75 + (Math.sin(a) * 0.5 + 0.5) * h;
        cri.poner(i, j, x, y, z);
        const c = moteado(P.cartilago, x, y, z, 2, 0.1);
        cri.color(i, j, c[0], c[1], c[2]);
      }
    }
    this.malla(cri.terminar(), cart, this.laringe);

    // Cuerdas vocales y bandas ventriculares (giran con la apertura)
    this.cuerdas = [];
    const matCuerda = this.mucosa('diente', { roughness: 0.3, clearcoat: 0.8 });
    const matBanda = this.mucosa('mucosa');
    const matArit = this.mat(null, { roughness: 0.45 });
    const cuna = (ancho, alto, salida) => (s, a) => {
      // cuña: borde fino hacia la línea media, grueso hacia fuera
      const f = Math.sin(Math.PI * Math.min(1, 0.08 + s * 0.95)) ** 0.35;
      const lat = (Math.cos(a) * 0.5 + 0.5) * ancho * f;
      const ver = Math.sin(a) * alto * f * (0.35 + 0.65 * (lat / ancho));
      return [ver, salida * lat];
    };
    for (const lado of [-1, 1]) {
      const piv = new THREE.Group();
      piv.position.set(0.9, 0, 0);
      piv.userData.lado = lado;
      this.laringe.add(piv);
      const pts = Array.from({ length: 12 }, (_, i) => V3(-i * 0.14, 0, 0));
      const fold = tubo(pts, cuna(0.48, 0.2, -lado), 12, { arriba: V3(0, 1, 0) });
      this.malla(fold, matCuerda, piv);
      const banda = tubo(pts.map((p) => V3(p.x, 0.5, lado * 0.22)), cuna(0.38, 0.16, -lado), 10, { arriba: V3(0, 1, 0) });
      this.malla(banda, matBanda, piv);
      // aritenoides: pirámide curva al final de la cuerda
      const arit = esferaDeformada((v) => {
        const y = (v.y + 1) / 2;
        const f = 1 - 0.75 * y;
        v.set(v.x * 0.32 * f, y * 1.0 - 0.2, v.z * 0.28 * f + lado * 0.1 * y);
      }, 16, 12);
      this.pintado(arit, (x, y, z) => moteado(P.cartilago, x, y, z, 3, 0.1));
      this.malla(arit, matArit, piv).position.set(-1.65, -0.15, lado * 0.25);
      this.cuerdas.push(piv);
    }

    // Epiglotis: hoja curvada detrás de la base de la lengua
    const linea = new THREE.CatmullRomCurve3([V3(0.8, 1.4, 0), V3(0.65, 2.8, 0), V3(0.4, 3.9, 0), V3(0.12, 4.5, 0)]);
    const Vn = 18;
    const U = 15;
    const epi = new Anillos(Vn, U, { cerrado: false, colores: true });
    for (let iv = 0; iv < Vn; iv++) {
      const v = iv / (Vn - 1);
      const p = linea.getPoint(v);
      const ancho = v < 0.75 ? 0.12 + 0.95 * Math.sin((Math.PI / 2) * (v / 0.75)) ** 0.8 : 1.07 * Math.sqrt(Math.max(0, 1 - ((v - 0.75) / 0.25) ** 2));
      for (let iu = 0; iu < U; iu++) {
        const u = (iu / (U - 1)) * 2 - 1;
        const z = u * ancho;
        const x = p.x - 0.4 * u * u * ancho;
        epi.poner(iv, iu, x, p.y, z);
        const c = moteado(P.cartilago, x, p.y, z, 3, 0.1);
        epi.color(iv, iu, c[0], c[1], c[2]);
      }
    }
    this.malla(epi.terminar(), cart, this.laringe);

    // Hueso hioides en U
    const hioides = new THREE.CatmullRomCurve3([
      V3(-1.0, 3.05, -2.5), V3(0.4, 3.0, -2.0), V3(1.5, 2.95, -0.9), V3(1.7, 2.95, 0),
      V3(1.5, 2.95, 0.9), V3(0.4, 3.0, 2.0), V3(-1.0, 3.05, 2.5),
    ]).getPoints(40);
    const geoH = tubo(hioides, (s, a) => {
      const r = 0.1 + 0.1 * gauss(s, 0.5, 0.18);
      return [Math.cos(a) * r * 1.5, Math.sin(a) * r];
    }, 10, { arriba: V3(0, 1, 0) });
    this.pintado(geoH, (x, y, z) => moteado(P.hueso, x, y, z, 2, 0.1));
    this.malla(geoH, this.hueso(), this.laringe);

    // colores de vértice del cartílago (para el cambio de tema)
    this.repintes.push(() => {
      this.laringe.traverse((o) => {
        if (o.isMesh && o.geometry.attributes.color && o.material === cart) {
          pintar(o.geometry, (x, y, z) => moteado(this.P.cartilago, x, y, z, 2, 0.12));
        }
      });
    });
  }

  // --- Tráquea, bronquios, pulmones, costillas, esternón, clavículas, diafragma
  construirTorax() {
    const P = this.P;

    // Tráquea: anillos en C con la pared de atrás aplanada
    const NT = 110;
    const LT = 24;
    const traq = new Anillos(NT, LT, { colores: true });
    const pintarTraquea = () => {
      for (let i = 0; i < NT; i++) {
        const y = lerp(-1.75, -12.1, i / (NT - 1));
        const anillo = Math.max(0, Math.cos((2 * Math.PI * y) / 0.78)) ** 3;
        for (let j = 0; j < LT; j++) {
          const a = (2 * Math.PI * j) / LT;
          const atras = Math.cos(a) < -0.55;
          const r = 0.82 + (atras ? 0 : 0.07 * anillo);
          let x = Math.cos(a) * r;
          if (atras) x = -0.82 * 0.55 - (Math.cos(a) + 0.55) * 0.25; // pared membranosa plana
          traq.poner(i, j, x, y, Math.sin(a) * r);
          const c = atras || anillo < 0.25 ? moteado(P.mucosa, x, y, 0, 2, 0.08) : moteado(P.cartilago, x, y, 0, 2, 0.08);
          traq.color(i, j, c[0], c[1], c[2]);
        }
      }
      traq.terminar();
    };
    pintarTraquea();
    this.repintes.push(pintarTraquea);
    const matVia = this.mucosa(null, { roughness: 0.45 });
    this.malla(traq.geo, matVia);

    // Bronquios principales (el derecho más vertical y corto)
    this.caminosBronquio = [];
    for (const lado of [-1, 1]) {
      const curva = new THREE.CatmullRomCurve3(lado < 0
        ? [V3(0, -11.9, 0), V3(-0.1, -12.9, -1.2), V3(-0.3, -14.6, -3.4)]
        : [V3(0, -11.9, 0), V3(0, -12.6, 1.5), V3(-0.3, -14.3, 3.6)]);
      const geo = tubo(curva.getPoints(24), (s, a) => {
        const r = lerp(0.62, 0.42, s) * (1 + 0.06 * Math.max(0, Math.cos(s * 18)) ** 3);
        return [Math.cos(a) * r, Math.sin(a) * r];
      }, 14, { color: (s) => moteado(P.mucosa, s * 9, lado, 0, 1, 0.1) });
      this.malla(geo, matVia);
      this.caminosBronquio.push(curva);
    }

    // Pulmones con árbol bronquial dentro
    this.matPulmon = this.mat(null, { transparent: true, opacity: 0.78, roughness: 0.55, clearcoat: 0.25, depthWrite: false });
    this.matBronquiolo = this.mucosa('mucosa', { transparent: true, opacity: 0.85 });
    this.pulmones = [];
    for (const lado of [-1, 1]) {
      const g = new THREE.Group();
      g.position.set(-0.6, -20.8, lado * 5.9);
      this.escena.add(g);
      const geo = this.geometriaPulmon(lado);
      this.pintado(geo, (x, y, z) => this.colorPulmon(x, y, z, lado));
      const m = this.malla(geo, this.matPulmon, g);
      m.renderOrder = 1;
      this.arbolBronquial(g, lado);
      this.pulmones.push(g);
    }

    // Costillas (se rehacen al cambiar la elevación) e intercostales
    this.costillas = [];
    this.matCostilla = this.hueso();
    for (let k = 0; k < 8; k++) {
      for (const lado of [-1, 1]) {
        const a = new Anillos(48, 10, { tapas: true, colores: true });
        this.malla(a.geo, this.matCostilla);
        this.costillas.push({ a, k, lado });
      }
    }
    this.matIntercostal = this.mat('musculo', { transparent: true, opacity: 0.3, depthWrite: false, roughness: 0.6 });
    this.intercostales = [];
    for (let k = 0; k < 7; k++) {
      for (const lado of [-1, 1]) {
        const a = new Anillos(5, 30, { cerrado: false });
        this.malla(a.geo, this.matIntercostal);
        this.intercostales.push({ a, k, lado });
      }
    }
    this.repintes.push(() => (this.elevPrev = 99));

    // Esternón: manubrio, cuerpo y apófisis xifoides
    const est = Array.from({ length: 40 }, (_, i) => V3(6.95 + 0.25 * (i / 39), -11.4 - 15.6 * (i / 39), 0));
    const anchoEst = (s) => {
      if (s < 0.22) return lerp(1.55, 1.15, s / 0.22);
      if (s < 0.27) return 1.0;
      if (s < 0.88) return 1.1 + 0.15 * Math.sin(Math.PI * (s - 0.27) / 0.61);
      return lerp(0.9, 0.2, (s - 0.88) / 0.12);
    };
    const geoEst = tubo(est, (s, a) => [Math.cos(a) * 0.32, Math.sin(a) * anchoEst(s)], 14, { arriba: V3(1, 0, 0) });
    this.pintado(geoEst, (x, y, z) => moteado(P.hueso, x, y, z, 1.5, 0.1));
    this.esternon = this.malla(geoEst, this.hueso());

    // Clavículas en S
    for (const lado of [-1, 1]) {
      const c = new THREE.CatmullRomCurve3([
        V3(6.7, -11.0, lado * 1.4), V3(6.1, -10.3, lado * 5), V3(3.6, -9.7, lado * 9.4),
        V3(0.3, -9.5, lado * 13.4), V3(-1.4, -9.8, lado * 15.2),
      ]).getPoints(36);
      const geo = tubo(c, (s, a) => [Math.cos(a) * lerp(0.48, 0.3, s), Math.sin(a) * lerp(0.42, 0.55, s)], 10);
      this.pintado(geo, (x, y, z) => moteado(P.hueso, x, y, z, 1.2, 0.1));
      this.malla(geo, this.hueso());
    }

    // Diafragma: doble cúpula con centro tendinoso
    const RX = 16; // anillos del centro al borde
    const RZ = 48; // puntos por anillo
    this.diafragma = new Anillos(RX + 1, RZ, { colores: true });
    this.diaRes = [RX, RZ];
    this.matDiafragma = this.mat(null, { transparent: true, opacity: 0.85, roughness: 0.5 });
    this.malla(this.diafragma.geo, this.matDiafragma);
    this.pintarDiafragma = () => {
      for (let i = 0; i <= RX; i++) {
        for (let j = 0; j < RZ; j++) {
          const phi = (2 * Math.PI * j) / RZ;
          const u = (i / RX) * Math.cos(phi);
          const v = (i / RX) * Math.sin(phi);
          const r2 = u * u * 1.4 + v * v * 2.2;
          const t = limitar(1 - r2 * 2.2, 0, 1); // centro tendinoso (trébol)
          const c = mezcla(P.musculo, P.cartilago, t * 0.85);
          const k = 1 + 0.1 * fbm(u * 4, v * 4, 0, 2) + 0.05 * Math.sin((Math.atan2(v, u) * 40));
          this.diafragma.color(i, j, c[0] * k, c[1] * k, c[2] * k);
        }
      }
      this.diafragma.geo.attributes.color.needsUpdate = true;
    };
    this.pintarDiafragma();
    this.repintes.push(this.pintarDiafragma);
  }

  geometriaPulmon(lado) {
    const notch = lado > 0; // escotadura cardíaca en el pulmón izquierdo
    return esferaDeformada((v) => {
      const yy = v.y;
      const ap = yy > 0 ? 1 - 0.55 * yy * yy : 1 - 0.1 * yy * yy; // ápice estrecho
      let x = v.x * (v.x > 0 ? 5.0 : 5.6) * ap;
      let z = v.z * ap;
      const medial = z * lado < 0;
      z *= medial ? 2.3 : 4.3;
      let y = yy * 9;
      // base cóncava sobre el diafragma
      if (yy < 0) y += 4.2 * Math.max(0, -yy - 0.45) * (1 - Math.min(1, v.x * v.x + v.z * v.z));
      // escotadura cardíaca: delante, abajo y por dentro
      if (notch && medial) {
        const k = gauss(yy, -0.35, 0.3) * Math.max(0, v.x);
        x -= 1.6 * k;
        z -= lado * -1.1 * k;
      }
      const n = 0.25 * fbm(v.x * 2 + lado, v.y * 2, v.z * 2, 3);
      v.set(x + v.x * n, y + v.y * n * 0.5, z + v.z * n);
    }, 64, 48);
  }

  colorPulmon(x, y, z, lado) {
    const P = this.P;
    // cisura oblicua (ambos) y horizontal (sólo el derecho)
    const obl = Math.abs(y - 4 + (x + 5) * 1.1) / 1.49;
    let osc = Math.exp(-(obl * obl) / 0.04);
    if (lado < 0 && x > -1.5 && y > -2) osc = Math.max(osc, Math.exp(-((y + 0.6) * (y + 0.6)) / 0.04));
    const base = moteado(P.pulmon, x, y, z, 0.9, 0.16);
    const t = osc * 0.6;
    return [lerp(base[0], P.mucosaOscura.r, t), lerp(base[1], P.mucosaOscura.g, t), lerp(base[2], P.mucosaOscura.b, t)];
  }

  // Ramas bronquiales: 3 generaciones de tubos afilados (coordenadas del pulmón)
  arbolBronquial(grupo, lado) {
    const rnd = azar(lado > 0 ? 7 : 3);
    const piezas = [];
    const hilio = V3(0.3, 6.3, -lado * 2.2);
    const rama = (desde, dir, largo, radio, gen) => {
      const hasta = desde.clone().add(dir.clone().multiplyScalar(largo));
      const medio = desde.clone().lerp(hasta, 0.5).add(V3((rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.4));
      const pts = new THREE.CatmullRomCurve3([desde, medio, hasta]).getPoints(8);
      piezas.push({ geo: tubo(pts, elipse((s) => lerp(radio, radio * 0.7, s), (s) => lerp(radio, radio * 0.7, s)), 8) });
      if (gen >= 3) return;
      for (const sg of [-1, 1]) {
        const eje = V3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).cross(dir).normalize();
        const nd = dir.clone().applyAxisAngle(eje, sg * (0.45 + rnd() * 0.25)).normalize();
        rama(hasta, nd, largo * 0.68, radio * 0.68, gen + 1);
      }
    };
    rama(hilio, V3(0.1, 0.75, lado * 0.65).normalize(), 3.0, 0.32, 1);
    rama(hilio, V3(0.25, -0.85, lado * 0.45).normalize(), 3.6, 0.34, 1);
    rama(hilio, V3(-0.6, -0.7, lado * 0.35).normalize(), 3.4, 0.32, 1);
    const arbol = fusionar(piezas).geo;
    arbol.deleteAttribute('color');
    this.malla(arbol, this.matBronquiolo, grupo);
  }

  curvaCostilla(k, lado, elevacion) {
    // De la columna (atrás) al esternón (delante), bajando hacia delante.
    // Al inspirar se elevan (asa de cubo) y se abren un poco.
    const y = -12.3 - k * 2.15;
    const b = 2.4 - elevacion * 1.3;
    const abre = 1 + elevacion * 0.05;
    const r = 0.78 + 0.22 * Math.sin((Math.min(k, 5) / 5) * Math.PI * 0.5);
    const xs = COLUMNA.getPoint(limitar(0.42 + k * 0.045, 0, 1)).x;
    return new THREE.CatmullRomCurve3([
      V3(xs + 0.6, y + 0.1, lado * 1.3),
      V3(xs - 0.6, y + 0.35, lado * 5.0 * r),
      V3(-2.6, y - 0.3 * b, lado * 10.4 * r * abre),
      V3(2.8, y - 0.7 * b, lado * 10.2 * r * abre),
      V3(5.8, y - 0.95 * b, lado * 6.2 * r),
      V3(6.75, y - b, lado * 1.5),
    ]);
  }

  rehacerCostillas(elev) {
    const P = this.P;
    const tmpT = new THREE.Vector3();
    const lado2 = new THREE.Vector3();
    const arr = new THREE.Vector3();
    for (const c of this.costillas) {
      const curva = this.curvaCostilla(c.k, c.lado, elev);
      const n = c.a.anillos;
      for (let i = 0; i < n; i++) {
        const s = i / (n - 1);
        const p = curva.getPoint(s);
        curva.getTangent(s, tmpT);
        lado2.crossVectors(tmpT, V3(0, 1, 0)).normalize();
        arr.crossVectors(lado2, tmpT).normalize();
        const cartilago = s > 0.8;
        const alto = (cartilago ? 0.34 : 0.42) * (s < 0.06 ? 0.7 : 1);
        const grueso = (cartilago ? 0.2 : 0.16) * (1 + 0.3 * gauss(s, 0, 0.08));
        const col = cartilago ? moteado(P.cartilago, s * 9, c.k, 0, 1, 0.08) : moteado(P.hueso, s * 9, c.k, c.lado, 1, 0.1);
        for (let j = 0; j < c.a.lados; j++) {
          const a = (2 * Math.PI * j) / c.a.lados;
          const u = Math.cos(a) * grueso;
          const v = Math.sin(a) * alto;
          c.a.poner(i, j, p.x + lado2.x * u + arr.x * v, p.y + lado2.y * u + arr.y * v, p.z + lado2.z * u + arr.z * v);
          c.a.color(i, j, col[0], col[1], col[2]);
        }
      }
      c.a.terminar();
    }
    for (const ic of this.intercostales) {
      const c1 = this.curvaCostilla(ic.k, ic.lado, elev).getPoints(29);
      const c2 = this.curvaCostilla(ic.k + 1, ic.lado, elev).getPoints(29);
      for (let r = 0; r < 5; r++) {
        const t = r / 4;
        const bulto = Math.sin(Math.PI * t) * 0.18;
        for (let j = 0; j < 30; j++) {
          const p = c1[j].clone().lerp(c2[j], t);
          const fuera = V3(p.x * 0.2, 0, p.z).normalize().multiplyScalar(bulto);
          ic.a.poner(r, j, p.x + fuera.x, p.y, p.z + fuera.z);
        }
      }
      ic.a.terminar();
    }
    this.esternon.position.y = elev * 0.8;
  }

  construirParticulas() {
    this.maxParticulas = 260;
    this.particulas = [];
    const geoP = new THREE.BufferGeometry();
    geoP.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.maxParticulas * 3), 3));
    this.matParticulas = new THREE.PointsMaterial({ color: this.P.particula, size: 0.32, transparent: true, opacity: 0.85, depthWrite: false });
    this.materialesColor.push([this.matParticulas, 'particula']);
    this.puntos = new THREE.Points(geoP, this.matParticulas);
    this.puntos.renderOrder = 3;
    this.escena.add(this.puntos);
  }

  construirNombres() {
    const n = (texto, x, y, z) => this.etiquetas.push({ texto, pos: V3(x, y, z) });
    n('Fosas nasales', 5, 11.8, 0);
    n('Senos (cajas de resonancia)', 8.0, 17.6, 0);
    n('Paladar duro', 6, 9.8, 0);
    n('Velo del paladar', 0.6, 8.6, 0);
    n('Lengua', 4.5, 6.6, 0);
    n('Dientes', 8.6, 9.0, 1.6);
    n('Labios', 9.8, 8.5, 0);
    n('Mandíbula', 6.5, 5.0, 3);
    n('Faringe (garganta)', -1.4, 4, 0);
    n('Epiglotis', 0.3, 4.4, 0);
    n('Laringe', 1.9, 2.0, 0);
    n('Cuerdas vocales', 0.2, -0.2, 0);
    n('Tráquea', 0, -8, 0);
    n('Esófago', -3.2, -16, 0);
    n('Bronquios', 0, -13.5, 2);
    n('Pulmones', -0.6, -20, 10.5);
    n('Costillas e intercostales', 4, -16, 9.6);
    n('Diafragma', 3, -28.8, 0);
    for (const e of this.etiquetas) {
      const d = document.createElement('span');
      d.textContent = e.texto;
      this.capaNombres.appendChild(d);
      e.el = d;
    }
    this.fonema = document.createElement('div');
    this.fonema.className = 'fonema3d';
    this.contenedor.appendChild(this.fonema);
  }

  // ---------- Actualización por cuadro ------------------------------------------

  seccion(e, k) {
    const p = TR[k];
    const d = e.dTracto[Math.min(N - 1, k)];
    const h = Math.max(0.03, d * K);
    const t = Math.min(1, Math.max(0, (k - 39) / 3));
    const arriba = PARED * (1 - t) + (h / 2) * t;
    const centro = arriba - h / 2;
    return { p, h, centro, ancho: anchoLateral(k, e.actual.labios) };
  }

  actualizarAire(e) {
    const A = this.aire;
    const W = this.paredFaringe;
    for (let k = 0; k <= N; k++) {
      const { p, h, centro, ancho } = this.seccion(e, k);
      const cx = p.x + p.nx * centro;
      const cy = p.y + p.ny * centro;
      for (let j = 0; j < RADIAL; j++) {
        const a = (j / RADIAL) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        A.poner(k, j, cx + (p.nx * ca * h) / 2, cy + (p.ny * ca * h) / 2, (sa * ancho) / 2);
        if (k <= 20) {
          const hu = h / 2 + 0.35 + 0.05 * Math.sin(k * 1.3 + j);
          const wu = ancho / 2 + 0.4;
          W.poner(k, j, cx + p.nx * ca * hu, cy + p.ny * ca * hu, sa * wu);
        }
      }
    }
    A.terminar();
    W.terminar();
    const pres = Math.min(1, Math.max(0, e.pBoca) / 8);
    this.matAire.color.copy(this.P.aire).lerp(this.P.presion, pres);
    this.matAire.emissive.copy(this.P.presion);
    this.matAire.emissiveIntensity = Math.min(1, e.friccion) * 0.5;
  }

  actualizarLengua(e) {
    const T = this.lengua;
    const jaw = e.actual.mandibula;
    const suelo = this.curvaSuelo ||= new THREE.CatmullRomCurve3([V3(1.5, 1.6, 0), V3(3.0, 4.2, 0), V3(5.6, 6.2, 0), V3(6.9, 7.3, 0)]);
    const pts = suelo.points;
    pts[1].y = 4.2 - jaw * 0.5;
    pts[2].y = 6.2 - jaw * 1.2;
    pts[3].y = 7.3 - jaw * 1.6;
    suelo.updateArcLengths?.();
    const L = this.lenguaLados;
    const mitad = L / 2;
    for (let k = this.lenguaIni; k <= this.lenguaFin; k++) {
      const a = k - this.lenguaIni;
      const { p, h } = this.seccion(e, k);
      const mov = PARED - h;
      const mx = p.x + p.nx * mov;
      const my = p.y + p.ny * mov;
      const t = a / (this.lenguaFin - this.lenguaIni);
      const punta = t > 0.86 ? Math.sqrt(Math.max(0.02, 1 - ((t - 0.86) / 0.14) ** 2)) : 1;
      const w = (anchoLateral(k, 1.2) / 2) * 0.92 * Math.max(0.12, punta);
      const s = suelo.getPoint(t);
      // la punta se cierra: el suelo sube hacia el dorso
      const sx = lerp(mx, s.x, punta * 0.95 + 0.05);
      const sy = lerp(my, s.y, punta * 0.95 + 0.05);
      for (let j = 0; j < L; j++) {
        const arriba = j < mitad;
        const q = arriba ? j / (mitad - 1) : (j - mitad) / (mitad - 1);
        const ang = q * Math.PI;
        const zc = Math.cos(ang); // 1 → -1 (arriba) / se recorre al revés abajo
        const z = (arriba ? zc : -zc) * w;
        const borde = Math.abs(zc) ** 6 * 0.5; // bordes redondeados
        // dorso: cae hacia los lados y tiene un surco medio
        const caida = 0.45 * (z / w) ** 4 + 0.1 * gauss(z, 0, 0.35) * (1 - t * 0.5);
        const tx = mx - p.nx * caida;
        const ty = my - p.ny * caida;
        const bx = sx;
        const by = sy;
        const midx = (tx + bx) / 2;
        const midy = (ty + by) / 2;
        if (arriba) T.poner(a, j, lerp(tx, midx, borde), lerp(ty, midy, borde), z);
        else T.poner(a, j, lerp(bx, midx, borde), lerp(by, midy, borde), z * 0.8);
      }
    }
    T.terminar();
  }

  actualizarVelo(e) {
    const V = this.velo;
    const velo = e.actual.velo;
    const n = this.veloPasos.length;
    const L = V.lados;
    let punta = null;
    this.veloPasos.forEach((k, i) => {
      const p = puntoTR(k);
      const t = 1 - i / (n - 1); // 1 en la punta
      const baja = velo * 1.1 * t * t;
      const W = (anchoLateral(Math.round(k), 1.2) / 2 + 0.25) * (1 - 0.35 * t);
      const grueso = lerp(0.75, 0.45, t);
      for (let j = 0; j < L; j++) {
        const abajo = j < L / 2;
        const q = abajo ? j / (L / 2 - 1) : (j - L / 2) / (L / 2 - 1);
        const z = abajo ? lerp(-W, W, q) : lerp(W, -W, q);
        const c = Math.max(0, 1 - (z / W) * (z / W));
        let d = PARED - baja + 0.12 * Math.sqrt(c);
        if (!abajo) d += grueso * Math.sqrt(c) + 0.05;
        V.poner(i, j, p.x + p.nx * d, p.y + p.ny * d, z);
      }
      if (i === 0) punta = { x: p.x + p.nx * (PARED - baja + 0.2), y: p.y + p.ny * (PARED - baja + 0.2) };
    });
    V.terminar();
    this.uvula.position.set(punta.x, punta.y, 0);
    this.uvula.rotation.z = -0.25 * velo;
  }

  actualizarLabios(e) {
    const a = e.actual;
    const lab = e.dTracto[N - 1] * K;
    const wl = anchoLateral(N, a.labios) / 2 + 0.35;
    const adelante = 9.35 + 0.55 * Math.max(0, 1 - a.labios / 0.6);
    const yc = TR[N].y;
    for (const [M, sup] of [[this.labioSup, true], [this.labioInf, false]]) {
      const n = M.anillos;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const s = 2 * t - 1;
        const z = s * wl;
        const r = (sup ? 0.1 + 0.36 * (1 - s * s) ** 0.6 : 0.12 + 0.42 * (1 - s * s) ** 0.6);
        const cupido = sup ? 0.1 * (gauss(z, 0.35, 0.22) + gauss(z, -0.35, 0.22)) - 0.06 * gauss(z, 0, 0.16) : 0;
        const tuberculo = sup ? 0.12 * gauss(z, 0, 0.35) : 0.05 * gauss(z, 0, 0.6);
        const x0 = adelante - 0.95 * s * s + tuberculo - (sup ? 0 : 0.12);
        const y0 = sup ? yc + lab / 2 + r * 0.85 + cupido : yc - lab / 2 - r * 0.9;
        for (let j = 0; j < M.lados; j++) {
          const ang = (2 * Math.PI * j) / M.lados;
          M.poner(i, j, x0 + Math.cos(ang) * r, y0 + Math.sin(ang) * r * 0.85, z);
        }
      }
      M.terminar();
    }
  }

  actualizarNariz(e) {
    const M = this.nariz;
    for (let k = 0; k <= NARIZ_N; k++) {
      const t = k / NARIZ_N;
      const p = this.puntosNariz[k];
      const tg = this.tangNariz[k];
      const nx = -tg.y;
      const ny = tg.x;
      let d = e.dNariz[Math.min(NARIZ_N - 1, k)];
      if (k === 0) d = Math.max(0.05, d);
      const h = d * 0.9;
      const w = k === 0 ? 1.4 : 1.2 + 0.6 * Math.sin(Math.PI * Math.min(1, t * 1.3));
      for (let j = 0; j < RADIAL; j++) {
        const a = (j / RADIAL) * Math.PI * 2;
        M.poner(k, j, p.x + (nx * Math.cos(a) * h) / 2, p.y + (ny * Math.cos(a) * h) / 2, (Math.sin(a) * w) / 2);
      }
    }
    M.terminar();
  }

  actualizarCuerpo(e) {
    const a = e.actual;
    this.mandibula.rotation.z = -a.mandibula * 0.32;

    // Laringe (sube y baja) y cuerdas vocales
    this.laringe.position.y = (a.laringe - 0.5) * 1.2;
    const ap = Math.min(1, e.areaGlotis / 1.6 + e.aperturaGlotis * 0.35);
    for (const c of this.cuerdas) c.rotation.y = c.userData.lado * (0.03 + ap * 0.45);

    // Pulmones: se inflan con el volumen y cambian de tono con la presión
    const s = 0.88 + 0.16 * ((e.volumen - 1.2) / 4.8);
    for (const g of this.pulmones) g.scale.set(s, 0.92 + 0.08 * s + e.diafragma * 0.06, s);
    const pres = Math.min(1, Math.abs(e.pPulmon) / 15);
    this.matPulmon.color.setRGB(1, 1, 1).lerp(e.pPulmon > 0 ? this.P.presion : this.P.aire, pres * 0.35);

    // Costillas
    const elev = Math.max(-0.6, Math.min(1, 0.8 * e.intercostalesExt - 0.6 * e.intercostalesInt + 0.25 * (e.volumen - 2.5)));
    if (Math.abs(elev - (this.elevPrev ?? 99)) > 0.025) {
      this.elevPrev = elev;
      this.rehacerCostillas(elev);
    }
    this.matIntercostal.opacity = 0.2 + 0.6 * Math.max(e.intercostalesExt, e.intercostalesInt);

    // Diafragma: baja y se aplana al contraerse
    const [RX, RZ] = this.diaRes;
    const D = this.diafragma;
    const alto = 3.8 - 2.2 * e.diafragma;
    const base = -30.2 - 1.2 * e.diafragma;
    for (let i = 0; i <= RX; i++) {
      const rho = i / RX;
      for (let j = 0; j < RZ; j++) {
        const phi = (2 * Math.PI * j) / RZ;
        const u = rho * Math.cos(phi);
        const v = rho * Math.sin(phi);
        const r2 = rho * rho;
        // dos cúpulas (más alta la derecha) con el centro tendinoso algo hundido
        const domo = 1 - r2 + 0.18 * Math.cos(v * Math.PI) * (1 - r2) + 0.06 * v * (1 - r2);
        // el borde se inserta en las costillas bajas: cae hacia atrás
        const borde = rho > 0.85 ? -0.9 * ((rho - 0.85) / 0.15) ** 2 * (1 - 0.6 * Math.cos(phi)) : 0;
        D.poner(i, j, u * 7.4, base + alto * domo + borde, v * 9.6);
      }
    }
    D.terminar();
    this.matDiafragma.opacity = 0.55 + 0.35 * e.diafragma;

    const brillo = a.resonancia * Math.min(1, Math.max(0, e.flujoNariz) * 2 + e.nivel * 3);
    this.matSenos.emissiveIntensity = brillo * 0.8;
    this.matSenos.opacity = 0.25 + 0.35 * brillo;
  }

  // Punto del camino del aire: 0 = pulmones, 1 = fuera.
  puntoCamino(s, via, lado, e, out) {
    const seg = s * 3;
    if (seg < 1) {
      if (seg < 0.5) {
        const b = this.caminosBronquio[lado > 0 ? 1 : 0].getPoint(1 - seg * 2);
        return out.copy(b);
      }
      return out.set(0, -12 + (seg - 0.5) * 2 * 12, 0);
    }
    if (seg < 2 || via === 'boca') {
      const kmax = via === 'boca' ? N : INDICE_VELO;
      const t = via === 'boca' ? (seg - 1) / 2 : seg - 1;
      const k = Math.min(kmax, t * kmax);
      const i = Math.min(N - 1, Math.floor(k));
      const f = k - i;
      const a = this.seccion(e, i);
      const b = this.seccion(e, i + 1);
      out.set(
        lerp(a.p.x + a.p.nx * a.centro, b.p.x + b.p.nx * b.centro, f),
        lerp(a.p.y + a.p.ny * a.centro, b.p.y + b.p.ny * b.centro, f),
        0,
      );
      if (via === 'boca' && t >= 1) out.x += (t - 1) * 6;
      return out;
    }
    const t = Math.min(1.08, seg - 2);
    out.copy(CAMINO_NARIZ.getPoint(Math.min(1, t)));
    if (t > 1) out.x += (t - 1) * 8;
    return out;
  }

  actualizarParticulas(e, dt) {
    const total = Math.abs(e.flujoGlotis);
    const sale = e.flujoGlotis >= 0;
    this.acum = (this.acum || 0) + Math.min(140, total * 170) * dt;
    while (this.acum > 1 && this.particulas.length < this.maxParticulas) {
      this.acum -= 1;
      const fb = Math.abs(e.flujoBoca);
      const fn = Math.abs(e.flujoNariz);
      const via = Math.random() * (fb + fn + 1e-6) < fn ? 'nariz' : 'boca';
      this.particulas.push({ s: sale ? 0 : 1, via, lado: Math.random() < 0.5 ? -1 : 1, dz: (Math.random() - 0.5) * 1.2, dy: (Math.random() - 0.5) * 0.4 });
    }
    if (this.acum > 1) this.acum = 0;
    const vel = Math.min(1.2, 0.18 + total * 0.9) * dt * (sale ? 1 : -1);
    const pos = this.puntos.geometry.attributes.position.array;
    const v = new THREE.Vector3();
    this.particulas = this.particulas.filter((p) => p.s >= 0 && p.s <= 1.08);
    let o = 0;
    for (const p of this.particulas) {
      p.s += vel;
      this.puntoCamino(Math.min(1.08, Math.max(0, p.s)), p.via, p.lado, e, v);
      pos[o++] = v.x;
      pos[o++] = v.y + p.dy;
      pos[o++] = v.z + p.dz;
    }
    for (let i = this.particulas.length; i < this.maxParticulas; i++) {
      pos[o++] = 0;
      pos[o++] = -999;
      pos[o++] = 0;
    }
    this.puntos.geometry.attributes.position.needsUpdate = true;
    this.puntos.geometry.computeBoundingSphere();
  }

  actualizarNombres() {
    const w = this.contenedor.clientWidth;
    const h = this.contenedor.clientHeight;
    this.capaNombres.hidden = !this.mostrarNombres;
    if (!this.mostrarNombres) return;
    const v = new THREE.Vector3();
    const ocupadas = [];
    for (const e of this.etiquetas) {
      v.copy(e.pos).project(this.camara);
      const x = ((v.x + 1) / 2) * w;
      const y = ((1 - v.y) / 2) * h;
      const ancho = (e.ancho ||= e.texto.length * 6.6 + 14);
      let visible = v.z < 1 && x > 0 && x + ancho < w - 4 && y > 40 && y < h - 56;
      if (visible) {
        for (const o of ocupadas) {
          if (x < o.x + o.w && x + ancho > o.x && Math.abs(y - o.y) < 19) {
            visible = false;
            break;
          }
        }
      }
      e.el.style.display = visible ? '' : 'none';
      if (!visible) continue;
      ocupadas.push({ x, y, w: ancho });
      e.el.style.transform = `translate(${x}px, ${y}px)`;
    }
  }

  dibujar(e) {
    // tiempo real entre cuadros (para las partículas y la calidad adaptativa)
    const ahora = performance.now();
    const dt = Math.min(0.1, (ahora - (this.tPrevio ?? ahora - 16)) / 1000);
    this.tPrevio = ahora;
    this.adaptarCalidad(dt);
    this.actualizarAire(e);
    this.actualizarLengua(e);
    this.actualizarVelo(e);
    this.actualizarLabios(e);
    this.actualizarNariz(e);
    this.actualizarCuerpo(e);
    this.actualizarParticulas(e, dt);
    this.controles.update();
    this.renderer.render(this.escena, this.camara);
    this.actualizarNombres();
    const et = e.etiqueta && e.etiqueta !== 'inspira' ? '/' + e.etiqueta + '/' : '';
    if (this.fonema.textContent !== et) this.fonema.textContent = et;
  }

  // Si el equipo no llega (cuadros de más de 35 ms), baja la resolución.
  adaptarCalidad(dt) {
    this.dtMedio = (this.dtMedio ?? dt) * 0.95 + dt * 0.05;
    this.cuadros = (this.cuadros || 0) + 1;
    if (this.cuadros < 120 || this.cuadros % 60) return;
    const pr = this.renderer.getPixelRatio();
    if (this.dtMedio > 0.035 && pr > 0.75) {
      this.renderer.setPixelRatio(Math.max(0.75, pr - 0.25));
      this.ajustar();
    }
  }

  // Encuadres rápidos
  vista(nombre) {
    const t = this.controles.target;
    if (nombre === 'cabeza') {
      t.set(4, 8, 0);
      this.camara.position.set(12, 11, 38);
    } else if (nombre === 'perfil') {
      t.set(1, -6, 0);
      this.camara.position.set(1, -6, 112);
    } else if (nombre === 'frente') {
      t.set(1, -5, 0);
      this.camara.position.set(110, 2, 0);
    } else {
      t.set(1, -6, 0);
      this.camara.position.set(36, 4, 104);
    }
  }
}
