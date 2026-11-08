// TTS mecánico, paso 2: cada fonema es una postura de los órganos.
//
// Las vocales fijan toda la boca. Las consonantes sólo mueven lo que
// necesitan (labios, punta, dorso, velo, cuerdas) y el resto lo heredan de
// las vocales vecinas: así aparece la coarticulación de forma natural.
//
// Aducción de las cuerdas: 0.78 = vibran (sonora), 0.3 = separadas (sorda).

const SONORA = 0.78;
const SORDA = 0.3;

// Posturas de vocales ajustadas para dar formantes del español
// (F1/F2 aprox. a 720/1250, e 460/1850, i 300/2250, o 480/920, u 330/780 Hz).
export const VOCALES = {
  a: { lenguaPos: 9, lenguaAltura: 0.35, labios: 1.0, mandibula: 0.7 },
  e: { lenguaPos: 29, lenguaAltura: 0.6, labios: 0.8, mandibula: 0.5 },
  i: { lenguaPos: 29, lenguaAltura: 0.3, labios: 1.0, mandibula: 0.2 },
  o: { lenguaPos: 18, lenguaAltura: 0.4, labios: 0.45, mandibula: 0.5 },
  u: { lenguaPos: 21, lenguaAltura: 0.4, labios: 0.25, mandibula: 0.25 },
};

const NEUTRO_PUNTA = { puntaApertura: 3, puntaPos: 36 };

