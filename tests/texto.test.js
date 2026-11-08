import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transcribir, textoAFonemas } from '../src/tts/texto-a-fonemas.js';

const casos = {
  casa: 'kˈasa',
  perro: 'pˈero',
  caro: 'kˈaɾo',
  guitarra: 'gitˈara',
  chico: 'tʃˈiko',
  hola: 'ˈola',
  llave: 'ʝˈaβe',
  canción: 'kansjˈon',
  aire: 'ˈajɾe',
  agua: 'ˈaɣwa',
  pingüino: 'pingwˈino',
  enredo: 'enrˈeðo',
  queso: 'kˈeso',
  gente: 'xˈente',
  niño: 'nˈiɲo',
};

test('reglas de pronunciación del español', () => {
  for (const [palabra, esperado] of Object.entries(casos)) {
    assert.equal(transcribir(palabra), esperado, palabra);
  }
});

test('acento de España: z y c suave son θ', () => {
  assert.equal(transcribir('cero', { ceceo: true }), 'θˈeɾo');
  assert.equal(transcribir('cero'), 'sˈeɾo');
});

test('palabras átonas y números', () => {
  assert.equal(transcribir('el perro de la casa'), 'el pˈero ðe la kˈasa');
  assert.equal(transcribir('12'), 'dˈose');
});

test('la puntuación separa grupos con su final', () => {
  const g = textoAFonemas('Hola, ¿qué tal?');
  assert.deepEqual(g.map((x) => x.fin), [',', '?']);
});
