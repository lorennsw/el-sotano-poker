import { test } from 'node:test';
import assert from 'node:assert/strict';

import { newDeck } from '../shared/cards.js';
import { evaluate5, evaluate7, describeHole, CAT5 } from '../shared/eval5.js';
import { HoldemGame } from '../shared/holdem.js';
import { computePots, DrawGame } from '../shared/draw.js';
import { Room } from '../shared/room.js';
import { drawPlan, preflopStrength } from '../shared/bots.js';

const C = (str) =>
  str.split(' ').map((t) => {
    const s = t.slice(-1);
    const rs = t.slice(0, -1);
    const r = { J: 11, Q: 12, K: 13, A: 14, T: 10 }[rs] || Number(rs);
    return { r, s };
  });

// ------------------------------------------------------------ evaluadores

test('5 cartas: frecuencias exactas de las 2.598.960 manos y 7.462 clases', () => {
  const d = newDeck();
  const counts = new Array(9).fill(0);
  const scores = new Set();
  const h = new Array(5);
  for (let a = 0; a < 52; a++) {
    h[0] = d[a];
    for (let b = a + 1; b < 52; b++) {
      h[1] = d[b];
      for (let c = b + 1; c < 52; c++) {
        h[2] = d[c];
        for (let e = c + 1; e < 52; e++) {
          h[3] = d[e];
          for (let f = e + 1; f < 52; f++) {
            h[4] = d[f];
            const ev = evaluate5(h);
            counts[ev.cat]++;
            scores.add(ev.score);
          }
        }
      }
    }
  }
  assert.deepEqual(counts, [1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 40]);
  assert.equal(scores.size, 7462);
});

test('5 cartas: orden y descripciones', () => {
  const v = (s) => evaluate5(C(s)).score;
  assert.ok(v('Ah 2c 3d 4s 5h') < v('2c 3d 4s 5h 6h'), 'la rueda es la escalera más baja');
  assert.ok(v('Th Jc Qd Ks Ah') > v('9h Tc Jd Qs Kh'));
  assert.ok(v('2h 4h 6h 8h Th') > v('Ah Kc Qd Js Th'), 'color gana a escalera');
  assert.ok(v('Kh Kc Kd 2s 2h') > v('Qh Qc Qd As Ah'), 'full: manda el trío');
  assert.ok(v('Ah Ac 3d 3s 2h') > v('Kh Kc Qd Qs Ah'), 'doble pareja: manda la mayor');
  assert.ok(v('Ah Ac 3d 3s 5h') > v('As Ad 3c 3h 4h'), 'doble pareja: kicker');
  assert.ok(v('Ah Kh Qh Jh 9h') > v('Ac Kc Qc Jc 8c'), 'color: quinta carta');
  assert.equal(v('Ah Kh Qh Jh 9h'), v('As Ks Qs Js 9s'));
  assert.equal(evaluate5(C('Th Jh Qh Kh Ah')).name, 'Escalera real');
  assert.equal(evaluate5(C('Kh Kc Kd 2s 2h')).desc, 'Full de Reyes y Doses');
  assert.equal(evaluate5(C('Ah 2h 3h 4h 5h')).desc, 'Escalera de color al 5');
  assert.equal(evaluate5(C('Qh Qc 3d 3s 9h')).desc, 'Doble pareja: Reinas y Treses');
  assert.equal(evaluate5(C('Jh Qc Kd As 2h')).cat, CAT5.HIGH, 'J-Q-K-A-2 no es escalera');
});

// -------------------------------------------------------- pagos 3 cartas

// --------------------------------------------------------- botes 5 cartas

test('botes secundarios', () => {
  // A all-in 50, B all-in 200, C cubre 200, D se retiró tras poner 30
  const pots = computePots([
    { pid: 'A', amount: 50, folded: false },
    { pid: 'B', amount: 200, folded: false },
    { pid: 'C', amount: 200, folded: false },
    { pid: 'D', amount: 30, folded: true },
  ]);
  assert.deepEqual(pots, [
    { amount: 180, eligible: ['A', 'B', 'C'] },
    { amount: 300, eligible: ['B', 'C'] },
  ]);
  const total = pots.reduce((a, p) => a + p.amount, 0);
  assert.equal(total, 480);
});

test('plan de descarte de los bots respeta las reglas', () => {
  assert.deepEqual(drawPlan(C('Ah 7c 4d 9s 2h')).discard.length, 4);
  assert.deepEqual(drawPlan(C('Kh 7c 4d 9s 2h')).discard.length, 3);
  assert.deepEqual(drawPlan(C('Kh Kc 4d 9s 2h')).discard.length, 3);
  assert.deepEqual(drawPlan(C('5h 6c 7d 8s Kh')).discard, [4]);
  assert.deepEqual(drawPlan(C('2h 6h 9h Jh Kc')).discard, [4]);
  assert.deepEqual(drawPlan(C('2h 3c 4d 5s 6h')).discard, []);
});

