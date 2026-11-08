// Interfaz: conecta los controles, el audio y el dibujo.

import { BocaArtificial } from './core/boca.js';
import { tensionAFrecuencia } from './core/glotis.js';
import { Dibujo } from './ui/dibujo.js';
import { Escena3D } from './ui/escena3d.js';
import { planificar, planificarFonema } from './tts/planificador.js';
import { transcribir } from './tts/texto-a-fonemas.js';
import { GRUPOS_BOTONES, EJEMPLO } from './tts/fonemas.js';

const $ = (id) => document.getElementById(id);

const dibujo = new Dibujo($('lienzo'));
let escena3d = null;
try {
  escena3d = new Escena3D($('escena3d'));
} catch (err) {
  console.error(err);
}
let vista = escena3d ? '3d' : '2d';

function fijarVista(v) {
  vista = v;
  $('escena3d').hidden = v !== '3d';
  $('lienzo').hidden = v !== '2d';
  document.querySelector('.escena').classList.toggle('modo2d', v === '2d');
  document.querySelectorAll('[data-vista]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.vista === v));
  if (v === '2d') dibujo.ajustar();
  else escena3d?.ajustar();
}
document.querySelectorAll('[data-vista]').forEach((b) =>
  b.addEventListener('click', () => (b.dataset.vista === '3d' && !escena3d ? avisar('Tu navegador no permite 3D (WebGL).') : fijarVista(b.dataset.vista))),
);
document.querySelectorAll('[data-encuadre]').forEach((b) => b.addEventListener('click', () => escena3d?.vista(b.dataset.encuadre)));
$('piel').addEventListener('change', (e) => escena3d?.fijarPiel(e.target.checked));
$('corte').addEventListener('change', (e) => escena3d?.fijarCorte(e.target.checked));
fijarVista(vista);
let nodo = null;
let contexto = null;

// Sin audio todavía: una copia local da el estado inicial para dibujar.
const local = new BocaArtificial(48000);
let estado = local.instantanea();

function avisar(texto) {
  const a = $('aviso');
  a.textContent = texto;
  a.hidden = !texto;
}

// Plan B sin AudioWorklet: la simulación corre en el hilo principal.
function motorDeReserva(ctx) {
  const boca = new BocaArtificial(ctx.sampleRate);
  const proc = ctx.createScriptProcessor(1024, 0, 2);
  const trozo = new Float32Array(128);
  proc.onaudioprocess = (ev) => {
    const izq = ev.outputBuffer.getChannelData(0);
    const der = ev.outputBuffer.getChannelData(1);
    for (let i = 0; i < izq.length; i += 128) {
      boca.procesar(trozo);
      izq.set(trozo, i);
      der.set(trozo, i);
    }
    estado = boca.instantanea();
  };
  proc.connect(ctx.destination);
  return {
    postMessage(m) {
      if (m.tipo === 'fijar') boca.fijar(m.objetivos);
      else if (m.tipo === 'decir') boca.decir(m.plan);
      else if (m.tipo === 'parar') boca.parar();
      else if (m.tipo === 'volumen') boca.ganancia = m.valor;
    },
  };
}

async function encender() {
  if (contexto) {
    if (contexto.state === 'suspended') await contexto.resume();
    return true;
  }
  try {
    contexto = new AudioContext({ latencyHint: 'interactive' });
  } catch (err) {
    avisar('Este navegador no puede reproducir audio: ' + err.message);
    return false;
  }
  try {
    await contexto.audioWorklet.addModule(new URL('./audio/procesador.js', import.meta.url));
    const n = new AudioWorkletNode(contexto, 'boca-artificial', { outputChannelCount: [2] });
    n.connect(contexto.destination);
    n.port.onmessage = (e) => (estado = e.data);
    nodo = n.port;
  } catch (err) {
    console.warn('AudioWorklet no disponible, uso el motor de reserva:', err);
    nodo = motorDeReserva(contexto);
  }
  if (contexto.state === 'suspended') await contexto.resume();
  nodo.postMessage({ tipo: 'volumen', valor: +volumen.value });
  $('encender').textContent = 'Sonido encendido';
  $('encender').disabled = true;
  avisar('');
  return true;
}

const enviar = (m) => nodo && nodo.postMessage(m);

$('encender').addEventListener('click', encender);

// ---------- Pestañas ----------
document.querySelectorAll('[data-pestana]').forEach((b) =>
  b.addEventListener('click', () => {
    document.querySelectorAll('[data-pestana]').forEach((x) => x.setAttribute('aria-selected', x === b));
    document.querySelectorAll('.pestana').forEach((p) => (p.hidden = p.id !== 'pestana-' + b.dataset.pestana));
  }),
);

// ---------- Hablar ----------
const opcionesVoz = () => ({
  f0: +$('voz').value,
  velocidad: +$('velocidad').value,
  ceceo: $('acento').value === 'es',
});

$('velocidad').addEventListener('input', () => ($('velocidad-v').textContent = (+$('velocidad').value).toFixed(2) + '×'));

$('hablar').addEventListener('click', async () => {
  if (!(await encender())) return;
  const texto = $('texto').value.trim();
  if (!texto) return;
  const op = opcionesVoz();
  $('transcripcion').textContent = '/' + transcribir(texto, op) + '/';
  enviar({ tipo: 'decir', plan: planificar(texto, op) });
});
$('parar').addEventListener('click', () => {
  enviar({ tipo: 'parar' });
  enviar({ tipo: 'fijar', objetivos: { respiracion: 'tranquila', aduccion: 0.1, labios: 0, velo: 1 } });
});

// ---------- Botones de fonemas ----------
for (const g of GRUPOS_BOTONES) {
  const caja = document.createElement('div');
  caja.className = 'grupo';
  caja.innerHTML = `<h3>${g.nombre}</h3><div class="fonemas"></div>`;
  for (const f of g.fonemas) {
    const b = document.createElement('button');
    b.innerHTML = `/${f}/<small>${EJEMPLO[f]}</small>`;
    b.addEventListener('click', async () => {
      if (!(await encender())) return;
      enviar({ tipo: 'decir', plan: planificarFonema(f, opcionesVoz()) });
    });
    caja.querySelector('.fonemas').appendChild(b);
  }
  $('botones-fonemas').appendChild(caja);
}

// ---------- Control manual ----------
const CONTROLES = [
  { grupo: 'Respiración (pulmones, diafragma, intercostales)', items: [
    { k: 'respiracion', nombre: 'Modo', opciones: [['tranquila', 'Tranquila (automática)'], ['habla', 'Espirar para hablar'], ['inspirar', 'Inspirar'], ['manual', 'Manual (músculos)']] },
    { k: 'diafragma', nombre: 'Diafragma (inspira)', min: 0, max: 1, paso: 0.01, manual: true },
    { k: 'intercostales', nombre: 'Intercostales (− externos inspiran, + internos espiran)', min: -1, max: 1, paso: 0.01, manual: true },
    { k: 'esfuerzo', nombre: 'Esfuerzo al hablar (presión)', min: 0, max: 1, paso: 0.01 },
  ] },
  { grupo: 'Laringe y cuerdas vocales', items: [
    { k: 'aduccion', nombre: 'Cuerdas: separadas ↔ juntas', min: 0, max: 1, paso: 0.01 },
    { k: 'tension', nombre: 'Tensión de las cuerdas (tono)', min: 0, max: 1, paso: 0.005, fmt: (v) => Math.round(tensionAFrecuencia(v)) + ' Hz' },
    { k: 'laringe', nombre: 'Altura de la laringe', min: 0, max: 1, paso: 0.01 },
  ] },
  { grupo: 'Velo del paladar y nariz', items: [
    { k: 'velo', nombre: 'Velo: subido (nariz cerrada) ↔ bajado', min: 0, max: 1, paso: 0.01 },
    { k: 'resonancia', nombre: 'Cajas de resonancia (senos y pecho)', min: 0, max: 1, paso: 0.01 },
  ] },
  { grupo: 'Lengua', items: [
    { k: 'lenguaPos', nombre: 'Dorso: atrás ↔ adelante', min: 10, max: 33, paso: 0.1 },
    { k: 'lenguaAltura', nombre: 'Dorso: toca el paladar ↔ bajo', min: 0, max: 2, paso: 0.01 },
    { k: 'puntaPos', nombre: 'Punta: posición', min: 30, max: 39, paso: 0.1 },
    { k: 'puntaApertura', nombre: 'Punta: cerrada ↔ relajada', min: 0, max: 3, paso: 0.01 },
  ] },
  { grupo: 'Mandíbula, dientes y labios', items: [
    { k: 'mandibula', nombre: 'Mandíbula: cerrada ↔ abierta', min: 0, max: 1, paso: 0.01 },
    { k: 'labios', nombre: 'Labios: cerrados ↔ abiertos', min: 0, max: 2, paso: 0.01 },
  ] },
];

const entradas = {};
let arrastrando = null;
for (const g of CONTROLES) {
  const caja = document.createElement('div');
  caja.className = 'grupo';
  caja.innerHTML = `<h3>${g.grupo}</h3>`;
  for (const it of g.items) {
    const fila = document.createElement('label');
    fila.className = 'control';
    if (it.opciones) {
      fila.innerHTML = `<span>${it.nombre}</span><select>${it.opciones.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>`;
      const sel = fila.querySelector('select');
      sel.addEventListener('change', async () => {
        await encender();
        enviar({ tipo: 'parar' });
        enviar({ tipo: 'fijar', objetivos: { respiracion: sel.value } });
      });
      entradas[it.k] = { el: sel, it };
    } else {
      fila.innerHTML = `<span>${it.nombre}</span><output></output><input type="range" min="${it.min}" max="${it.max}" step="${it.paso}">`;
      const inp = fila.querySelector('input');
      const out = fila.querySelector('output');
      inp.addEventListener('pointerdown', () => (arrastrando = it.k));
      inp.addEventListener('pointerup', () => (arrastrando = null));
      inp.addEventListener('blur', () => (arrastrando = null));
      inp.addEventListener('input', async () => {
        await encender();
        const v = +inp.value;
        out.textContent = it.fmt ? it.fmt(v) : v.toFixed(2);
        const objetivos = { [it.k]: v };
        if (it.manual) {
          objetivos.respiracion = 'manual';
          entradas.respiracion.el.value = 'manual';
        }
        enviar({ tipo: 'parar' });
        enviar({ tipo: 'fijar', objetivos });
      });
      entradas[it.k] = { el: inp, out, it };
    }
    caja.appendChild(fila);
  }
  $('controles').appendChild(caja);
}

// Volumen general
const volumen = document.createElement('input');
volumen.type = 'range';
volumen.min = 0;
volumen.max = 30;
volumen.step = 0.1;
volumen.value = 11;
{
  const caja = document.createElement('div');
  caja.className = 'grupo';
  caja.innerHTML = '<h3>Salida</h3><label class="control"><span>Volumen</span><output></output></label>';
  caja.querySelector('label').appendChild(volumen);
  volumen.addEventListener('input', () => enviar({ tipo: 'volumen', valor: +volumen.value }));
  $('controles').appendChild(caja);
}

// Los deslizadores siguen a la boca mientras habla.
function sincronizarControles(e) {
  for (const k in entradas) {
    if (k === arrastrando) continue;
    const { el, out, it } = entradas[k];
    if (k === 'respiracion') {
      if (document.activeElement !== el) el.value = e.respiracion;
      continue;
    }
    let v = e.actual[k];
    if (k === 'diafragma') v = e.diafragma;
    if (k === 'intercostales') v = e.intercostalesInt - e.intercostalesExt;
    if (v === undefined) continue;
    el.value = v;
    out.textContent = it.fmt ? it.fmt(v) : (+v).toFixed(2);
  }
}

// ---------- Medidores ----------
const MEDIDORES = [
  ['f0', 'Tono', (e) => (e.vibracion > 0.05 ? Math.round(e.f0) + ' Hz' : '—')],
  ['vol', 'Aire en pulmones', (e) => e.volumen.toFixed(2) + ' L'],
  ['pp', 'Presión pulmonar', (e) => e.pPulmon.toFixed(1) + ' cmH₂O'],
  ['pb', 'Presión en la boca', (e) => e.pBoca.toFixed(1) + ' cmH₂O'],
  ['fb', 'Aire por la boca', (e) => e.flujoBoca.toFixed(2) + ' L/s'],
  ['fn', 'Aire por la nariz', (e) => e.flujoNariz.toFixed(2) + ' L/s'],
];
const celdas = {};
for (const [k, nombre] of MEDIDORES) {
  const d = document.createElement('div');
  d.className = 'medidor';
  d.innerHTML = `<span>${nombre}</span><strong></strong>`;
  $('medidores').appendChild(d);
  celdas[k] = d.querySelector('strong');
}

$('nombres').addEventListener('change', (e) => {
  dibujo.mostrarNombres = e.target.checked;
  if (escena3d) escena3d.mostrarNombres = e.target.checked;
});

// ---------- Bucle de dibujo ----------
let cuadro = 0;
function bucle() {
  if (!contexto) {
    // sin audio: la simulación corre aquí sólo para animar la respiración
    const blk = new Float32Array(128);
    for (let i = 0; i < 6; i++) local.procesar(blk);
    estado = local.instantanea();
  }
  if (vista === '3d') escena3d.dibujar(estado);
  else dibujo.dibujar(estado);
  if (++cuadro % 4 === 0) {
    for (const [k, , f] of MEDIDORES) celdas[k].textContent = f(estado);
    sincronizarControles(estado);
  }
  requestAnimationFrame(bucle);
}
requestAnimationFrame(bucle);
