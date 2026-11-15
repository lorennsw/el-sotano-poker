// Cartas de El Sótano: frente con índices grandes, figuras dibujadas en SVG,
// ases ornamentados y un dorso art déco burdeos y oro.

import { RANK_LABEL, SUIT_SYMBOL } from '../shared/cards.js';

const RED = { h: true, d: true };
const INK = { red: '#b3122a', black: '#16130f' };
const GOLD = '#c9a24a';
const GOLD_DARK = '#7a5a1c';

// Posición de los símbolos (en % del área central) para las cartas numéricas.
const PIPS = {
  2: [[50, 0], [50, 100]],
  3: [[50, 0], [50, 50], [50, 100]],
  4: [[0, 0], [100, 0], [0, 100], [100, 100]],
  5: [[0, 0], [100, 0], [50, 50], [0, 100], [100, 100]],
  6: [[0, 0], [100, 0], [0, 50], [100, 50], [0, 100], [100, 100]],
  7: [[0, 0], [100, 0], [50, 25], [0, 50], [100, 50], [0, 100], [100, 100]],
  8: [[0, 0], [100, 0], [50, 25], [0, 50], [100, 50], [50, 75], [0, 100], [100, 100]],
  9: [[0, 0], [100, 0], [0, 33.3], [100, 33.3], [50, 50], [0, 66.7], [100, 66.7], [0, 100], [100, 100]],
  10: [[0, 0], [100, 0], [50, 16.7], [0, 33.3], [100, 33.3], [0, 66.7], [100, 66.7], [50, 83.3], [0, 100], [100, 100]],
};

const BACK_SVG = `
<svg class="back-medal" viewBox="0 0 60 60" aria-hidden="true">
  <circle cx="30" cy="30" r="26" fill="#2a0409" stroke="${GOLD}" stroke-width="1.6"/>
  <circle cx="30" cy="30" r="22.5" fill="none" stroke="${GOLD}" stroke-width=".6" stroke-dasharray="1.2 1.6"/>
  <path d="M30 10 L33 27 L50 30 L33 33 L30 50 L27 33 L10 30 L27 27 Z" fill="none" stroke="${GOLD}" stroke-width=".5" opacity=".55"/>
  <text x="30" y="38.5" text-anchor="middle" font-family="Playfair Display, serif" font-weight="900" font-size="24" fill="${GOLD}">S</text>
  <text x="30" y="18.5" text-anchor="middle" font-size="7" fill="${GOLD}">♠</text>
  <text x="30" y="49" text-anchor="middle" font-size="5" fill="${GOLD}" letter-spacing="1" font-family="Oswald, sans-serif">1927</text>
</svg>`;

