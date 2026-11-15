// Personajes del garito y su forma de jugar.

import { randomInt } from './cards.js';
import { shouldPlay } from './eval3.js';
import { evaluate5, CAT5 } from './eval5.js';

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

// ---------- Póker de 3 cartas ----------

export function botThreeBet(chips) {
  const choices = [10, 10, 25, 25, 50, 100];
  let ante = choices[randomInt(choices.length)];
  let pp = chance(0.55) ? [5, 10, 25][randomInt(3)] : 0;
  while (ante > 5 && 2 * ante + pp > chips) ante = ante > 25 ? ante / 2 : 5;
  if (2 * ante + pp > chips) pp = 0;
  if (2 * ante > chips) return { ante: 0, pp: chips >= 5 ? 5 : 0 };
  return { ante: round5(ante), pp };
}

/** Los bots usan la estrategia óptima (Q-6-4) con un pequeño margen de error humano. */
export function botThreeDecide(ev) {
  const best = shouldPlay(ev);
  if (chance(0.04)) return !best;
  return best;
}

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
  const s = drawStrength(info.cards, info.preDraw);
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
  // Ir all-in por poco dinero relativo no asusta tanto
  const commit = info.toCall / Math.max(1, info.chips + info.bet);
  if (s >= 0.6) return { a: 'call' };
  if (s > odds + 0.12 && commit < 0.45) return { a: 'call' };
  if (info.toCall <= info.pot * 0.15 && s > 0.15) return { a: 'call' };
  if (bluff && commit < 0.2) return { a: 'call' };
  return { a: 'fold' };
}
