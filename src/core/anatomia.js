// Anatomía del tracto vocal: dónde está cada parte a lo largo del tubo
// y cómo la posición de los articuladores se convierte en diámetros.
//
// El tracto (laringe → labios) se divide en N segmentos. El índice 0 está
// justo encima de las cuerdas vocales y el último en los labios.

export const N = 44; // segmentos del tracto bucal/faríngeo
export const NARIZ_N = 28; // segmentos de la cavidad nasal
export const INDICE_VELO = 17; // unión con la nariz (puerta velofaríngea)

// Regiones (índices de segmento) usadas por la física y el dibujo.
export const REGION = {
  laringe: [0, 3],
  epiglotis: [3, 5],
  faringe: [4, 16],
  velo: [17, 24], // paladar blando
  paladarDuro: [25, 35],
  alveolos: [35, 37],
  dientes: [38, 39],
  labios: [40, N - 1],
};

export const INDICE_DIENTES = 38;

// Postura de reposo de los articuladores (valores de control).
export const REPOSO = {
  lenguaPos: 22, // índice del centro del dorso de la lengua (12 = atrás, 32 = delante)
  lenguaAltura: 1.5, // diámetro mínimo que deja el dorso (0 = toca el paladar)
  puntaPos: 36, // dónde apunta la punta de la lengua
  puntaApertura: 3, // diámetro que deja la punta (3 = punta relajada)
  labios: 1.2, // apertura de labios
  mandibula: 0.3, // 0 = cerrada, 1 = muy abierta
  velo: 0, // 0 = velo subido (nariz cerrada), 1 = velo bajado (nariz abierta)
  laringe: 0.5, // altura de la laringe
};

// Diámetro del tubo sin lengua, según la mandíbula.
export function diametroBase(i, mandibula) {
  if (i < 3) return 0.6 + 0.1 * i; // vestíbulo laríngeo
  if (i < 6) return 1.0 + 0.1 * (i - 3); // epiglotis
  if (i < 17) return 1.4; // faringe
  if (i < 24) return 1.5; // detrás del velo
  // cavidad bucal: la mandíbula la agranda
  return 1.3 + 0.9 * mandibula;
}

// Calcula los diámetros del tracto a partir de los articuladores.
// `out` es un Float64Array(N).
export function diametrosTracto(a, out) {
  const jaw = a.mandibula;
  // La mandíbula abierta separa la lengua del paladar, salvo en un cierre total.
  // (valores negativos = el órgano empuja más allá del contacto: cierre firme)
  const lenguaMin = Math.max(0, a.lenguaAltura + 0.25 * jaw * Math.min(1, Math.max(0, a.lenguaAltura) / 0.3));
  for (let i = 0; i < N; i++) {
    let d = diametroBase(i, jaw);

    // La laringe alta estrecha la parte baja de la faringe.
    if (i < 7) d *= 1 - 0.3 * (a.laringe - 0.5);

    // Dorso de la lengua: una curva que deja `lenguaMin` en su centro.
    if (i >= 6 && i <= 37) {
      const dist = i - a.lenguaPos;
      const lengua = lenguaMin + 0.014 * dist * dist;
      if (lengua < d) d = lengua;
    }

    // Punta de la lengua: estrechamiento local y corto.
    if (a.puntaApertura < 2.9 && i >= 30 && i <= 39) {
      const dist = (i - a.puntaPos) / 1.3;
      const w = Math.exp(-dist * dist);
      const punta = Math.max(0, a.puntaApertura + 0.25 * jaw * Math.min(1, Math.max(0, a.puntaApertura) / 0.3));
      const v = d * (1 - w) + Math.min(d, punta) * w;
      if (v < d) d = v;
    }

    // Labios: los últimos segmentos los fija la apertura labial.
    if (i >= REGION.labios[0]) {
      const lab = Math.max(0, a.labios + 0.4 * jaw * Math.min(1, Math.max(0, a.labios) * 4));
      const t = (i - REGION.labios[0] + 1) / (N - REGION.labios[0]);
      d = d * (1 - t) + lab * t;
      if (i >= N - 2) d = lab;
    }

    out[i] = d < 0.04 ? 0 : d; // por debajo de esto, cierre total
  }
  return out;
}

// Diámetros de la cavidad nasal (fijos salvo la entrada, que abre el velo).
export function diametrosNariz(velo, out) {
  for (let i = 0; i < NARIZ_N; i++) {
    const t = i / (NARIZ_N - 1);
    // estrecha en la nasofaringe, ancha en los cornetes, estrecha en la narina
    let d = 0.6 + 1.0 * Math.sin(Math.PI * Math.min(1, t * 1.4));
    if (t > 0.75) d = Math.min(d, 0.9);
    out[i] = d;
  }
  out[0] = Math.max(0, velo) * 0.5; // puerta velofaríngea
  return out;
}

// Área (unidades relativas, ~cm²) desde el diámetro.
export const area = (d) => d * d;