// ------------------------------------------------- simulación con relojes falsos

class TestRoom extends Room {
  constructor(opts) {
    super(opts);
    this.clock = 0;
    this.queue = new Map();
  }
  now() {
    return this.clock;
  }
  setTimer(key, ms, fn) {
    this.queue.set(key, { at: this.clock + ms, fn });
    this.timers.set(key, true);
  }
  clearTimer(key) {
    this.queue.delete(key);
    this.timers.delete(key);
  }
  step() {
    let best = null;
    for (const [k, t] of this.queue) if (!best || t.at < best[1].at) best = [k, t];
    if (!best) return false;
    this.queue.delete(best[0]);
    this.timers.delete(best[0]);
    this.clock = Math.max(this.clock, best[1].at);
    best[1].fn();
    return true;
  }
}

test('5 cartas: 400 manos entre bots sin errores y sin crear ni perder fichas', () => {
  const room = new TestRoom({ mode: 'draw' });
  for (let i = 0; i < 6; i++) room.addBot();
  // Pilas desiguales para provocar all-ins y botes secundarios
  room.players.forEach((p, i) => (p.chips = [40, 75, 300, 1000, 15, 520][i]));
  let checked = 0;
  let before = null;
  const origStart = DrawGame.prototype.startHand;
  const sum = () => room.players.reduce((a, p) => a + p.chips, 0);
  DrawGame.prototype.startHand = function (players) {
    before = sum();
    origStart.call(this, players);
    // cartas únicas
    const seen = new Set();
    for (const s of this.ps.values()) for (const c of s.cards) {
      const k = c.r + c.s;
      assert.ok(!seen.has(k), 'carta repetida');
      seen.add(k);
    }
  };
  try {
    room.startGame();
    let guard = 0;
    while (room.game.hand < 400 && guard++ < 200000) {
      const g = room.game;
      const wasShow = g.phase === 'showdown';
      room.step();
      if (!wasShow && g.phase === 'showdown') {
        assert.equal(sum(), before, `fichas conservadas en la mano ${g.hand}`);
        // cartas únicas tras el descarte
        const seen = new Set();
        for (const s of g.ps.values()) for (const c of s.cards) {
          const k = c.r + c.s;
          assert.ok(!seen.has(k), 'carta repetida tras descarte');
          seen.add(k);
        }
        for (const p of room.players) assert.ok(p.chips >= 0);
        checked++;
      }
    }
    assert.ok(checked >= 399, `manos comprobadas: ${checked}`);
  } finally {
    DrawGame.prototype.startHand = origStart;
  }
});

test('5 cartas: all-in corto no reabre la subida', () => {
  const room = new TestRoom({ mode: 'draw' });
  const a = room.addHuman('Ana').player;
  const b = room.addHuman('Beto').player;
  const c = room.addHuman('Cris').player;
  a.chips = 1000;
  b.chips = 1000;
  c.chips = 35; // tras el ante (10) le quedan 25
  room.startGame();
  const g = room.game;
  // botón = Ana (asiento 0) → habla primero Beto, luego Cris, luego Ana
  assert.equal(g.buttonPid, a.id);
  assert.equal(g.turn, b.id);
  assert.equal(room.handle(b.id, { t: 'act', a: 'raise', to: 20 }), null);
  assert.equal(g.turn, c.id);
  assert.equal(room.handle(c.id, { t: 'act', a: 'raise', to: 25 }), null); // all-in corto (+5)
  assert.equal(g.turn, a.id);
  // Ana no ha actuado: puede subir (mínimo 25 + 20)
  assert.equal(g.options(a.id).minTo, 45);
  assert.equal(room.handle(a.id, { t: 'act', a: 'call' }), null);
  // Beto ya actuó y el all-in fue corto: sólo puede igualar o retirarse
  assert.equal(g.turn, b.id);
  assert.equal(g.options(b.id).canRaise, false);
  assert.notEqual(room.handle(b.id, { t: 'act', a: 'raise', to: 100 }), null);
  assert.equal(room.handle(b.id, { t: 'act', a: 'call' }), null);
  assert.equal(g.phase, 'draw');
  assert.equal(g.pot, 30 + 25 * 3);
});

