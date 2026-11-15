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
