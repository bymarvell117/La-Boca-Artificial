import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planificar, planificarFonema } from '../src/tts/planificador.js';
import { FONEMAS, GRUPOS_BOTONES } from '../src/tts/fonemas.js';

test('el plan empieza tomando aire y termina en reposo', () => {
  const p = planificar('Hola, mundo. Adiós.');
  assert.equal(p.eventos[0].objetivos.respiracion, 'inspirar');
  assert.equal(p.eventos.at(-1).objetivos.respiracion, 'tranquila');
  for (let i = 1; i < p.eventos.length; i++) assert.ok(p.eventos[i].t >= p.eventos[i - 1].t);
  // inspira también después del punto
  assert.equal(p.eventos.filter((e) => e.objetivos.respiracion === 'inspirar').length, 2);
});

test('la pregunta sube el tono al final', () => {
  const tonos = (t) => planificar(t).eventos.filter((e) => e.objetivos.f0).map((e) => e.objetivos.f0);
  assert.ok(tonos('¿vienes mañana?').at(-1) > tonos('vienes mañana.').at(-1) * 1.2);
});

test('la erre múltiple son varios golpes de la punta', () => {
  const golpes = planificar('perro').eventos.filter((e) => e.etiqueta === 'r').length;
  assert.equal(golpes, 3);
});

test('hay plan para cada botón de fonema', () => {
  for (const g of GRUPOS_BOTONES) {
    for (const f of g.fonemas) {
      assert.ok(FONEMAS[f], f);
      assert.ok(planificarFonema(f).eventos.length > 2, f);
    }
  }
});