test('5 cartas: descarte de 4 sólo con As', () => {
  const room = new TestRoom({ mode: 'draw' });
  const a = room.addHuman('Ana').player;
  const b = room.addHuman('Beto').player;
  room.startGame();
  const g = room.game;
  // Beto habla primero (Ana es botón); pasan los dos
  room.handle(b.id, { t: 'act', a: 'check' });
  room.handle(a.id, { t: 'act', a: 'check' });
  assert.equal(g.phase, 'draw');
  assert.equal(g.turn, b.id);
  const s = g.ps.get(b.id);
  s.cards = C('Ah 2c 3d 4s 6h');
  assert.match(room.handle(b.id, { t: 'draw', idx: [0, 1, 2, 3] }), /As/);
  assert.equal(room.handle(b.id, { t: 'draw', idx: [1, 2, 3, 4] }), null);
  assert.equal(g.turn, a.id);
  assert.notEqual(room.handle(a.id, { t: 'draw', idx: [0, 1, 2, 3, 4] }), null);
  assert.notEqual(room.handle(a.id, { t: 'draw', idx: [0, 0] }), null);
  assert.equal(room.handle(a.id, { t: 'draw', idx: [] }), null);
  assert.equal(g.phase, 'bet2');
});

// ------------------------------------------------------------- Texas Hold'em

test("Hold'em: la mejor mano de 5 entre 7 cartas", () => {
  const d = (s) => evaluate7(C(s)).desc;
  assert.equal(d('Ah Kh 2c 7h 9h Qh 3d'), 'Color al As', 'elige el color aunque haya 6 corazones');
  assert.equal(d('5c 4d As 2h 3s Kd Kc'), 'Escalera al 5', 'escalera gana a pareja');
  assert.equal(d('9c 9d 9s 4h 4s 4c 2d'), 'Full de Nueves y Cuatros', 'con dos tríos, full con el mayor');
  assert.equal(d('Ac Ad Kh Kd Qs Qc 2h'), 'Doble pareja: Ases y Reyes', 'tres parejas: cuentan las dos mayores');
  assert.equal(d('Th Jh Qh Kh Ah 2c 3d'), 'Escalera real');
  assert.equal(d('6s 7s 8s 9s Ts Js 2d'), 'Escalera de color a la Jota');
  // Kicker: la quinta carta decide
  const a = evaluate7(C('Ah Kc 7d 7s 2h 3c 9d'));
  const b = evaluate7(C('Ad Qc 7c 7h 2s 3d 9h'));
  assert.ok(a.score > b.score, 'misma pareja: gana el kicker');
  // La mesa juega: empate exacto
  const t1 = evaluate7(C('2c 3d Ah Kh Qh Jh Th'));
  const t2 = evaluate7(C('4s 5s Ah Kh Qh Jh Th'));
  assert.equal(t1.score, t2.score);
  assert.equal(evaluate7(C('Ah Kh 2c 7h 9h Qh 3d')).cards.length, 5);
});

test("Hold'em: descripción de las cartas propias y fuerza preflop", () => {
  assert.equal(describeHole(C('Ah Kh')).desc, 'A-K del mismo palo');
  assert.equal(describeHole(C('7c 7d')).desc, 'Pareja de Sietes');
  assert.equal(describeHole(C('2c 9d')).desc, '9-2');
  assert.ok(preflopStrength(C('Ac Ad')) > preflopStrength(C('Ks Kh')));
  assert.ok(preflopStrength(C('Ah Kh')) > preflopStrength(C('Ah Kd')));
  assert.ok(preflopStrength(C('Kh Qh')) > preflopStrength(C('7c 2d')));
});

function holdemRoom(names, chips) {
  const room = new TestRoom({ mode: 'holdem' });
  const ps = names.map((n) => room.addHuman(n).player);
  if (chips) ps.forEach((p, i) => (p.chips = chips[i]));
  room.startGame();
  return { room, g: room.game, ps };
}

test("Hold'em: ciegas, orden de habla y opción de la ciega grande (3 jugadores)", () => {
  const { room, g, ps } = holdemRoom(['Ana', 'Beto', 'Cris']);
  const [a, b, c] = ps;
  assert.ok(g instanceof HoldemGame);
  assert.equal(g.buttonPid, a.id);
  assert.equal(g.sbPid, b.id, 'ciega pequeña a la izquierda del botón');
  assert.equal(g.bbPid, c.id, 'ciega grande después');
  assert.equal(g.ps.get(b.id).bet, 5);
  assert.equal(g.ps.get(c.id).bet, 10);
  assert.equal(g.pot, 15);
  assert.equal(g.phase, 'preflop');
  assert.equal(g.turn, a.id, 'preflop habla primero el de la izquierda de la grande');
  for (const s of g.ps.values()) assert.equal(s.cards.length, 2);
  assert.notEqual(room.handle(a.id, { t: 'act', a: 'check' }), null, 'no se puede pasar frente a la ciega');
  assert.equal(room.handle(a.id, { t: 'act', a: 'call' }), null);
  assert.equal(room.handle(b.id, { t: 'act', a: 'call' }), null);
  assert.equal(g.turn, c.id, 'la ciega grande tiene su opción');
  assert.equal(g.options(c.id).canCheck, true);
  assert.equal(g.options(c.id).canRaise, true);
  assert.equal(room.handle(c.id, { t: 'act', a: 'check' }), null);
  assert.equal(g.turn, null, 'pausa antes del flop');
  room.step();
  assert.equal(g.phase, 'flop');
  assert.equal(g.board.length, 3);
  assert.equal(g.turn, b.id, 'tras el flop habla primero la ciega pequeña');
  assert.equal(g.pot, 30);
});

