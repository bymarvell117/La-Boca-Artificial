// Aparato fonador en 3D (Three.js). Se actualiza cada cuadro con el estado
// de la simulación: el tubo de aire, la lengua, el velo, la mandíbula, los
// labios, las cuerdas vocales, los pulmones, las costillas y el diafragma se
// mueven según la física.
//
// Unidades: centímetros. Ejes: x hacia delante (cara), y hacia arriba,
// z lateral. El origen está en la glotis.

import * as THREE from 'three';
import { OrbitControls } from '../../vendor/OrbitControls.js';
import { N, NARIZ_N, INDICE_VELO, INDICE_DIENTES } from '../core/anatomia.js';

const K = 1.0; // cm de alto de la vía por unidad de diámetro de la simulación
const PARED = 0.9; // distancia de la línea media a la pared fija
const RADIAL = 18; // vértices por anillo del tubo de aire

// ---------- Línea media del tracto ------------------------------------------

function lineaTracto() {
  // vertical (faringe) → curva → horizontal (boca), 16.6 cm en total
  const L1 = 6.5;
  const R = 2;
  const L2 = Math.PI; // arco de 90° con radio 2
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

// Ancho lateral de la vía (cm) a lo largo del tracto.
function anchoLateral(k, labios) {
  if (k < 3) return 1.4 + 0.3 * k;
  if (k < 17) return 3.0;
  if (k < 25) return 3.2;
  if (k < 37) return 4.0;
  if (k < 40) return 3.6;
  // labios: se estrechan al redondear (/o/, /u/)
  const redondeo = Math.min(1, labios / 1.0);
  return 2.0 + 2.2 * redondeo;
}

// Línea media de la cavidad nasal (desde la puerta del velo hasta la narina)
const CAMINO_NARIZ = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-1.2, 6.4, 0),
  new THREE.Vector3(-1.1, 8.6, 0),
  new THREE.Vector3(-0.2, 10.4, 0),
  new THREE.Vector3(2.5, 11.0, 0),
  new THREE.Vector3(5.5, 11.0, 0),
  new THREE.Vector3(8.0, 10.6, 0),
  new THREE.Vector3(9.6, 9.8, 0),
]);

// ---------- Utilidades de mallas ---------------------------------------------

// Malla de anillos (tubo cerrado o lámina) con índices fijos.
function mallaAnillos(anillos, porAnillo, cerrado) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(anillos * porAnillo * 3), 3));
  const idx = [];
  const lim = cerrado ? porAnillo : porAnillo - 1;
  for (let a = 0; a < anillos - 1; a++) {
    for (let j = 0; j < lim; j++) {
      const j2 = (j + 1) % porAnillo;
      const p = a * porAnillo;
      const q = (a + 1) * porAnillo;
      idx.push(p + j, q + j, p + j2, p + j2, q + j, q + j2);
    }
  }
  geo.setIndex(idx);
  return geo;
}

