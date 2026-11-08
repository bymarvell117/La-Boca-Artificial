# La Boca Artificial

Un aparato fonador humano simulado en el navegador. No reproduce voces grabadas:
el sonido nace de la física del aire que sale de los pulmones, hace vibrar las
cuerdas vocales y resuena en la garganta, la boca y la nariz. Lo que se oye
depende de cómo se mueven la lengua, los labios, el velo y la mandíbula.

## Partes que simula

| Parte | Qué hace en el programa |
|---|---|
| **Toma y salida de aire** | El aire entra y sale por la nariz y la boca según las presiones; se ve con partículas animadas. |
| **Diafragma** | Se contrae y baja para inspirar (presión negativa en los pulmones). |
| **Músculos intercostales** | Externos: ayudan a inspirar. Internos: empujan el aire al hablar. |
| **Pulmones** | Volumen, retroceso elástico y presión alveolar. Si se quedan sin aire al hablar, toman aire solos. |
| **Tráquea** | Resistencia al paso del aire y resonancias subglóticas. |
| **Laringe** | Su altura cambia el tono y la forma de la faringe baja. |
| **Cuerdas vocales** | Pulso glotal (Rosenberg) con tensión (tono) y aducción (juntas = voz, separadas = respirar o susurrar). Sólo vibran si hay presión suficiente. |
| **Faringe (garganta)** | Tubo acústico de guía de ondas. |
| **Velo del paladar** | Abre o cierra el paso a la nariz (nasales /m n ɲ/). |
| **Paladar duro** | Techo fijo contra el que trabaja la lengua. |
| **Nariz** | Segundo tubo acústico unido por el velo. |
| **Cajas de resonancia** | Senos paranasales (maxilar y frontal) y resonancia del pecho. |
| **Lengua** | Dorso (posición y altura) y punta (posición y apertura). |
| **Dientes** | El chorro de aire choca con ellos en /s/, /θ/, /f/ y /t/. |
| **Labios** | Apertura y redondeo; cierre para /p b m/. |
| **Mandíbula** | Abre la boca y arrastra lengua y labios. |

## Cómo se usa

Necesitas [Node.js](https://nodejs.org) 18 o más reciente (sólo para el servidor local; no hay dependencias que instalar).

```bash
node servidor.js
```

Abre <http://localhost:8080> y pulsa **Encender sonido**. Hay tres formas de controlarla:

- **Hablar**: escribe un texto en español y pulsa *Hablar*. Puedes elegir voz grave, media o aguda, la velocidad y el acento (Latinoamérica o España).
- **Fonemas**: botones para cada sonido del español (/a/, /p/, /s/, /m/, /r/…).
- **Control manual**: deslizadores para cada órgano: respiración, diafragma, intercostales, cuerdas vocales, laringe, velo, lengua, mandíbula, labios y cajas de resonancia.

> El audio del navegador (AudioWorklet) no funciona abriendo `index.html` directamente: hace falta el servidor local.

## Cómo funciona

```
texto ──► reglas del español ──► fonemas ──► plan de movimientos
                                                    │
pulmones ─► tráquea ─► laringe/cuerdas ─► faringe ─┬─► boca ─► dientes ─► labios ─► sonido
  ▲ diafragma, intercostales                        └─► velo ─► nariz ─► senos
```

- `src/core/` — la física, igual en el navegador y en Node:
  - `anatomia.js`: dónde está cada órgano y cómo los articuladores dan los diámetros del tubo.
  - `tracto.js`: guía de ondas de Kelly-Lochbaum (44 tramos de tracto + 28 de nariz).
  - `glotis.js`: cuerdas vocales.
  - `pulmones.js`: respiración y aerodinámica (presión en pulmones y boca, flujos por boca y nariz).
  - `boca.js`: une todo; turbulencia, explosiones de las oclusivas y cajas de resonancia.
- `src/tts/` — TTS mecánico:
  - `texto-a-fonemas.js`: ortografía → fonemas, diptongos, sílaba tónica, b/d/g suaves, números.
  - `fonemas.js`: la postura de los órganos para cada fonema. Las vocales están ajustadas a los formantes del español.
  - `planificador.js`: duraciones, entonación (pregunta, afirmación), pausas y respiración.
- `src/audio/procesador.js` — AudioWorklet que corre la simulación en tiempo real.
- `src/ui/dibujo.js` — el corte de perfil animado y la vista de las cuerdas vocales desde arriba.

Muchas cosas del habla salen solas de la física, sin programarlas aparte. Por
ejemplo, en una /b/ la boca cerrada se llena de aire y la vibración se apaga
sola; al abrir una /p/ la presión acumulada produce la explosión.

## Pruebas

```bash
npm test
```

Comprueban las reglas de pronunciación, la entonación, los formantes de las
vocales y la física (presión en las oclusivas, aire por la nariz en /m/,
estabilidad numérica).

## Próximos pasos

- TTS por IA: que un modelo de lenguaje proponga la prosodia (ritmo y entonación) o los movimientos.
- Laterales y vibrantes más realistas (el modelo 1D no tiene canales laterales).
- Longitud variable del tracto (laringe y labios protruidos).
