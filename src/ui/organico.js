// Utilidades para modelar formas orgánicas por código: ruido suave, mallas
// de anillos (lofts) que se actualizan en sitio, marcos a lo largo de una
// curva, esferas deformadas y colores de vértice.

import * as THREE from 'three';

// ---------- Ruido de valor 3D suavizado y fbm ---------------------------------

function hash(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const suave = (t) => t * t * (3 - 2 * t);

export function ruido(x, y, z) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = suave(x - xi);
  const yf = suave(y - yi);
  const zf = suave(z - zi);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), xf), l(c(0, 1, 0), c(1, 1, 0), xf), yf),
    l(l(c(0, 0, 1), c(1, 0, 1), xf), l(c(0, 1, 1), c(1, 1, 1), xf), yf),
    zf,
  ) * 2 - 1;
}

export function fbm(x, y, z, octavas = 3) {
  let s = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < octavas; i++) {
    s += a * ruido(x * f, y * f, z * f);
    f *= 2.03;
    a *= 0.5;
  }
  return s;
}

// Generador pseudoaleatorio determinista (mismas formas en cada carga).
export function azar(semilla = 1) {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const gauss = (x, c, s) => Math.exp(-((x - c) / s) * ((x - c) / s));
export const lerp = (a, b, t) => a + (b - a) * t;
export const limitar = (x, a, b) => (x < a ? a : x > b ? b : x);

// ---------- Malla de anillos (loft) -------------------------------------------

// `anillos` secciones de `lados` vértices. Con `cerrado` cada sección es un
// lazo; con `tapas` se cierran los extremos con un abanico.
export class Anillos {
  constructor(anillos, lados, { cerrado = true, tapas = false, colores = false } = {}) {
    this.anillos = anillos;
    this.lados = lados;
    this.tapas = tapas;
    const n = anillos * lados + (tapas ? 2 : 0);
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    if (colores) {
      this.col = new Float32Array(n * 3).fill(1);
      geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    }
    const idx = [];
    const lim = cerrado ? lados : lados - 1;
    for (let a = 0; a < anillos - 1; a++) {
      for (let j = 0; j < lim; j++) {
        const j2 = (j + 1) % lados;
        const p = a * lados;
        const q = (a + 1) * lados;
        idx.push(p + j, q + j, p + j2, p + j2, q + j, q + j2);
      }
    }
    if (tapas) {
      const c0 = anillos * lados;
      const c1 = c0 + 1;
      const u = (anillos - 1) * lados;
      for (let j = 0; j < lim; j++) {
        const j2 = (j + 1) % lados;
        idx.push(c0, j2, j);
        idx.push(c1, u + j, u + j2);
      }
    }
    geo.setIndex(idx);
    this.geo = geo;
  }

  poner(a, j, x, y, z) {
    const o = (a * this.lados + j) * 3;
    this.pos[o] = x;
    this.pos[o + 1] = y;
    this.pos[o + 2] = z;
  }

  color(a, j, r, g, b) {
    const o = (a * this.lados + j) * 3;
    this.col[o] = r;
    this.col[o + 1] = g;
    this.col[o + 2] = b;
  }

  // Calcula las tapas, normales y límites tras poner las posiciones.
  terminar() {
    if (this.tapas) {
      const L = this.lados;
      const base = this.anillos * L * 3;
      for (const [k, a] of [[0, 0], [1, this.anillos - 1]]) {
        let x = 0;
        let y = 0;
        let z = 0;
        for (let j = 0; j < L; j++) {
          const o = (a * L + j) * 3;
          x += this.pos[o];
          y += this.pos[o + 1];
          z += this.pos[o + 2];
        }
        this.pos[base + k * 3] = x / L;
        this.pos[base + k * 3 + 1] = y / L;
        this.pos[base + k * 3 + 2] = z / L;
        if (this.col) {
          const o = a * L * 3;
          this.col[base + k * 3] = this.col[o];
          this.col[base + k * 3 + 1] = this.col[o + 1];
          this.col[base + k * 3 + 2] = this.col[o + 2];
        }
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    if (this.col) this.geo.attributes.color.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
    return this.geo;
  }
}

// ---------- Marcos a lo largo de una curva --------------------------------------

// Devuelve, para cada punto, {p, t, n, b} con transporte paralelo (sin giros).
export function marcos(puntos, arriba = new THREE.Vector3(0, 1, 0)) {
  const out = [];
  const n = puntos.length;
  let normal = null;
  for (let i = 0; i < n; i++) {
    const a = puntos[Math.max(0, i - 1)];
    const b = puntos[Math.min(n - 1, i + 1)];
    const t = new THREE.Vector3().subVectors(b, a).normalize();
    if (!normal) {
      normal = arriba.clone().sub(t.clone().multiplyScalar(arriba.dot(t)));
      if (normal.lengthSq() < 1e-6) normal = new THREE.Vector3(1, 0, 0).sub(t.clone().multiplyScalar(t.x));
      normal.normalize();
    } else {
      normal = normal.clone().sub(t.clone().multiplyScalar(normal.dot(t))).normalize();
    }
    const bin = new THREE.Vector3().crossVectors(t, normal).normalize();
    out.push({ p: puntos[i].clone(), t, n: normal.clone(), b: bin });
  }
  return out;
}

// Tubo orgánico a lo largo de puntos. `seccion(s, ang)` devuelve [u, v]:
// desplazamiento en la normal y la binormal del marco (s = 0..1 a lo largo).
export function tubo(puntos, seccion, lados = 12, opciones = {}) {
  const fr = marcos(puntos, opciones.arriba);
  const m = new Anillos(fr.length, lados, { tapas: opciones.tapas ?? true, colores: !!opciones.color });
  for (let i = 0; i < fr.length; i++) {
    const s = i / (fr.length - 1);
    const { p, n, b } = fr[i];
    for (let j = 0; j < lados; j++) {
      const ang = (j / lados) * Math.PI * 2;
      const [u, v] = seccion(s, ang);
      const x = p.x + n.x * u + b.x * v;
      const y = p.y + n.y * u + b.y * v;
      const z = p.z + n.z * u + b.z * v;
      m.poner(i, j, x, y, z);
      if (opciones.color) {
        const c = opciones.color(s, ang, x, y, z);
        m.color(i, j, c[0], c[1], c[2]);
      }
    }
  }
  return m.terminar();
}

// Sección elíptica simple que se afina en los extremos.
export const elipse = (ru, rv) => (s, a) => [Math.cos(a) * ru(s), Math.sin(a) * rv(s)];

// ---------- Esferas deformadas y colores ------------------------------------------

// `deformar(v)` recibe un Vector3 de la esfera unidad y lo modifica en sitio.
export function esferaDeformada(deformar, ancho = 48, alto = 32) {
  const geo = new THREE.SphereGeometry(1, ancho, alto);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    deformar(v);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// Rellena (o crea) colores de vértice: fn(x, y, z, i) → [r, g, b].
export function pintar(geo, fn) {
  const pos = geo.attributes.position;
  let col = geo.attributes.color;
  if (!col) {
    col = new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3);
    geo.setAttribute('color', col);
  }
  for (let i = 0; i < pos.count; i++) {
    const c = fn(pos.getX(i), pos.getY(i), pos.getZ(i), i);
    col.setXYZ(i, c[0], c[1], c[2]);
  }
  col.needsUpdate = true;
  return geo;
}

// Color con moteado orgánico (variación suave de brillo).
export function moteado(color, x, y, z, escala = 0.8, fuerza = 0.12) {
  const k = 1 + fuerza * fbm(x * escala + 11.3, y * escala + 3.1, z * escala + 7.7, 3);
  return [color.r * k, color.g * k, color.b * k];
}

// Mezcla de dos colores THREE.Color → [r, g, b]
export const mezcla = (a, b, t) => [lerp(a.r, b.r, t), lerp(a.g, b.g, t), lerp(a.b, b.b, t)];

// Fusiona varias geometrías (cada una con su matriz) en una sola, para
// dibujarlas en una llamada. Devuelve la geometría y, por vértice, el índice
// de la pieza de origen (para volver a colorear).
export function fusionar(piezas) {
  const gs = piezas.map(({ geo, matriz }) => {
    let g = geo.clone();
    if (matriz) g.applyMatrix4(matriz);
    if (!g.index) {
      const n = g.attributes.position.count;
      g.setIndex(Array.from({ length: n }, (_, i) => i));
    }
    // una matriz con reflejo invierte el orden de los triángulos: se corrige
    if (matriz && matriz.determinant() < 0) {
      const ix = g.index.array.slice();
      for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]];
      g.setIndex(Array.from(ix));
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    return g;
  });
  let nv = 0;
  let ni = 0;
  for (const g of gs) {
    nv += g.attributes.position.count;
    ni += g.index.count;
  }
  const pos = new Float32Array(nv * 3);
  const nor = new Float32Array(nv * 3);
  const col = new Float32Array(nv * 3).fill(1);
  const idx = new Uint32Array(ni);
  const pieza = new Uint16Array(nv);
  let ov = 0;
  let oi = 0;
  gs.forEach((g, k) => {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array.subarray(0, n * 3), ov * 3);
    nor.set(g.attributes.normal.array.subarray(0, n * 3), ov * 3);
    if (g.attributes.color) col.set(g.attributes.color.array.subarray(0, n * 3), ov * 3);
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i++) idx[oi + i] = ix[i] + ov;
    pieza.fill(k, ov, ov + n);
    ov += n;
    oi += ix.length;
    g.dispose();
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  return { geo, pieza };
}
