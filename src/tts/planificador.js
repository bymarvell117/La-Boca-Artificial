// TTS mecánico, paso 3: fonemas → plan de movimientos en el tiempo.
//
// El plan es una lista de eventos { t (s), objetivos, etiqueta } que la Boca
// Artificial aplica al llegar su momento. Incluye la respiración: toma aire
// antes de hablar y en los puntos, y mantiene la presión mientras habla.

import { FONEMAS, esVocal } from './fonemas.js';
import { textoAFonemas } from './texto-a-fonemas.js';
import { REPOSO } from '../core/anatomia.js';

export const POSTURA_REPOSO = {
  ...REPOSO,
  labios: 0,
  velo: 1,
  aduccion: 0.1,
  respiracion: 'tranquila',
};

const INSPIRAR = { respiracion: 'inspirar', aduccion: 0.08, labios: 0.7, velo: 0.6, puntaApertura: 3, mandibula: 0.35 };

export function planificar(texto, opciones = {}) {
  const { f0 = 120, velocidad = 1, ceceo = false } = opciones;
  const grupos = textoAFonemas(texto, { ceceo });
  const eventos = [];
  let t = 0;
  const ev = (objetivos, etiqueta) => eventos.push({ t, objetivos, etiqueta });
  const ms = (x) => x / 1000 / velocidad;

  ev(INSPIRAR, 'inspira');
  t += 0.45;

  grupos.forEach((g, gi) => {
    const fon = g.fonemas;
    if (!fon.length) return;
    ev({ respiracion: 'habla' });

    const ultimaTonica = fon.reduce((u, x, i) => (x.tonica ? i : u), -1);
    const ultimaVocal = fon.reduce((u, x, i) => (esVocal(x.f) ? i : u), -1);

    fon.forEach((x, i) => {
      const def = FONEMAS[x.f];
      if (!def) return;
      const progreso = i / Math.max(1, fon.length - 1);

      // Entonación: declinación, subida en la tónica y final según la puntuación.
      let tono = f0 * (1.05 - 0.15 * progreso);
      if (x.tonica) tono *= 1.12;
      if (i >= ultimaTonica && ultimaTonica >= 0) {
        if (g.fin === '?') tono *= 1 + 0.35 * ((i - ultimaTonica + 1) / (fon.length - ultimaTonica));
        else if (g.fin === ',' || g.fin === ';') tono *= 1.04;
        else tono *= 0.92;
      }

      let dur = def.dur;
      if (x.tonica) dur *= 1.35;
      if (i === ultimaVocal) dur *= 1.5; // alargamiento final
      if (g.fin === '!') dur *= 1.1;
      dur = ms(dur);

      const objetivos = { ...def.o, f0: tono };
      if (g.fin === '!') objetivos.esfuerzo = 0.8;
      else objetivos.esfuerzo = 0.5;

      if (def.tipo === 'vibrante') {
        // Golpes de la punta contra los alvéolos.
        const golpes = def.golpes || 1;
        const paso = dur / golpes;
        // contacto más largo que la separación: la punta tiene que llegar a cerrar
        const cierre = golpes === 1 ? 0.75 : 0.6;
        for (let k = 0; k < golpes; k++) {
          ev({ ...objetivos, puntaApertura: -0.6 }, x.f);
          t += paso * cierre;
          ev({ puntaApertura: 0.7 });
          t += paso * (1 - cierre);
        }
        return;
      }

      ev(objetivos, x.f);
      if (def.suelta) {
        t += dur * 0.4;
        ev(def.suelta);
        t += dur * 0.6;
        ev({ puntaApertura: 3 });
        return;
      }
      t += dur;
    });

    // Pausa entre grupos
    const final = '.!?'.includes(g.fin);
    const ultimo = gi === grupos.length - 1;
    if (ultimo) return;
    ev({ respiracion: 'pausa', aduccion: 0.35, puntaApertura: 3 }, '');
    t += final ? 0.12 : 0.18;
    if (final) {
      ev(INSPIRAR, 'inspira');
      t += 0.4;
    }
  });

  ev({ respiracion: 'pausa', aduccion: 0.35 }, '');
  t += 0.08;
  ev(POSTURA_REPOSO, '');
  t += 0.4;
  return { eventos, duracion: t };
}

// Plan para un solo fonema (botones). Las consonantes que no se sostienen
// van con una vocal: "pa", "ara"...
export function planificarFonema(f, opciones = {}) {
  const { f0 = 120 } = opciones;
  const def = FONEMAS[f];
  if (!def) return { eventos: [], duracion: 0 };
  const A = { ...FONEMAS.a.o, f0, esfuerzo: 0.5 };
  const eventos = [];
  let t = 0;
  const ev = (objetivos, etiqueta) => eventos.push({ t, objetivos, etiqueta });

  ev(INSPIRAR, 'inspira');
  t += 0.35;
  ev({ respiracion: 'habla' });

  if (def.tipo === 'vocal') {
    ev({ ...def.o, f0, esfuerzo: 0.5 }, f);
    t += 0.7;
  } else if (def.tipo === 'oclusiva' || def.tipo === 'africada') {
    ev({ ...A, aduccion: def.o.aduccion }, '');
    t += 0.04;
    ev({ ...def.o, f0 }, f);
    t += 0.12;
    if (def.suelta) {
      ev(def.suelta);
      t += 0.08;
    }
    ev(A, 'a');
    t += 0.4;
  } else if (def.tipo === 'vibrante') {
    ev(A, 'a');
    t += 0.25;
    const golpes = def.golpes || 1;
    for (let k = 0; k < golpes; k++) {
      ev({ ...def.o, f0 }, f);
      t += 0.025;
      ev({ puntaApertura: 0.7 });
      t += 0.025;
    }
    ev(A, 'a');
    t += 0.3;
  } else {
    // sostenibles: fricativas, nasales, laterales
    ev({ ...A, aduccion: def.o.aduccion, ...def.o, f0 }, f);
    t += 0.6;
  }
  ev({ aduccion: 0.35 }, '');
  t += 0.08;
  ev(POSTURA_REPOSO, '');
  t += 0.3;
  return { eventos, duracion: t };
}
