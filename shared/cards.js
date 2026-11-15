// Baraja francesa de 52 cartas. Una carta es { r: 2..14, s: 's'|'h'|'d'|'c' }.
// 11 = J, 12 = Q, 13 = K, 14 = A.

export const SUITS = ['s', 'h', 'd', 'c'];
export const SUIT_SYMBOL = { s: '♠', h: '♥', d: '♦', c: '♣' };
export const SUIT_NAME = { s: 'picas', h: 'corazones', d: 'diamantes', c: 'tréboles' };
export const RANK_LABEL = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};

export const RANK_SINGULAR = {
  2: 'Dos', 3: 'Tres', 4: 'Cuatro', 5: 'Cinco', 6: 'Seis', 7: 'Siete', 8: 'Ocho',
  9: 'Nueve', 10: 'Diez', 11: 'Jota', 12: 'Reina', 13: 'Rey', 14: 'As',
};
export const RANK_PLURAL = {
  2: 'Doses', 3: 'Treses', 4: 'Cuatros', 5: 'Cincos', 6: 'Seises', 7: 'Sietes', 8: 'Ochos',
  9: 'Nueves', 10: 'Dieces', 11: 'Jotas', 12: 'Reinas', 13: 'Reyes', 14: 'Ases',
};

/** "al Rey", "a la Reina", "al 9"... para nombrar la carta más alta. */
export function alto(r) {
  if (r === 11) return 'a la Jota';
  if (r === 12) return 'a la Reina';
  if (r === 13) return 'al Rey';
  if (r === 14) return 'al As';
  return `al ${r}`;
}

export function newDeck() {
  const deck = [];
  for (const s of SUITS) for (let r = 2; r <= 14; r++) deck.push({ r, s });
  return deck;
}

/** Entero uniforme en [0, n) con generador criptográfico y sin sesgo de módulo. */
export function randomInt(n) {
  if (!Number.isInteger(n) || n <= 0) throw new Error('randomInt: n inválido');
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
}

/** Fisher–Yates in situ. */
export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function shuffledDeck() {
  return shuffle(newDeck());
}

export function cardText(c) {
  return RANK_LABEL[c.r] + SUIT_SYMBOL[c.s];
}

export function sameCard(a, b) {
  return !!a && !!b && a.r === b.r && a.s === b.s;
}
