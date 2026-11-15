// Personajes del garito y su forma de jugar.

import { randomInt } from './cards.js';
import { evaluate5, evaluate7, CAT5 } from './eval5.js';

export const BOT_NAMES = [
  'El Tuerto', 'La Viuda', 'Don Ramiro', 'Chencho', 'Madame Fortuna', 'El Profe',
  'Lucky Lucía', 'El Mudo', 'Doña Cleta', 'Paco Faroles', 'La Condesa', 'Manos de Seda',
];

export const AVATARS = ['🎩', '🕶️', '🥃', '🎲', '💎', '🃏', '🌹', '🐍', '🦊', '👑', '🦉', '🐈‍⬛'];

export function rand(min, max) {
  return min + randomInt(max - min + 1);
}

function chance(p) {
  return randomInt(10000) < p * 10000;
}

const round5 = (x) => Math.max(5, Math.round(x / 5) * 5);

// ---------- Póker de 5 cartas (descarte) ----------

/** Fuerza aproximada de la mano (0..1). En la primera ronda se valora también el proyecto. */
export function drawStrength(cards, preDraw) {
  const ev = evaluate5(cards);
  let s;
  switch (ev.cat) {
    case CAT5.HIGH: s = 0.05 + ((ev.tb[0] - 7) / 7) * 0.15; break;
    case CAT5.PAIR: s = 0.25 + ((ev.tb[0] - 2) / 12) * 0.3; break;
    case CAT5.TWO_PAIR: s = 0.62 + ((ev.tb[0] - 3) / 11) * 0.1; break;
    case CAT5.TRIPS: s = 0.78; break;
    case CAT5.STRAIGHT: s = 0.86; break;
    case CAT5.FLUSH: s = 0.9; break;
    case CAT5.FULL_HOUSE: s = 0.95; break;
    default: s = 0.99;
  }
  if (preDraw && ev.cat <= CAT5.PAIR) {
    const plan = drawPlan(cards);
    if (plan.kind === 'flush') s = Math.max(s, 0.42);
    if (plan.kind === 'straight') s = Math.max(s, 0.38);
  }
  return Math.max(0, Math.min(1, s));
}

/** Qué cartas descartar (índices). Respeta el límite: 3, o 4 si te quedas un As. */
export function drawPlan(cards) {
  const ev = evaluate5(cards);
  const idx = [0, 1, 2, 3, 4];
  if (ev.cat >= CAT5.STRAIGHT) return { kind: 'pat', discard: [] }; // mano hecha: se sirve
  const count = (r) => cards.filter((c) => c.r === r).length;
  if (ev.cat === CAT5.TRIPS || ev.cat === CAT5.TWO_PAIR || ev.cat === CAT5.PAIR) {
    // Guarda lo emparejado y cambia el resto (3 con pareja, 2 con trío, 1 con doble pareja).
    return { kind: 'made', discard: idx.filter((i) => count(cards[i].r) < 2) };
  }
  // Proyecto de color: 4 del mismo palo
  for (const s of ['s', 'h', 'd', 'c']) {
    const same = idx.filter((i) => cards[i].s === s);
    if (same.length === 4) return { kind: 'flush', discard: idx.filter((i) => cards[i].s !== s) };
  }
  // Proyecto de escalera abierta: 4 valores consecutivos (no vale A-2-3-4 ni J-Q-K-A, que son cerradas)
  const sorted = idx.slice().sort((a, b) => cards[a].r - cards[b].r);
  for (const skip of sorted) {
    const four = sorted.filter((i) => i !== skip).map((i) => cards[i].r);
    const consecutive = four.every((r, k) => k === 0 || r === four[k - 1] + 1);
    if (consecutive && four[0] >= 2 && four[3] <= 13) return { kind: 'straight', discard: [skip] };
  }
  // Nada: guarda el As y cambia 4, o guarda las dos más altas y cambia 3.
  const byRank = idx.slice().sort((a, b) => cards[b].r - cards[a].r);
  if (cards[byRank[0]].r === 14) return { kind: 'nothing', discard: byRank.slice(1) };
  return { kind: 'nothing', discard: byRank.slice(2) };
}

/**
 * Decide la acción de un bot en una ronda de apuestas.
 * info: { cards, preDraw, toCall, pot, chips, bet, currentBet, minTo, maxTo, canRaise, canCheck, drewByOthers }
 */