test("Hold'em: mano a mano el botón pone la pequeña y habla primero antes del flop", () => {
  const { room, g, ps } = holdemRoom(['Ana', 'Beto']);
  const [a, b] = ps;
  assert.equal(g.buttonPid, a.id);
  assert.equal(g.sbPid, a.id);
  assert.equal(g.bbPid, b.id);
  assert.equal(g.turn, a.id, 'preflop: el botón (pequeña) primero');
  room.handle(a.id, { t: 'act', a: 'call' });
  room.handle(b.id, { t: 'act', a: 'check' });
  room.step();
  assert.equal(g.phase, 'flop');
  assert.equal(g.turn, b.id, 'después del flop: la grande primero');
});

test("Hold'em: si todos se retiran, la ciega grande cobra sin enseñar", () => {
  const { room, g, ps } = holdemRoom(['Ana', 'Beto', 'Cris']);
  const [a, b, c] = ps;
  room.handle(a.id, { t: 'act', a: 'fold' });
  room.handle(b.id, { t: 'act', a: 'fold' });
  assert.equal(g.phase, 'showdown');
  assert.equal(g.results.byFold, true);
  assert.equal(c.chips, 1005, 'recupera su ciega y gana la pequeña');
  assert.equal(b.chips, 995);
});

test("Hold'em: all-in preflop reparte la mesa entera y paga el bote secundario", () => {
  const { room, g, ps } = holdemRoom(['Ana', 'Beto', 'Cris'], [1000, 1000, 100]);
  const [a, b, c] = ps;
  room.handle(a.id, { t: 'act', a: 'raise', to: 1000 }); // all-in
  room.handle(b.id, { t: 'act', a: 'call' }); // all-in
  room.handle(c.id, { t: 'act', a: 'call' }); // all-in por 100
  let guard = 0;
  while (g.phase !== 'showdown' && guard++ < 20) room.step();
  assert.equal(g.phase, 'showdown');
  assert.equal(g.board.length, 5);
  assert.equal(a.chips + b.chips + c.chips, 2100, 'no se crean ni pierden fichas');
  const total = g.results.pots.reduce((x, p) => x + p.amount, 0);
  assert.equal(total, 2100);
  assert.equal(g.results.pots[0].amount, 300, 'bote principal: 100 de cada uno');
  const seen = new Set();
  for (const card of [...g.board, ...[...g.ps.values()].flatMap((s) => s.cards)]) {
    const k = card.r + card.s;
    assert.ok(!seen.has(k), 'carta repetida');
    seen.add(k);
  }
});

test("Hold'em: 400 manos entre bots sin errores, sin crear fichas y sin repetir cartas", () => {
  const room = new TestRoom({ mode: 'holdem' });
  for (let i = 0; i < 6; i++) room.addBot();
  room.players.forEach((p, i) => (p.chips = [40, 75, 300, 1000, 12, 520][i]));
  let before = null;
  let checked = 0;
  const orig = HoldemGame.prototype.startHand;
  const sum = () => room.players.reduce((a, p) => a + p.chips, 0);
  HoldemGame.prototype.startHand = function (players) {
    before = sum();
    orig.call(this, players);
  };
  try {
    room.startGame();
    let guard = 0;
    while (room.game.hand < 400 && guard++ < 300000) {
      const g = room.game;
      const wasShow = g.phase === 'showdown';
      room.step();
      if (!wasShow && g.phase === 'showdown') {
        assert.equal(sum(), before, `fichas conservadas en la mano ${g.hand}`);
        const seen = new Set();
        for (const card of [...g.board, ...[...g.ps.values()].flatMap((s) => s.cards)]) {
          const k = card.r + card.s;
          assert.ok(!seen.has(k), 'carta repetida');
          seen.add(k);
        }
        if (!g.results.byFold) assert.equal(g.board.length, 5, 'en la enseñanza la mesa está completa');
        for (const p of room.players) assert.ok(p.chips >= 0);
        checked++;
      }
    }
    assert.ok(checked >= 399, `manos comprobadas: ${checked}`);
  } finally {
    HoldemGame.prototype.startHand = orig;
  }
});