function esc(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

/** Emblema de la figura (mitad superior). Se dibuja dos veces, la segunda girada 180°. */
function emblem(rank, color, sym) {
  if (rank === 13) {
    // Rey: corona alta de tres puntas con cruces
    return `
      <path d="M15 33 L15 19 L21.5 25 L30 10 L38.5 25 L45 19 L45 33 Z" fill="${GOLD}" stroke="${GOLD_DARK}" stroke-width=".9" stroke-linejoin="round"/>
      <rect x="14" y="32" width="32" height="4.5" rx="1" fill="${color}" stroke="${GOLD_DARK}" stroke-width=".6"/>
      <circle cx="30" cy="9.5" r="2" fill="${color}" stroke="${GOLD_DARK}" stroke-width=".5"/>
      <circle cx="15" cy="18.5" r="1.6" fill="${color}"/><circle cx="45" cy="18.5" r="1.6" fill="${color}"/>
      <circle cx="22" cy="34.3" r="1" fill="${GOLD}"/><circle cx="30" cy="34.3" r="1.2" fill="#f4e9c8"/><circle cx="38" cy="34.3" r="1" fill="${GOLD}"/>
      <path d="M30 18 L30 29 M26.5 22 L33.5 22" stroke="${color}" stroke-width="1.4" stroke-linecap="round"/>
      <text x="9" y="15" font-size="8" fill="${color}" text-anchor="middle">${sym}</text>
      <text x="51" y="15" font-size="8" fill="${color}" text-anchor="middle">${sym}</text>`;
  }
  if (rank === 12) {
    // Reina: diadema de arcos con perlas y una rosa
    return `
      <path d="M14 33 Q14 22 19.5 21 Q22 27 24.8 21 Q27 14 30 13 Q33 14 35.2 21 Q38 27 40.5 21 Q46 22 46 33 Z" fill="${GOLD}" stroke="${GOLD_DARK}" stroke-width=".9" stroke-linejoin="round"/>
      <rect x="13.5" y="32" width="33" height="4" rx="2" fill="${color}" stroke="${GOLD_DARK}" stroke-width=".6"/>
      <circle cx="19.5" cy="20" r="1.7" fill="#f4e9c8" stroke="${GOLD_DARK}" stroke-width=".4"/>
      <circle cx="40.5" cy="20" r="1.7" fill="#f4e9c8" stroke="${GOLD_DARK}" stroke-width=".4"/>
      <circle cx="30" cy="11.5" r="2" fill="#f4e9c8" stroke="${GOLD_DARK}" stroke-width=".4"/>
      <g transform="translate(30 25)">
        <circle r="4.2" fill="${color}"/>
        <path d="M-2.6 -.4 Q0 -3.6 2.6 -.4 Q0 2.8 -2.6 -.4 Z" fill="none" stroke="#f4e9c8" stroke-width=".6"/>
        <circle r="1" fill="#f4e9c8"/>
      </g>
      <text x="9" y="15" font-size="8" fill="${color}" text-anchor="middle">${sym}</text>
      <text x="51" y="15" font-size="8" fill="${color}" text-anchor="middle">${sym}</text>`;
  }
  // Jota: dos espadas cruzadas y una pluma
  return `
    <g stroke-linecap="round">
      <path d="M17 11 L41 35" stroke="${GOLD_DARK}" stroke-width="3.4"/>
      <path d="M17 11 L41 35" stroke="#e9e1cf" stroke-width="2"/>
      <path d="M43 11 L19 35" stroke="${GOLD_DARK}" stroke-width="3.4"/>
      <path d="M43 11 L19 35" stroke="#e9e1cf" stroke-width="2"/>
      <path d="M35.5 34.5 L41.5 28.5 M24.5 34.5 L18.5 28.5" stroke="${GOLD}" stroke-width="2.4"/>
      <circle cx="42.5" cy="36.5" r="2" fill="${color}"/><circle cx="17.5" cy="36.5" r="2" fill="${color}"/>
    </g>
    <path d="M30 6 Q36 12 31 22 Q29 15 30 6 Z" fill="${color}" opacity=".9"/>
    <path d="M30.5 8 Q31.5 14 30.6 20" stroke="#f4e9c8" stroke-width=".5" fill="none"/>
    <text x="9" y="15" font-size="8" fill="${color}" text-anchor="middle">${sym}</text>
    <text x="51" y="15" font-size="8" fill="${color}" text-anchor="middle">${sym}</text>`;
}

function faceSVG(rank, suit) {
  const color = RED[suit] ? INK.red : INK.black;
  const sym = SUIT_SYMBOL[suit];
  const tint = RED[suit] ? '#f7e6dc' : '#ebe5d6';
  const letter = RANK_LABEL[rank];
  const em = emblem(rank, color, sym);
  // Trama de rombos sin <defs> (evita ids repetidos entre cartas)
  let hatch = '';
  for (let x = -90; x < 60; x += 6) hatch += `M${x} 0 L${x + 90} 90 M${x + 90} 0 L${x} 90 `;
  return `
  <svg class="face-art" viewBox="0 0 60 90" preserveAspectRatio="none" aria-hidden="true">
    <rect x="1" y="1" width="58" height="88" rx="3" fill="${tint}" stroke="${GOLD}" stroke-width="1.4"/>
    <path d="${hatch}" stroke="${color}" stroke-width=".25" opacity=".18" />
    <rect x="4" y="4" width="52" height="82" rx="2" fill="none" stroke="${color}" stroke-width=".6"/>
    <g>${em}</g>
    <g transform="rotate(180 30 45)">${em}</g>
    <path d="M4 45 L22 45 M38 45 L56 45" stroke="${GOLD_DARK}" stroke-width=".8"/>
    <circle cx="30" cy="45" r="7.5" fill="#1a0d06" stroke="${GOLD}" stroke-width="1.2"/>
    <text x="30" y="49.3" text-anchor="middle" font-family="Playfair Display, serif" font-weight="900" font-size="11" fill="${GOLD}">${letter}</text>
  </svg>`;
}

function aceHTML(suit) {
  const sym = SUIT_SYMBOL[suit];
  const ornate = suit === 's';
  return `<div class="ace${ornate ? ' ace-ornate' : ''}">
    ${ornate ? `<svg class="ace-ring" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="46" fill="none" stroke="${GOLD}" stroke-width="2"/>
      <circle cx="50" cy="50" r="41" fill="none" stroke="${GOLD}" stroke-width=".8" stroke-dasharray="2 3"/>
      <text x="50" y="12.5" text-anchor="middle" font-size="6.5" letter-spacing="1.5" fill="${GOLD_DARK}" font-family="Oswald, sans-serif">EL SÓTANO</text>
      <text x="50" y="94" text-anchor="middle" font-size="6.5" letter-spacing="1.5" fill="${GOLD_DARK}" font-family="Oswald, sans-serif">· 1927 ·</text>
    </svg>` : ''}
    <span class="ace-sym">${sym}</span>
  </div>`;
}

function pipsHTML(rank, suit) {
  const sym = SUIT_SYMBOL[suit];
  return `<div class="pips">${PIPS[rank]
    .map(([x, y]) => `<span class="pip${y > 50 ? ' flip' : ''}" style="left:${x}%;top:${y}%">${sym}</span>`)
    .join('')}</div>`;
}

export function frontHTML(card) {
  const r = Number(card.r);
  const s = String(card.s);
  if (!RANK_LABEL[r] || !SUIT_SYMBOL[s]) return '';
  const label = esc(RANK_LABEL[r]);
  const sym = SUIT_SYMBOL[s];
  const corner = (pos) => `<div class="corner ${pos}"><span class="rk${r === 10 ? ' ten' : ''}">${label}</span><span class="st">${sym}</span></div>`;
  let center;
  if (r === 14) center = aceHTML(s);
  else if (r >= 11) center = `<div class="figure">${faceSVG(r, s)}</div>`;
  else center = pipsHTML(r, s);
  return `${corner('tl')}${center}${corner('br')}`;
}

export function cardKey(card) {
  return card ? `${card.r}${card.s}` : '';
}

/** Crea una carta. size: xs | sm | md | lg. */
export function createCard(card, { size = 'md', up = false } = {}) {
  const el = document.createElement('div');
  el.className = `card card-${size}`;
  el.innerHTML = `<div class="card-inner"><div class="card-face card-front"></div><div class="card-face card-back">${BACK_SVG}</div></div>`;
  el.dataset.key = '';
  if (card) setCardFront(el, card);
  if (card && up) el.classList.add('up');
  return el;
}

export function setCardFront(el, card) {
  const front = el.querySelector('.card-front');
  const key = cardKey(card);
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  front.className = `card-face card-front ${RED[card.s] ? 'red' : 'black'}${card.r >= 11 && card.r <= 13 ? ' is-face' : ''}`;
  front.innerHTML = frontHTML(card);
  el.setAttribute('aria-label', `${RANK_LABEL[card.r]}${SUIT_SYMBOL[card.s]}`);
}

/** Convierte "Qh Kh Ah" en cartas. */
export function parseCards(str) {
  return String(str)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => {
      const s = t.slice(-1);
      const rs = t.slice(0, -1);
      const r = { T: 10, J: 11, Q: 12, K: 13, A: 14 }[rs] || Number(rs);
      return { r, s };
    });
}

/** Rellena un contenedor con cartas boca arriba (para tutorial y decoración). */
export function renderStatic(container, cards, size = 'sm') {
  container.textContent = '';
  for (const c of cards) container.appendChild(createCard(c, { size, up: true }));
}
