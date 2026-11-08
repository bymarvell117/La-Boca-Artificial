// TTS mecánico, paso 1: texto en español → fonemas con acento y pausas.
//
// Reglas ortográficas del español (no usa diccionario ni IA).
// Fonemas (símbolos AFI simplificados):
//   vocales: a e i o u      semivocales: j w
//   oclusivas: p b t d k g   aproximantes: β ð ɣ
//   fricativas: f s θ x ʝ    africada: tʃ
//   nasales: m n ɲ           líquidas: l ɾ (simple) r (múltiple)

const VOCALES = 'aeiouáéíóúü';
const CON_TILDE = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u' };
const DEBILES = 'iu';

// Palabras que se pronuncian sin acento propio.
const ATONAS = new Set(('el la los las lo le les de del a al y e o u en con por para que se me te nos ' +
  'os mi mis tu tus su sus sin si ni pero como cuando donde mas un unos unas').split(' '));

const NUMEROS = [
  'cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve',
];
const DECENAS = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];

function numeroATexto(n) {
  if (n < 20) return NUMEROS[n];
  if (n < 30) return n === 20 ? 'veinte' : 'veinti' + NUMEROS[n - 20];
  if (n < 100) return DECENAS[Math.floor(n / 10)] + (n % 10 ? ' y ' + NUMEROS[n % 10] : '');
  if (n === 100) return 'cien';
  if (n < 1000) {
    const c = Math.floor(n / 100);
    const nombres = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
      'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];
    return nombres[c] + (n % 100 ? ' ' + numeroATexto(n % 100) : '');
  }
  if (n < 1000000) {
    const m = Math.floor(n / 1000);
    return (m === 1 ? 'mil' : numeroATexto(m) + ' mil') + (n % 1000 ? ' ' + numeroATexto(n % 1000) : '');
  }
  return String(n).split('').map((d) => NUMEROS[+d]).join(' ');
}

// Separa el texto en grupos (frases) con su puntuación final.
export function frases(texto) {
  const limpio = texto
    .replace(/\d+/g, (m) => ' ' + numeroATexto(parseInt(m, 10)) + ' ')
    .toLowerCase();
  const grupos = [];
  let actual = '';
  for (const ch of limpio) {
    if ('.,;:!?¡¿\n'.includes(ch)) {
      if (actual.trim()) grupos.push({ texto: actual.trim(), fin: ch === '¡' || ch === '¿' ? '' : ch });
      else if (grupos.length && ch !== '¡' && ch !== '¿') grupos[grupos.length - 1].fin = ch;
      actual = '';
    } else actual += ch;
  }
  if (actual.trim()) grupos.push({ texto: actual.trim(), fin: '.' });
  for (const g of grupos) if (g.fin === '\n' || g.fin === '') g.fin = '.';
  return grupos;
}

const esVocal = (c) => c !== undefined && VOCALES.includes(c);

// Convierte una palabra en fonemas, sin acento todavía.
// Devuelve [{ f, letra }] donde `letra` es la letra vocal original (con tilde).
function letrasAFonemas(p, opciones) {
  const out = [];
  const add = (f, letra = '') => out.push({ f, letra });
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    const sig = p[i + 1];
    const ant = p[i - 1];
    switch (c) {
      case 'a': case 'e': case 'i': case 'o': case 'u':
      case 'á': case 'é': case 'í': case 'ó': case 'ú': case 'ü':
        add(CON_TILDE[c] || c, c);
        break;
      case 'b': case 'v': add('b'); break;
      case 'c':
        if (sig === 'h') { add('tʃ'); i++; }
        else if ('eiéí'.includes(sig || '_')) add(opciones.ceceo ? 'θ' : 's');
        else add('k');
        break;
      case 'd': add('d'); break;
      case 'f': add('f'); break;
      case 'g':
        if ('eiéí'.includes(sig || '_')) add('x');
        else if (sig === 'u' && 'eiéí'.includes(p[i + 2] || '_')) { add('g'); i++; }
        else add('g');
        break;
      case 'h': break; // muda
      case 'j': add('x'); break;
      case 'k': add('k'); break;
      case 'l':
        if (sig === 'l') { add('ʝ'); i++; } else add('l');
        break;
      case 'm': add('m'); break;
      case 'n': add('n'); break;
      case 'ñ': add('ɲ'); break;
      case 'p': add('p'); break;
      case 'q':
        add('k');
        if (sig === 'u') i++;
        break;
      case 'r':
        if (sig === 'r') { add('r'); i++; }
        else if (i === 0 || 'nls'.includes(ant)) add('r');
        else add('ɾ');
        break;
      case 's': add('s'); break;
      case 't': add('t'); break;
      case 'w': add('w'); break;
      case 'x': add('k'); add('s'); break;
      case 'y':
        if (i === p.length - 1 || !esVocal(sig)) add('i', 'y');
        else add('ʝ');
        break;
      case 'z': add(opciones.ceceo ? 'θ' : 's'); break;
      default: break; // otros signos se ignoran
    }
  }
  return out;
}

