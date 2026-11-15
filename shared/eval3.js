// Evaluador de manos de 3 cartas (Three Card Poker).
// Orden (de mayor a menor): Escalera de color > Trío > Escalera > Color > Pareja > Carta alta.
// Ojo: con 3 cartas la escalera vale MÁS que el color (es más difícil de conseguir).
// El As puede ser alto (Q-K-A, la mejor escalera) o bajo (A-2-3, la peor).

import { RANK_PLURAL, RANK_LABEL, alto } from './cards.js';

export const CAT3 = {
  HIGH: 0,
  PAIR: 1,
  FLUSH: 2,
  STRAIGHT: 3,
  TRIPS: 4,
  STRAIGHT_FLUSH: 5,
};

export const CAT3_NAME = ['Carta alta', 'Pareja', 'Color', 'Escalera', 'Trío', 'Escalera de color'];

export function evaluate3(cards) {
  if (!Array.isArray(cards) || cards.length !== 3) throw new Error('evaluate3: se esperan 3 cartas');
  const ranks = cards.map((c) => c.r).sort((a, b) => b - a);
  const flush = cards[0].s === cards[1].s && cards[1].s === cards[2].s;

  let straightHigh = 0;
  if (ranks[0] - 1 === ranks[1] && ranks[1] - 1 === ranks[2]) straightHigh = ranks[0];
  else if (ranks[0] === 14 && ranks[1] === 3 && ranks[2] === 2) straightHigh = 3; // A-2-3

  let cat;
  let tb; // desempate, de más a menos importante
  if (straightHigh && flush) {
    cat = CAT3.STRAIGHT_FLUSH;
    tb = [straightHigh];
  } else if (ranks[0] === ranks[2]) {
    cat = CAT3.TRIPS;
    tb = [ranks[0]];
  } else if (straightHigh) {
    cat = CAT3.STRAIGHT;
    tb = [straightHigh];
  } else if (flush) {
    cat = CAT3.FLUSH;
    tb = ranks;
  } else if (ranks[0] === ranks[1] || ranks[1] === ranks[2]) {
    cat = CAT3.PAIR;
    const pair = ranks[1];
    const kicker = ranks[0] === ranks[1] ? ranks[2] : ranks[0];
    tb = [pair, kicker];
  } else {
    cat = CAT3.HIGH;
    tb = ranks;
  }

  let score = cat;
  for (let i = 0; i < 3; i++) score = score * 15 + (tb[i] || 0);

  return { cat, score, tb, name: CAT3_NAME[cat], desc: describe3(cat, tb, ranks, straightHigh) };
}

function describe3(cat, tb, ranks, straightHigh) {
  switch (cat) {
    case CAT3.STRAIGHT_FLUSH:
      return straightHigh === 14 ? 'Escalera de color máxima (Q-K-A)' : `Escalera de color ${alto(straightHigh)}`;
    case CAT3.TRIPS:
      return `Trío de ${RANK_PLURAL[tb[0]]}`;
    case CAT3.STRAIGHT:
      return `Escalera ${alto(straightHigh)}`;
    case CAT3.FLUSH:
      return `Color ${alto(ranks[0])}`;
    case CAT3.PAIR:
      return `Pareja de ${RANK_PLURAL[tb[0]]}`;
    default:
      return `Carta alta: ${ranks.map((r) => RANK_LABEL[r]).join('-')}`;
  }
}

/** ¿La mano del crupier "califica"? Necesita Reina alta o mejor. */
export function dealerQualifies(ev) {
  return ev.cat > CAT3.HIGH || ev.tb[0] >= 12;
}

/**
 * Estrategia óptima conocida: jugar con Q-6-4 o mejor; retirarse con peor.
 * (Mano mínima Q-6-4: Reina, Seis, Cuatro de carta alta.)
 */
export function shouldPlay(ev) {
  if (ev.cat > CAT3.HIGH) return true;
  const [a, b, c] = ev.tb;
  if (a !== 12) return a > 12;
  if (b !== 6) return b > 6;
  return c >= 4;
}

// Tablas de pago (multiplicador "a 1").
export const ANTE_BONUS = { [CAT3.STRAIGHT_FLUSH]: 5, [CAT3.TRIPS]: 4, [CAT3.STRAIGHT]: 1 };
export const PAIR_PLUS = {
  [CAT3.STRAIGHT_FLUSH]: 40,
  [CAT3.TRIPS]: 30,
  [CAT3.STRAIGHT]: 6,
  [CAT3.FLUSH]: 4,
  [CAT3.PAIR]: 1,
};
