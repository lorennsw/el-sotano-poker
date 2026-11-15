// Evaluador de manos de 5 cartas (póker clásico).
// Orden: Escalera real/de color > Póker > Full > Color > Escalera > Trío > Doble pareja > Pareja > Carta alta.
// El As puede cerrar la escalera por arriba (10-J-Q-K-A) o abrirla por abajo (A-2-3-4-5, "la rueda").

import { RANK_PLURAL, RANK_LABEL, alto } from './cards.js';

export const CAT5 = {
  HIGH: 0,
  PAIR: 1,
  TWO_PAIR: 2,
  TRIPS: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  QUADS: 7,
  STRAIGHT_FLUSH: 8,
};

export const CAT5_NAME = [
  'Carta alta', 'Pareja', 'Doble pareja', 'Trío', 'Escalera', 'Color', 'Full', 'Póker', 'Escalera de color',
];

export function evaluate5(cards) {
  if (!Array.isArray(cards) || cards.length !== 5) throw new Error('evaluate5: se esperan 5 cartas');

  const counts = new Map();
  for (const c of cards) counts.set(c.r, (counts.get(c.r) || 0) + 1);
  // Grupos ordenados por (cantidad desc, valor desc): p. ej. full K-K-K-3-3 -> [[13,3],[3,2]]
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = cards.every((c) => c.s === cards[0].s);

  let straightHigh = 0;
  if (groups.length === 5) {
    const rs = groups.map((g) => g[0]); // ya en orden descendente
    if (rs[0] - rs[4] === 4) straightHigh = rs[0];
    else if (rs[0] === 14 && rs[1] === 5 && rs[4] === 2) straightHigh = 5; // A-2-3-4-5
  }

  let cat;
  let tb;
  const shape = groups.map((g) => g[1]).join('');
  if (straightHigh && flush) {
    cat = CAT5.STRAIGHT_FLUSH;
    tb = [straightHigh];
  } else if (shape === '41') {
    cat = CAT5.QUADS;
    tb = groups.map((g) => g[0]);
  } else if (shape === '32') {
    cat = CAT5.FULL_HOUSE;
    tb = groups.map((g) => g[0]);
  } else if (flush) {
    cat = CAT5.FLUSH;
    tb = groups.map((g) => g[0]);
  } else if (straightHigh) {
    cat = CAT5.STRAIGHT;
    tb = [straightHigh];
  } else if (shape === '311') {
    cat = CAT5.TRIPS;
    tb = groups.map((g) => g[0]);
  } else if (shape === '221') {
    cat = CAT5.TWO_PAIR;
    tb = groups.map((g) => g[0]);
  } else if (shape === '2111') {
    cat = CAT5.PAIR;
    tb = groups.map((g) => g[0]);
  } else {
    cat = CAT5.HIGH;
    tb = groups.map((g) => g[0]);
  }

  let score = cat;
  for (let i = 0; i < 5; i++) score = score * 15 + (tb[i] || 0);

  return { cat, score, tb, name: nameOf(cat, tb), desc: describe5(cat, tb) };
}

function nameOf(cat, tb) {
  if (cat === CAT5.STRAIGHT_FLUSH && tb[0] === 14) return 'Escalera real';
  return CAT5_NAME[cat];
}

function describe5(cat, tb) {
  switch (cat) {
    case CAT5.STRAIGHT_FLUSH:
      return tb[0] === 14 ? 'Escalera real' : `Escalera de color ${alto(tb[0])}`;
    case CAT5.QUADS:
      return `Póker de ${RANK_PLURAL[tb[0]]}`;
    case CAT5.FULL_HOUSE:
      return `Full de ${RANK_PLURAL[tb[0]]} y ${RANK_PLURAL[tb[1]]}`;
    case CAT5.FLUSH:
      return `Color ${alto(tb[0])}`;
    case CAT5.STRAIGHT:
      return `Escalera ${alto(tb[0])}`;
    case CAT5.TRIPS:
      return `Trío de ${RANK_PLURAL[tb[0]]}`;
    case CAT5.TWO_PAIR:
      return `Doble pareja: ${RANK_PLURAL[tb[0]]} y ${RANK_PLURAL[tb[1]]}`;
    case CAT5.PAIR:
      return `Pareja de ${RANK_PLURAL[tb[0]]}`;
    default:
      return `Carta alta: ${RANK_LABEL[tb[0]]}`;
  }
}

// ---------------------------------------------------------- Texas Hold'em

const COMBOS = {};
function combos(n) {
  if (COMBOS[n]) return COMBOS[n];
  const out = [];
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          for (let e = d + 1; e < n; e++) out.push([a, b, c, d, e]);
  return (COMBOS[n] = out);
}

/** La mejor mano de 5 cartas entre 5, 6 o 7 (tus dos cartas + la mesa). */
export function evaluate7(cards) {
  if (!Array.isArray(cards) || cards.length < 5 || cards.length > 7) throw new Error('evaluate7: se esperan de 5 a 7 cartas');
  let best = null;
  for (const idx of combos(cards.length)) {
    const five = idx.map((i) => cards[i]);
    const ev = evaluate5(five);
    if (!best || ev.score > best.score) best = { ...ev, cards: five };
  }
  return best;
}

/** Cómo llamar a tus dos cartas antes de que salga el flop. */
export function describeHole([a, b]) {
  if (a.r === b.r) return { cat: CAT5.PAIR, score: 0, tb: [a.r], name: 'Pareja', desc: `Pareja de ${RANK_PLURAL[a.r]}` };
  const [hi, lo] = a.r > b.r ? [a, b] : [b, a];
  const suited = a.s === b.s ? ' del mismo palo' : '';
  return { cat: CAT5.HIGH, score: 0, tb: [hi.r, lo.r], name: 'Carta alta', desc: `${RANK_LABEL[hi.r]}-${RANK_LABEL[lo.r]}${suited}` };
}