// Marca semivocales (diptongos) y la sílaba tónica.
function acentuar(fon, palabra) {
  const nucleos = []; // índices de vocales que son núcleo de sílaba
  for (let i = 0; i < fon.length; i++) {
    const x = fon[i];
    if (!'aeiou'.includes(x.f)) continue;
    const debil = DEBILES.includes(x.f) && !'íú'.includes(x.letra);
    const nextV = i + 1 < fon.length && 'aeiou'.includes(fon[i + 1].f);
    const prevNucleo = nucleos.includes(i - 1);
    // i/u átona: semivocal antes de vocal (pie, cuatro, ciudad)
    // o después de un núcleo (aire, causa, hoy).
    if (debil && (nextV || prevNucleo)) {
      x.f = x.f === 'i' ? 'j' : 'w';
      continue;
    }
    nucleos.push(i);
  }
  if (!nucleos.length) return fon;

  // Sílaba tónica
  let tonica = -1;
  for (const i of nucleos) if ('áéíóú'.includes(fon[i].letra)) tonica = i;
  if (tonica < 0) {
    const ultima = palabra[palabra.length - 1];
    const llana = 'aeiouns'.includes(ultima);
    tonica = llana && nucleos.length > 1 ? nucleos[nucleos.length - 2] : nucleos[nucleos.length - 1];
  }
  if (!ATONAS.has(palabra)) fon[tonica].tonica = true;
  return fon;
}

// Las oclusivas sonoras se relajan entre vocales (b→β, d→ð, g→ɣ).
function relajar(seq) {
  for (let i = 0; i < seq.length; i++) {
    const x = seq[i];
    if (!'bdg'.includes(x.f) || x.f.length !== 1) continue;
    const ant = seq[i - 1];
    if (!ant || ant.f === '|') continue; // inicio tras pausa: oclusiva
    if (ant.f === 'm' || ant.f === 'n') continue; // tras nasal: oclusiva
    if (x.f === 'd' && ant.f === 'l') continue; // "ld": oclusiva
    x.f = { b: 'β', d: 'ð', g: 'ɣ' }[x.f];
  }
  return seq;
}

// Texto → lista de grupos: { fonemas: [{ f, tonica }], fin }
export function textoAFonemas(texto, opciones = {}) {
  return frases(texto).map(({ texto: t, fin }) => {
    const palabras = t.split(/[^a-záéíóúüñ]+/).filter(Boolean);
    let seq = [{ f: '|' }];
    for (const p of palabras) {
      const fon = acentuar(letrasAFonemas(p, opciones), p);
      if (fon.length) {
        fon[0].inicioPalabra = true;
        seq.push(...fon);
      }
    }
    seq = relajar(seq).filter((x) => x.f !== '|');
    return { fonemas: seq.map(({ f, tonica, inicioPalabra }) => ({ f, tonica: !!tonica, inicioPalabra: !!inicioPalabra })), fin };
  });
}

// Forma compacta para mostrar y probar: "ˈka.sa" → "kˈasa"
export function transcribir(texto, opciones) {
  return textoAFonemas(texto, opciones)
    .map((g) => g.fonemas.map((x) => (x.inicioPalabra ? ' ' : '') + (x.tonica ? 'ˈ' : '') + x.f).join('').trim())
    .join(' | ');
}