// tipo: vocal | oclusiva | fricativa | nasal | lateral | vibrante | aproximante | africada | semivocal
// dur: duración base en milisegundos
export const FONEMAS = {
  // Vocales
  a: { tipo: 'vocal', dur: 95, o: { ...VOCALES.a, ...NEUTRO_PUNTA, velo: 0, aduccion: SONORA } },
  e: { tipo: 'vocal', dur: 90, o: { ...VOCALES.e, ...NEUTRO_PUNTA, velo: 0, aduccion: SONORA } },
  i: { tipo: 'vocal', dur: 85, o: { ...VOCALES.i, ...NEUTRO_PUNTA, velo: 0, aduccion: SONORA } },
  o: { tipo: 'vocal', dur: 90, o: { ...VOCALES.o, ...NEUTRO_PUNTA, velo: 0, aduccion: SONORA } },
  u: { tipo: 'vocal', dur: 85, o: { ...VOCALES.u, ...NEUTRO_PUNTA, velo: 0, aduccion: SONORA } },
  j: { tipo: 'semivocal', dur: 50, o: { ...VOCALES.i, lenguaAltura: 0.25, ...NEUTRO_PUNTA, velo: 0, aduccion: SONORA } },
  w: { tipo: 'semivocal', dur: 50, o: { ...VOCALES.u, labios: 0.2, ...NEUTRO_PUNTA, velo: 0, aduccion: SONORA } },

  // Oclusivas: cierre y luego explosión al abrir (la explosión sale sola de
  // la presión acumulada en la boca).
  p: { tipo: 'oclusiva', dur: 85, vot: 10, o: { labios: -0.3, velo: 0, aduccion: SORDA } },
  b: { tipo: 'oclusiva', dur: 65, o: { labios: -0.3, velo: 0, aduccion: SONORA } },
  t: { tipo: 'oclusiva', dur: 80, vot: 15, o: { puntaPos: 37, puntaApertura: -0.6, velo: 0, aduccion: SORDA } },
  d: { tipo: 'oclusiva', dur: 60, o: { puntaPos: 37, puntaApertura: -0.6, velo: 0, aduccion: SONORA } },
  k: { tipo: 'oclusiva', dur: 85, vot: 32, o: { lenguaPos: 24, lenguaAltura: -0.12, velo: 0, aduccion: SORDA } },
  g: { tipo: 'oclusiva', dur: 65, o: { lenguaPos: 24, lenguaAltura: -0.12, velo: 0, aduccion: SONORA } },

  // Aproximantes (b, d, g suaves entre vocales)
  // La mandíbula sube un poco para que el estrechamiento sea real.
  β: { tipo: 'aproximante', dur: 60, o: { labios: 0.15, mandibula: 0.25, velo: 0, aduccion: SONORA } },
  ð: { tipo: 'aproximante', dur: 55, o: { puntaPos: 37, puntaApertura: 0.16, mandibula: 0.3, velo: 0, aduccion: SONORA } },
  ɣ: { tipo: 'aproximante', dur: 60, o: { lenguaPos: 24, lenguaAltura: 0.16, mandibula: 0.3, velo: 0, aduccion: SONORA } },

  // Fricativas
  f: { tipo: 'fricativa', dur: 100, o: { labios: 0.1, velo: 0, aduccion: SORDA } },
  s: { tipo: 'fricativa', dur: 105, o: { puntaPos: 36, puntaApertura: 0.12, mandibula: 0.1, velo: 0, aduccion: SORDA } },
  θ: { tipo: 'fricativa', dur: 100, o: { puntaPos: 38, puntaApertura: 0.13, mandibula: 0.15, velo: 0, aduccion: SORDA } },
  x: { tipo: 'fricativa', dur: 95, o: { lenguaPos: 23, lenguaAltura: 0.06, mandibula: 0.25, velo: 0, aduccion: SORDA } },
  ʝ: { tipo: 'fricativa', dur: 70, o: { lenguaPos: 30, lenguaAltura: 0.12, mandibula: 0.2, puntaApertura: 3, velo: 0, aduccion: SONORA } },

  // Africada: cierre + fricación en la misma zona
  tʃ: { tipo: 'africada', dur: 110, o: { puntaPos: 34, puntaApertura: -0.6, lenguaPos: 29, lenguaAltura: 0.4, velo: 0, aduccion: SORDA },
    suelta: { puntaApertura: 0.15 } },

  // Nasales: boca cerrada en algún punto y velo bajado
  m: { tipo: 'nasal', dur: 70, o: { labios: -0.3, velo: 1, aduccion: SONORA } },
  n: { tipo: 'nasal', dur: 65, o: { puntaPos: 36, puntaApertura: -0.6, velo: 1, aduccion: SONORA } },
  ɲ: { tipo: 'nasal', dur: 80, o: { lenguaPos: 30, lenguaAltura: -0.12, puntaApertura: 3, velo: 1, aduccion: SONORA } },

  // Líquidas
  // /l/: la punta toca los alvéolos y el aire sale por los lados (estrechamiento equivalente).
  l: { tipo: 'lateral', dur: 70, o: { puntaPos: 36, puntaApertura: 0.2, mandibula: 0.3, velo: 0, aduccion: SONORA } },
  ɾ: { tipo: 'vibrante', dur: 40, o: { puntaPos: 35, puntaApertura: -0.6, mandibula: 0.35, velo: 0, aduccion: SONORA } },
  r: { tipo: 'vibrante', dur: 165, golpes: 3, o: { puntaPos: 35, puntaApertura: -0.6, mandibula: 0.35, velo: 0, aduccion: SONORA } },
};

export const esVocal = (f) => FONEMAS[f]?.tipo === 'vocal';

// Grupos para los botones de la interfaz.
export const GRUPOS_BOTONES = [
  { nombre: 'Vocales', fonemas: ['a', 'e', 'i', 'o', 'u'] },
  { nombre: 'Oclusivas', fonemas: ['p', 'b', 't', 'd', 'k', 'g'] },
  { nombre: 'Fricativas', fonemas: ['f', 's', 'θ', 'x', 'ʝ', 'tʃ'] },
  { nombre: 'Nasales', fonemas: ['m', 'n', 'ɲ'] },
  { nombre: 'Líquidas', fonemas: ['l', 'ɾ', 'r'] },
];

// Letra o ejemplo para cada fonema (lo que ve la persona en el botón).
export const EJEMPLO = {
  a: 'a', e: 'e', i: 'i', o: 'o', u: 'u',
  p: 'pa', b: 'ba', t: 'ta', d: 'da', k: 'ka', g: 'ga',
  f: 'f', s: 's', θ: 'z (España)', x: 'j', ʝ: 'y', tʃ: 'cha',
  m: 'm', n: 'n', ɲ: 'ña',
  l: 'l', ɾ: 'ara', r: 'rra',
};