function material(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.0, side: THREE.DoubleSide, ...extra });
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
    contenedor.appendChild(r.domElement);
    this.renderer = r;

    this.escena = new THREE.Scene();
    this.camara = new THREE.PerspectiveCamera(35, 1, 0.5, 400);
    this.camara.position.set(30, 2, 96);
    this.controles = new OrbitControls(this.camara, r.domElement);
    this.controles.target.set(2, -4, 0);
    this.controles.enableDamping = true;
    this.controles.minDistance = 12;
    this.controles.maxDistance = 140;

    this.escena.add(new THREE.HemisphereLight(0xffffff, 0x886666, 1.6));
    const sol = new THREE.DirectionalLight(0xffffff, 1.6);
    sol.position.set(20, 30, 40);
    this.escena.add(sol);
    const contra = new THREE.DirectionalLight(0xffffff, 0.6);
    contra.position.set(-30, 10, -30);
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
    const P = this.P;
    for (const [m, k] of this.materialesColor) m.color.copy(P[k]);
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

  // ---------- Construcción ------------------------------------------------------

  construir() {
    const P = this.P;
    const esc = this.escena;
    this.materialesColor = [];
    this.materialesCortables = [];
    const mat = (k, extra = {}, cortable = true) => {
      const m = material(P[k], extra);
      this.materialesColor.push([m, k]);
      if (cortable) this.materialesCortables.push(m);
      return m;
    };

    // --- Piel (cabeza, cuello y tronco) translúcida
    this.grupoPiel = new THREE.Group();
    const piel = mat('piel', { transparent: true, opacity: 0.16, depthWrite: false, side: THREE.FrontSide });
    const pieza = (geo, x, y, z, sx = 1, sy = 1, sz = 1) => {
      const m = new THREE.Mesh(geo, piel);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      this.grupoPiel.add(m);
      return m;
    };
    pieza(new THREE.SphereGeometry(1, 40, 28), 1.2, 15.2, 0, 8.6, 9.2, 7.6); // cráneo
    pieza(new THREE.SphereGeometry(1, 40, 28), 5.2, 9.0, 0, 5.4, 7.2, 5.6); // cara y mandíbula
    const nariz = pieza(new THREE.ConeGeometry(1.25, 3.4, 20), 10.0, 11.0, 0);
    nariz.rotation.z = -Math.PI / 2 - 0.5;
    pieza(new THREE.CylinderGeometry(4.6, 5.0, 16, 32), 0.2, -2, 0); // cuello
    pieza(new THREE.CapsuleGeometry(1, 1, 12, 32), 0.5, -22, 0, 8.5, 9.5, 13.5); // tronco
    for (const lado of [-1, 1]) pieza(new THREE.SphereGeometry(1, 16, 12), -1.2, 11.8, lado * 7.3, 1.1, 2.2, 0.45); // orejas
    esc.add(this.grupoPiel);

    // --- Columna vertebral
    const hueso = mat('hueso');
    const columna = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-3.2, 9, 0), new THREE.Vector3(-3.0, 2, 0), new THREE.Vector3(-3.6, -6, 0),
      new THREE.Vector3(-6.0, -14, 0), new THREE.Vector3(-6.6, -24, 0), new THREE.Vector3(-6.0, -33, 0),
    ]);
    for (let t = 0; t <= 1.0001; t += 1 / 26) {
      const p = columna.getPoint(t);
      const v = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.1, 14), hueso);
      v.position.copy(p);
      esc.add(v);
    }

    // --- Tubo de aire del tracto (se deforma cada cuadro)
    this.matAire = new THREE.MeshStandardMaterial({ color: P.aire, transparent: true, opacity: 0.55, roughness: 0.3, side: THREE.DoubleSide, depthWrite: false });
    this.materialesColor.push([this.matAire, 'aire']);
    this.geoAire = mallaAnillos(N + 1, RADIAL, true);
    this.aire = new THREE.Mesh(this.geoAire, this.matAire);
    this.aire.renderOrder = 2;
    esc.add(this.aire);

    // --- Pared de la faringe, paladar duro y velo (tejidos fijos)
    this.geoFaringe = this.lamina(0, INDICE_VELO, 0.8, 1.2);
    esc.add(new THREE.Mesh(this.geoFaringe, mat('mucosa')));
    esc.add(new THREE.Mesh(this.lamina(25, 38, 0.55, 0.5), mat('hueso')));
    this.geoVelo = this.lamina(INDICE_VELO, 26, 0.9, 0.4);
    esc.add(new THREE.Mesh(this.geoVelo, mat('mucosaOscura')));

    // --- Lengua (se deforma)
    this.lenguaIni = 5;
    this.lenguaFin = 38;
    this.lenguaArriba = 11; // puntos del dorso por anillo
    const anillosLengua = this.lenguaFin - this.lenguaIni + 1;
    this.geoLengua = mallaAnillos(anillosLengua, this.lenguaArriba * 2, true);
    this.lengua = new THREE.Mesh(this.geoLengua, mat('lengua', { roughness: 0.75 }));
    esc.add(this.lengua);

    // --- Cavidad nasal y senos paranasales (cajas de resonancia)
    this.geoNariz = mallaAnillos(NARIZ_N + 1, RADIAL, true);
    this.matNariz = new THREE.MeshStandardMaterial({ color: P.aire, transparent: true, opacity: 0.45, roughness: 0.3, side: THREE.DoubleSide, depthWrite: false });
    this.materialesColor.push([this.matNariz, 'aire']);
    esc.add(new THREE.Mesh(this.geoNariz, this.matNariz));
    // tabique y cornetes
    const cornete = mat('mucosaOscura');
    for (const [x, y] of [[3.2, 10.6], [5.0, 10.4], [6.6, 10.2]]) {
      for (const lado of [-1, 1]) {
        const c = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 1.4, 6, 10), cornete);
        c.rotation.z = Math.PI / 2;
        c.position.set(x, y, lado * 0.75);
        esc.add(c);
      }
    }
    this.senos = [];
    this.matSenos = new THREE.MeshStandardMaterial({ color: P.aire, transparent: true, opacity: 0.3, emissive: P.aire, emissiveIntensity: 0.0, depthWrite: false });
    this.materialesColor.push([this.matSenos, 'aire']);
    const seno = (x, y, z, sx, sy, sz) => {
      const s = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), this.matSenos);
      s.position.set(x, y, z);
      s.scale.set(sx, sy, sz);
      esc.add(s);
      this.senos.push(s);
    };
    seno(7.6, 14.0, 0, 0.9, 1.0, 1.9); // frontal
    for (const lado of [-1, 1]) seno(5.4, 10.1, lado * 2.5, 1.6, 1.2, 1.0); // maxilares
    seno(0.4, 11.3, 0, 0.9, 0.8, 1.0); // esfenoidal

    // --- Dientes superiores (fijos)
    const diente = mat('diente', { roughness: 0.25 });
    this.arcoDental(diente, 9.45, -1, esc);

    // --- Mandíbula: dientes inferiores, hueso y labio inferior (giran juntos)
    this.mandibula = new THREE.Group();
    this.mandibula.position.set(-0.6, 9.8, 0); // articulación temporomandibular
    esc.add(this.mandibula);
    const interior = new THREE.Group();
    interior.position.set(0.6, -9.8, 0);
    this.mandibula.add(interior);
    this.arcoDental(diente, 7.55, 1, interior);
    const hueso2 = mat('hueso');
    const forma = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.4, 9.6, 4.2), new THREE.Vector3(0.2, 5.6, 4.4), new THREE.Vector3(4.8, 5.0, 3.8),
      new THREE.Vector3(8.2, 6.2, 0), new THREE.Vector3(4.8, 5.0, -3.8), new THREE.Vector3(0.2, 5.6, -4.4),
      new THREE.Vector3(-0.4, 9.6, -4.2),
    ]);
    interior.add(new THREE.Mesh(new THREE.TubeGeometry(forma, 60, 0.55, 10, false), hueso2));

    // --- Labios
    const labio = mat('labio', { roughness: 0.45 });
    this.labioSup = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1, 8, 16), labio);
    this.labioInf = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1, 8, 16), labio);
    for (const l of [this.labioSup, this.labioInf]) {
      l.rotation.x = Math.PI / 2;
      esc.add(l);
    }

    // --- Laringe: tiroides, cricoides, epiglotis y cuerdas vocales
    this.laringe = new THREE.Group();
    esc.add(this.laringe);
    const cart = mat('cartilago');
    const tiroides = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.5, 2.8, 24, 1, true, -Math.PI * 0.42, Math.PI * 0.84), cart);
    tiroides.rotation.y = Math.PI / 2;
    tiroides.position.set(-0.2, 0.5, 0);
    this.laringe.add(tiroides);
    const cricoides = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.28, 10, 28), cart);
    cricoides.rotation.x = Math.PI / 2;
    cricoides.position.set(0, -1.3, 0);
    this.laringe.add(cricoides);
    const epi = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI), cart);
    epi.scale.set(0.25, 1.4, 1.0);
    epi.rotation.y = Math.PI / 2;
    epi.position.set(1.1, 3.6, 0);
    epi.rotation.z = 0.25;
    this.laringe.add(epi);
    this.cuerdas = [];
    const matCuerda = mat('diente', { roughness: 0.35 }, false);
    for (const lado of [-1, 1]) {
      const pivote = new THREE.Group();
      pivote.position.set(0.9, 0, 0); // se unen delante (comisura anterior)
      const c = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.35, 0.45), matCuerda);
      c.position.set(-0.95, 0, lado * 0.25);
      pivote.add(c);
      pivote.userData.lado = lado;
      this.laringe.add(pivote);
      this.cuerdas.push(pivote);
    }

    // --- Tráquea y bronquios
    const mucosa = mat('mucosa');
    const traquea = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 10.5, 20, 1, true), mucosa);
    traquea.position.set(0, -6.8, 0);
    esc.add(traquea);
    for (let y = -2.2; y > -12; y -= 0.85) {
      const anillo = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.14, 8, 22, Math.PI * 1.6), cart);
      anillo.rotation.x = Math.PI / 2;
      anillo.rotation.z = Math.PI * 0.2;
      anillo.position.set(0, y, 0);
      esc.add(anillo);
    }
    this.caminosBronquio = [];
    for (const lado of [-1, 1]) {
      const curva = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, -12, 0), new THREE.Vector3(0, -13.2, lado * 1.4), new THREE.Vector3(-0.4, -15.5, lado * 4.2),
      ]);
      esc.add(new THREE.Mesh(new THREE.TubeGeometry(curva, 20, 0.55, 12, false), mucosa));
      this.caminosBronquio.push(curva);
    }

    // --- Pulmones
    this.matPulmon = mat('pulmon', { transparent: true, opacity: 0.8, roughness: 0.85 });
    this.pulmones = [];
    for (const lado of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 30), this.matPulmon);
      p.position.set(-0.4, -20.5, lado * 5.6);
      p.userData.lado = lado;
      esc.add(p);
      this.pulmones.push(p);
    }

    // --- Costillas, esternón e intercostales
    this.costillas = [];
    const matCostilla = mat('hueso', { transparent: true, opacity: 0.9 });
    this.matIntercostal = mat('musculo', { transparent: true, opacity: 0.3, depthWrite: false });
    for (let k = 0; k < 8; k++) {
      for (const lado of [-1, 1]) {
        const geo = new THREE.TubeGeometry(this.curvaCostilla(k, lado, 0), 40, 0.32, 8, false);
        const m = new THREE.Mesh(geo, matCostilla);
        m.userData = { k, lado };
        esc.add(m);
        this.costillas.push(m);
      }
    }
    this.geoIntercostales = [];
    for (let k = 0; k < 7; k++) {
      for (const lado of [-1, 1]) {
        const geo = mallaAnillos(2, 30, false);
        esc.add(new THREE.Mesh(geo, this.matIntercostal));
        this.geoIntercostales.push({ geo, k, lado });
      }
    }
    const esternon = new THREE.Mesh(new THREE.BoxGeometry(0.7, 12, 2.2), hueso);
    esternon.position.set(6.6, -19.5, 0);
    esternon.rotation.z = -0.12;
    this.esternon = esternon;
    esc.add(esternon);

    // --- Diafragma
    this.geoDiafragma = new THREE.BufferGeometry();
    const RX = 16;
    const RZ = 24;
    const pos = new Float32Array((RX + 1) * (RZ + 1) * 3);
    this.geoDiafragma.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const idx = [];
    for (let i = 0; i < RX; i++) {
      for (let j = 0; j < RZ; j++) {
        const a = i * (RZ + 1) + j;
        idx.push(a, a + RZ + 1, a + 1, a + 1, a + RZ + 1, a + RZ + 2);
      }
    }
    this.geoDiafragma.setIndex(idx);
    this.matDiafragma = mat('musculo', { transparent: true, opacity: 0.85 });
    esc.add(new THREE.Mesh(this.geoDiafragma, this.matDiafragma));
    this.diaRes = [RX, RZ];

    // --- Partículas de aire
    this.maxParticulas = 260;
    this.particulas = [];
    const geoP = new THREE.BufferGeometry();
    geoP.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.maxParticulas * 3), 3));
    this.matParticulas = new THREE.PointsMaterial({ color: P.particula, size: 0.32, transparent: true, opacity: 0.85, depthWrite: false });
    this.materialesColor.push([this.matParticulas, 'particula']);
    this.puntos = new THREE.Points(geoP, this.matParticulas);
    this.puntos.renderOrder = 3;
    esc.add(this.puntos);

    // --- Nombres
    const n = (texto, x, y, z) => this.etiquetas.push({ texto, pos: new THREE.Vector3(x, y, z) });
    n('Fosas nasales', 5, 11.6, 0);
    n('Senos (cajas de resonancia)', 7.6, 15.1, 0);
    n('Paladar duro', 6, 9.7, 0);
    n('Velo del paladar', 0.6, 8.6, 0);
    n('Lengua', 4.5, 6.6, 0);
    n('Dientes', 8.6, 9.0, 1.6);
    n('Labios', 9.6, 8.5, 0);
    n('Mandíbula', 6.5, 5.4, 3);
    n('Faringe (garganta)', -1.4, 4, 0);
    n('Laringe', 1.9, 2.0, 0);
    n('Cuerdas vocales', 0.2, -0.2, 0);
    n('Tráquea', 0, -8, 0);
    n('Bronquios', 0, -13.5, 2);
    n('Pulmones', -0.4, -20, 9.5);
    n('Costillas e intercostales', 5, -16, 7.5);
    n('Diafragma', 3, -28.5, 0);
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

  // Arco dental de 16 piezas. `y`: altura del borde; `dir`: -1 cuelgan, +1 suben.
  arcoDental(mat, y, dir, padre) {
    const n = 8;
    for (const lado of [-1, 1]) {
      for (let i = 0; i < n; i++) {
        const th = ((i + 0.5) / n) * (Math.PI / 2);
        const x = 7.0 - 3.9 * (1 - Math.cos(th)) - (dir > 0 ? 0.25 : 0);
        const z = lado * 2.7 * Math.sin(th);
        const incisivo = i < 2;
        const alto = incisivo ? 1.0 : 0.8;
        const geo = incisivo ? new THREE.BoxGeometry(0.28, alto, 0.62) : new THREE.BoxGeometry(0.75 + i * 0.04, alto, 0.7);
        const d = new THREE.Mesh(geo, mat);
        d.position.set(x, y + (dir * alto) / 2, z);
        d.rotation.y = -lado * th;
        padre.add(d);
      }
    }
  }

  // Lámina de tejido detrás de la pared fija del tracto (k0..k1).
  lamina(k0, k1, grosor, extraAncho) {
    const geo = mallaAnillos(k1 - k0 + 1, 8, true);
    this.rellenarLamina(geo, k0, k1, grosor, extraAncho, 0);
    return geo;
  }

  rellenarLamina(geo, k0, k1, grosor, extraAncho, bajada) {
    const pos = geo.attributes.position.array;
    let o = 0;
    for (let k = k0; k <= k1; k++) {
      const p = TR[k];
      const w = (anchoLateral(k, 1.2) + extraAncho) / 2;
      // bajada: el velo baja su punta hacia la lengua
      const t = k1 > k0 ? 1 - (k - k0) / (k1 - k0) : 0;
      const b = bajada * t * t;
      const base = PARED - b;
      const esquinas = [
        [base, -w], [base, 0], [base, w], [base + grosor / 2, w],
        [base + grosor, w], [base + grosor, 0], [base + grosor, -w], [base + grosor / 2, -w],
      ];
      for (const [d, z] of esquinas) {
        const curva = 0.25 * (z / w) * (z / w) * (d === base ? -1 : 0);
        pos[o++] = p.x + p.nx * (d + curva);
        pos[o++] = p.y + p.ny * (d + curva);
        pos[o++] = z;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
  }

  curvaCostilla(k, lado, elevacion) {
    // Las costillas van de la columna (atrás) al esternón (delante),
    // bajando hacia delante. Al inspirar se elevan (asa de cubo).
    const y = -12.5 - k * 2.05;
    const bajada = 2.2 - elevacion * 1.2;
    const abre = 1 + elevacion * 0.05;
    const r = 1 + Math.sin((Math.min(k, 5) / 5) * Math.PI * 0.5) * 0.25;
    return new THREE.CatmullRomCurve3([
      new THREE.Vector3(-6.4, y, lado * 0.9),
      new THREE.Vector3(-5.2, y + 0.3, lado * 4.8 * r),
      new THREE.Vector3(-1.2, y - bajada * 0.35, lado * 7.6 * r * abre),
      new THREE.Vector3(3.6, y - bajada * 0.75, lado * 6.6 * r * abre),
      new THREE.Vector3(6.4, y - bajada, lado * 1.4),
    ]);
  }

  // ---------- Actualización por cuadro ------------------------------------------

  // Paredes del tracto: punto fijo y móvil (centro y alto) para el índice k.
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
    const pos = this.geoAire.attributes.position.array;
    let o = 0;
    for (let k = 0; k <= N; k++) {
      const { p, h, centro, ancho } = this.seccion(e, k);
      const cx = p.x + p.nx * centro;
      const cy = p.y + p.ny * centro;
      for (let j = 0; j < RADIAL; j++) {
        const a = (j / RADIAL) * Math.PI * 2;
        const u = (Math.cos(a) * h) / 2;
        pos[o++] = cx + p.nx * u;
        pos[o++] = cy + p.ny * u;
        pos[o++] = (Math.sin(a) * ancho) / 2;
      }
    }
    this.geoAire.attributes.position.needsUpdate = true;
    this.geoAire.computeVertexNormals();
    this.geoAire.computeBoundingSphere();
    const pres = Math.min(1, Math.max(0, e.pBoca) / 8);
    this.matAire.color.copy(this.P.aire).lerp(this.P.presion, pres);
    this.matAire.emissive.copy(this.P.presion);
    this.matAire.emissiveIntensity = Math.min(1, e.friccion) * 0.5;
  }

  actualizarLengua(e) {
    const pos = this.geoLengua.attributes.position.array;
    const jaw = e.actual.mandibula;
    // suelo de la boca: del hioides a detrás de los incisivos inferiores
    const suelo = new THREE.CatmullRomCurve3([
      new THREE.Vector3(1.5, 1.6, 0),
      new THREE.Vector3(3.0, 4.2 - jaw * 0.5, 0),
      new THREE.Vector3(5.6, 6.2 - jaw * 1.2, 0),
      new THREE.Vector3(6.9, 7.3 - jaw * 1.6, 0),
    ]);
    const T = this.lenguaArriba;
    let o = 0;
    for (let k = this.lenguaIni; k <= this.lenguaFin; k++) {
      const { p, h } = this.seccion(e, k);
      const mov = PARED - h; // pared móvil (superficie de la lengua)
      const mx = p.x + p.nx * mov;
      const my = p.y + p.ny * mov;
      const t = (k - this.lenguaIni) / (this.lenguaFin - this.lenguaIni);
      const punta = t > 0.9 ? 1 - (t - 0.9) * 6 : 1; // la punta se afina
      const w = (anchoLateral(k, 1.2) / 2) * 0.92 * Math.max(0.35, punta);
      const s = suelo.getPoint(t);
      for (let j = 0; j < T; j++) {
        const z = -w + (2 * w * j) / (T - 1);
        const caida = 0.5 * (z / w) * (z / w);
        pos[o++] = mx - p.nx * caida;
        pos[o++] = my - p.ny * caida;
        pos[o++] = z;
      }
      for (let j = T - 1; j >= 0; j--) {
        const z = (-w + (2 * w * j) / (T - 1)) * 0.75;
        pos[o++] = s.x;
        pos[o++] = s.y;
        pos[o++] = z;
      }
    }
    this.geoLengua.attributes.position.needsUpdate = true;
    this.geoLengua.computeVertexNormals();
    this.geoLengua.computeBoundingSphere();
  }

  actualizarNariz(e) {
    const pos = this.geoNariz.attributes.position.array;
    let o = 0;
    const tmp = new THREE.Vector3();
    for (let k = 0; k <= NARIZ_N; k++) {
      const t = k / NARIZ_N;
      const p = this.CAMINO_PUNTOS?.[k] || CAMINO_NARIZ.getPoint(t);
      const tg = CAMINO_NARIZ.getTangent(t);
      const nx = -tg.y;
      const ny = tg.x;
      let d = e.dNariz[Math.min(NARIZ_N - 1, k)];
      if (k === 0) d = Math.max(0.05, d);
      const h = d * 0.9;
      const w = k === 0 ? 1.4 : 1.2 + 0.6 * Math.sin(Math.PI * Math.min(1, t * 1.3));
      for (let j = 0; j < RADIAL; j++) {
        const a = (j / RADIAL) * Math.PI * 2;
        tmp.set(p.x + (nx * Math.cos(a) * h) / 2, p.y + (ny * Math.cos(a) * h) / 2, (Math.sin(a) * w) / 2);
        pos[o++] = tmp.x;
        pos[o++] = tmp.y;
        pos[o++] = tmp.z;
      }
    }
    this.geoNariz.attributes.position.needsUpdate = true;
    this.geoNariz.computeVertexNormals();
    this.geoNariz.computeBoundingSphere();
  }

  actualizarCuerpo(e) {
    const a = e.actual;
    // Velo: baja la punta para abrir la nariz
    this.rellenarLamina(this.geoVelo, INDICE_VELO, 26, 0.9, 0.4, a.velo * 1.1);

    // Mandíbula
    this.mandibula.rotation.z = -a.mandibula * 0.32;

    // Labios: alto según la apertura, ancho según el redondeo, adelantados al redondear
    const lab = e.dTracto[N - 1] * K;
    const ancho = anchoLateral(N, a.labios);
    const adelante = 9.2 + 0.5 * Math.max(0, 1 - a.labios / 0.6);
    const yc = TR[N].y;
    this.labioSup.position.set(adelante, yc + lab / 2 + 0.42, 0);
    this.labioInf.position.set(adelante - 0.1, yc - lab / 2 - 0.45, 0);
    this.labioSup.scale.set(1, ancho / 1.8, 1);
    this.labioInf.scale.set(1, ancho / 1.8, 1);

    // Laringe (sube y baja) y cuerdas vocales
    this.laringe.position.y = (a.laringe - 0.5) * 1.2;
    const ap = Math.min(1, e.areaGlotis / 1.6 + e.aperturaGlotis * 0.35);
    for (const c of this.cuerdas) c.rotation.y = c.userData.lado * (0.03 + ap * 0.45);

    // Pulmones: se inflan con el volumen y cambian de color con la presión
    const s = 0.82 + 0.22 * ((e.volumen - 1.2) / 4.8);
    for (const p of this.pulmones) p.scale.set(4.6 * s, 8.4 * (0.9 + 0.1 * s) + e.diafragma * 0.8, 4.1 * s);
    const pres = Math.min(1, Math.abs(e.pPulmon) / 15);
    this.matPulmon.color.copy(this.P.pulmon).lerp(e.pPulmon > 0 ? this.P.presion : this.P.aire, pres * 0.5);

    // Costillas: se elevan al inspirar (intercostales externos) y bajan al espirar
    const elev = Math.max(-0.6, Math.min(1, 0.8 * e.intercostalesExt - 0.6 * e.intercostalesInt + 0.25 * (e.volumen - 2.5)));
    if (Math.abs(elev - (this.elevPrev ?? 99)) > 0.01) {
      this.elevPrev = elev;
      for (const m of this.costillas) {
        m.geometry.dispose();
        m.geometry = new THREE.TubeGeometry(this.curvaCostilla(m.userData.k, m.userData.lado, elev), 40, 0.32, 8, false);
      }
      for (const ic of this.geoIntercostales) {
        const pos = ic.geo.attributes.position.array;
        const c1 = this.curvaCostilla(ic.k, ic.lado, elev).getPoints(29);
        const c2 = this.curvaCostilla(ic.k + 1, ic.lado, elev).getPoints(29);
        let o = 0;
        for (const p of [...c1, ...c2]) {
          pos[o++] = p.x;
          pos[o++] = p.y;
          pos[o++] = p.z;
        }
        ic.geo.attributes.position.needsUpdate = true;
        ic.geo.computeVertexNormals();
        ic.geo.computeBoundingSphere();
      }
      this.esternon.position.y = -19.5 + elev * 0.8;
    }
    this.matIntercostal.opacity = 0.2 + 0.6 * Math.max(e.intercostalesExt, e.intercostalesInt);

    // Diafragma: cúpula que baja y se aplana al contraerse
    const [RX, RZ] = this.diaRes;
    const pos = this.geoDiafragma.attributes.position.array;
    const alto = 4.2 - 2.4 * e.diafragma;
    const base = -31.5 - 1.2 * e.diafragma;
    let o = 0;
    for (let i = 0; i <= RX; i++) {
      for (let j = 0; j <= RZ; j++) {
        const u = (i / RX) * 2 - 1;
        const v = (j / RZ) * 2 - 1;
        const r2 = Math.min(1, u * u + v * v);
        // dos cúpulas (izquierda y derecha) con un centro tendinoso
        const domo = 1 - r2 + 0.18 * Math.cos(v * Math.PI) * (1 - r2);
        pos[o++] = u * 7.6 * Math.sqrt(1 - 0.3 * v * v);
        pos[o++] = base + alto * domo;
        pos[o++] = v * 10;
      }
    }
    this.geoDiafragma.attributes.position.needsUpdate = true;
    this.geoDiafragma.computeVertexNormals();
    this.geoDiafragma.computeBoundingSphere();
    this.matDiafragma.opacity = 0.6 + 0.35 * e.diafragma;

    // Senos: brillan con el sonido nasal y la resonancia
    const brillo = a.resonancia * Math.min(1, Math.max(0, e.flujoNariz) * 2 + e.nivel * 3);
    this.matSenos.emissiveIntensity = brillo * 0.8;
    this.matSenos.opacity = 0.25 + 0.35 * brillo;
  }

  // Punto del camino del aire: 0 = pulmones, 1 = fuera.
  puntoCamino(s, via, lado, e, out) {
    // bronquio → tráquea → tracto → boca o nariz
    const tramos = via === 'nariz' ? 3 : 3;
    const seg = s * tramos;
    if (seg < 1) {
      const b = this.caminosBronquio[lado > 0 ? 1 : 0].getPoint(1 - seg);
      out.set(b.x, b.y + (seg < 0.5 ? 0 : 0), b.z);
      // sube de bronquio a tráquea
      if (seg >= 0.5) out.set(0, -12 + (seg - 0.5) * 2 * 12, 0);
      return out;
    }
    if (seg < 2 || via === 'boca') {
      const kmax = via === 'boca' ? N : INDICE_VELO;
      const t = via === 'boca' ? (seg - 1) / 2 : seg - 1;
      const k = Math.min(kmax, t * kmax);
      const i = Math.min(N - 1, Math.floor(k));
      const f = k - i;
      const a = this.seccion(e, i);
      const b = this.seccion(e, i + 1);
      const ca = a.centro;
      const cb = b.centro;
      out.set(
        a.p.x + a.p.nx * ca + (b.p.x + b.p.nx * cb - a.p.x - a.p.nx * ca) * f,
        a.p.y + a.p.ny * ca + (b.p.y + b.p.ny * cb - a.p.y - a.p.ny * ca) * f,
        0,
      );
      if (via === 'boca' && t >= 1) out.x += (t - 1) * 6;
      return out;
    }
    const t = Math.min(1, seg - 2);
    const p = CAMINO_NARIZ.getPoint(t);
    out.copy(p);
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
      this.particulas.push({
        s: sale ? 0 : 1, via, lado: Math.random() < 0.5 ? -1 : 1,
        dz: (Math.random() - 0.5) * 1.2, dy: (Math.random() - 0.5) * 0.4,
      });
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
      // se oculta si queda fuera o encima de otra etiqueta
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

  dibujar(e, dt = 1 / 60) {
    this.actualizarAire(e);
    this.actualizarLengua(e);
    this.actualizarNariz(e);
    this.actualizarCuerpo(e);
    this.actualizarParticulas(e, dt);
    this.controles.update();
    this.renderer.render(this.escena, this.camara);
    this.actualizarNombres();
    const et = e.etiqueta && e.etiqueta !== 'inspira' ? '/' + e.etiqueta + '/' : '';
    if (this.fonema.textContent !== et) this.fonema.textContent = et;
  }

  // Encuadres rápidos
  vista(nombre) {
    const t = this.controles.target;
    if (nombre === 'cabeza') {
      t.set(4, 7, 0);
      this.camara.position.set(10, 9, 34);
    } else if (nombre === 'perfil') {
      t.set(2, -4, 0);
      this.camara.position.set(2, -4, 100);
    } else if (nombre === 'frente') {
      t.set(2, 0, 0);
      this.camara.position.set(95, 4, 0);
    } else {
      t.set(2, -4, 0);
      this.camara.position.set(30, 2, 96);
    }
  }
}