export function botDrawAction(info) {
  return botDecide(drawStrength(info.cards, info.preDraw), info);
}

/**
 * Decisión común a los dos juegos a partir de una fuerza de mano s (0..1).
 * info.cheapCall: hasta cuánto se iguala "por ver" con una mano jugable (ciegas del Hold'em).
 */
export function botDecide(s, info) {
  const bluff = chance(0.06);
  const potAfter = info.pot + info.toCall;
  const odds = info.toCall > 0 ? info.toCall / potAfter : 0;
  const raiseTo = () => {
    const target = info.currentBet + round5(info.pot * (0.5 + randomInt(60) / 100));
    return Math.min(info.maxTo, Math.max(info.minTo, target));
  };

  if (info.canRaise && (s > 0.72 || (bluff && s < 0.3)) && chance(s > 0.85 ? 0.8 : 0.55)) {
    return { a: 'raise', to: raiseTo() };
  }
  if (info.toCall === 0) {
    if (info.canRaise && s > 0.5 && chance(0.4)) return { a: 'raise', to: raiseTo() };
    return { a: 'check' };
  }
  const commit = info.toCall / Math.max(1, info.chips + info.bet);
  if (s >= 0.6) return { a: 'call' };
  if (info.cheapCall && info.toCall <= info.cheapCall && s > 0.3) return { a: 'call' };
  if (s > odds + 0.12 && commit < 0.45) return { a: 'call' };
  if (info.toCall <= info.pot * 0.15 && s > 0.15) return { a: 'call' };
  if (bluff && commit < 0.2) return { a: 'call' };
  return { a: 'fold' };
}

// ---------- Texas Hold'em ----------

/** Fuerza de las dos cartas propias antes del flop (0..1). */
export function preflopStrength([a, b]) {
  const hi = Math.max(a.r, b.r);
  const lo = Math.min(a.r, b.r);
  if (a.r === b.r) return 0.5 + ((hi - 2) / 12) * 0.45; // 22 → 0,50 · AA → 0,95
  let s = ((hi - 2) / 12) * 0.35 + ((lo - 2) / 12) * 0.2;
  if (a.s === b.s) s += 0.06;
  const gap = hi - lo;
  if (gap === 1) s += 0.05;
  else if (gap === 2) s += 0.02;
  if (hi === 14) s += 0.06;
  return Math.min(1, s);
}

/** Fuerza tras el flop: categoría de la mejor mano de 7 y proyectos de color/escalera. */
export function boardStrength(hole, board) {
  const ev = evaluate7([...hole, ...board]);
  let s;
  switch (ev.cat) {
    case CAT5.HIGH: s = 0.08 + ((ev.tb[0] - 7) / 7) * 0.12; break;
    case CAT5.PAIR: {
      // Una pareja que sólo está en la mesa la tiene todo el mundo
      const onBoard = board.filter((c) => c.r === ev.tb[0]).length === 2;
      s = onBoard ? 0.15 : 0.32 + ((ev.tb[0] - 2) / 12) * 0.3;
      break;
    }
    case CAT5.TWO_PAIR: s = 0.62; break;
    case CAT5.TRIPS: s = 0.78; break;
    case CAT5.STRAIGHT: s = 0.85; break;
    case CAT5.FLUSH: s = 0.9; break;
    case CAT5.FULL_HOUSE: s = 0.95; break;
    default: s = 0.99;
  }
  if (board.length < 5 && ev.cat <= CAT5.PAIR) {
    const all = [...hole, ...board];
    for (const suit of ['s', 'h', 'd', 'c']) {
      const n = all.filter((c) => c.s === suit).length;
      if (n >= 4 && hole.some((c) => c.s === suit)) s = Math.max(s, 0.42);
    }
    let mask = 0;
    for (const c of all) {
      mask |= 1 << c.r;
      if (c.r === 14) mask |= 1 << 1;
    }
    for (let lo = 1; lo <= 10; lo++) {
      const w = (mask >> lo) & 0b1111;
      if (w === 0b1111 && lo >= 2 && lo <= 10) s = Math.max(s, 0.36);
    }
  }
  return s;
}

export function botHoldemAction(info) {
  const s = info.board.length < 3 ? preflopStrength(info.hole) : boardStrength(info.hole, info.board);
  return botDecide(s, { ...info, cheapCall: info.board.length < 3 ? info.bigBlind * 3 : 0 });
}
