import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BocaArtificial } from '../src/core/boca.js';
import { planificar, planificarFonema } from '../src/tts/planificador.js';
import { VOCALES } from '../src/tts/fonemas.js';
import { formantes } from './utilidades.js';

const SR = 48000;

function correr(boca, segundos, cada) {
  const blk = new Float32Array(128);
  let pico = 0;
  let finito = true;
  const n = Math.round((segundos * SR) / 128);
  for (let i = 0; i < n; i++) {
    boca.procesar(blk);
    for (const x of blk) {
      if (!Number.isFinite(x)) finito = false;
      pico = Math.max(pico, Math.abs(x));
    }
    cada?.(boca.instantanea());
  }
  return { pico, finito };
}

test('las vocales tienen los formantes del español (±12 %)', () => {
  const objetivo = { a: [720, 1250], e: [460, 1850], i: [300, 2250], o: [480, 920], u: [330, 780] };
  for (const [v, [f1, f2]] of Object.entries(objetivo)) {
    const [F1, F2] = formantes(VOCALES[v]);
    assert.ok(Math.abs(F1 / f1 - 1) < 0.12, `${v}: F1 ${F1} ≠ ${f1}`);
    assert.ok(Math.abs(F2 / f2 - 1) < 0.12, `${v}: F2 ${F2} ≠ ${f2}`);
  }
});

test('hablar una frase es estable y audible', () => {
  const b = new BocaArtificial(SR);
  const plan = planificar('Hola, soy la boca artificial. ¿Me oyes bien?');
  b.decir(plan);
  let maxNivel = 0;
  const { pico, finito } = correr(b, plan.duracion + 0.5, (e) => (maxNivel = Math.max(maxNivel, e.nivel)));
  assert.ok(finito, 'sin NaN ni infinitos');
  assert.ok(pico <= 1, 'sin pasar de 1');
  assert.ok(maxNivel > 0.03, 'se oye');
  assert.equal(b.hablando(), false, 'termina el plan');
});

test('respirar tranquilo: el aire entra y sale por la nariz', () => {
  const b = new BocaArtificial(SR);
  let entra = 0;
  let sale = 0;
  correr(b, 8, (e) => {
    entra = Math.min(entra, e.flujoNariz);
    sale = Math.max(sale, e.flujoNariz);
  });
  assert.ok(entra < -0.1 && sale > 0.1, `nariz: ${entra} / ${sale}`);
});

test('/p/: con los labios cerrados la presión de la boca sube hasta la de los pulmones', () => {
  const b = new BocaArtificial(SR);
  b.decir(planificarFonema('p'));
  let maxPb = 0;
  let pl = 0;
  correr(b, 0.55, (e) => {
    if (e.etiqueta === 'p') {
      maxPb = Math.max(maxPb, e.pBoca);
      pl = e.pPulmon;
    }
  });
  assert.ok(maxPb > 0.8 * pl, `presión boca ${maxPb} vs pulmones ${pl}`);
});

test('/b/: la vibración se apaga sola durante el cierre (la boca se llena de aire)', () => {
  const b = new BocaArtificial(SR);
  b.fijar({ respiracion: 'habla', aduccion: 0.78, labios: 0, velo: 0, f0: 120 });
  const voz = [];
  correr(b, 0.4, (e) => voz.push(e.vibracion));
  assert.ok(Math.max(...voz.slice(0, 20)) > Math.max(...voz.slice(-10)) * 3);
});

test('/m/: el aire sale por la nariz', () => {
  const b = new BocaArtificial(SR);
  b.decir(planificarFonema('m'));
  let nariz = 0;
  let boca = 0;
  correr(b, 0.8, (e) => {
    if (e.etiqueta === 'm') {
      nariz += e.flujoNariz;
      boca += e.flujoBoca;
    }
  });
  assert.ok(nariz > 5 * Math.abs(boca), `nariz ${nariz} boca ${boca}`);
});

test('si se queda sin aire hablando, toma aire solo', () => {
  const b = new BocaArtificial(SR);
  b.fijar({ respiracion: 'habla', aduccion: 0.3, labios: 1.5 });
  let inspiro = false;
  correr(b, 15, (e) => (inspiro ||= e.respiracion === 'inspirar'));
  assert.ok(inspiro);
});
