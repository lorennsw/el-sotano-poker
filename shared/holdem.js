// Texas Hold'em sin límite, entre jugadores.
//
//  1. El botón de repartidor rota. A su izquierda, ciega pequeña (5) y ciega grande (10).
//     Mano a mano (2 jugadores), el botón pone la ciega pequeña.
//  2. Dos cartas tapadas para cada uno.
//  3. Preflop: habla primero quien está a la izquierda de la ciega grande
//     (mano a mano, el botón). La ciega grande puede subir aunque todos se limiten a igualar.
//  4. Flop (3 cartas comunes), turn (1) y river (1), cada una con su ronda de apuestas;
//     a partir del flop empieza el primer jugador activo a la izquierda del botón.
//  5. Enseñanza: cada uno forma la mejor mano de 5 con sus 2 cartas y las 5 de la mesa.
//
// Las apuestas (subidas mínimas, all-in corto que no reabre, botes secundarios, devolución de
// lo que nadie igualó) son las mismas que en el póker de 5 cartas, así que se heredan de DrawGame.

import { DrawGame } from './draw.js';
import { shuffledDeck } from './cards.js';
import { evaluate7, describeHole } from './eval5.js';
import { botHoldemAction } from './bots.js';

export const HOLDEM_RULES = { smallBlind: 5, bigBlind: 10, minBet: 10, ante: 10 };
const STREETS = ['preflop', 'flop', 'turn', 'river'];
const STREET_MS = 700; // pausa entre calles para ver salir las cartas
const RUNOUT_MS = 1400; // si ya no hay apuestas posibles (todos all-in), un poco más despacio

export class HoldemGame extends DrawGame {
  constructor(room) {
    super(room, HOLDEM_RULES);
    this.mode = 'holdem';
    this.board = [];
    this.sbPid = null;
    this.bbPid = null;
  }

  inHand(pid) {
    return this.ps.has(pid) && STREETS.includes(this.phase);
  }

  startHand(players) {
    this.hand++;
    this.results = null;
    this.order = players.map((p) => p.id);
    const next = players.find((p) => p.seat > this.buttonSeat) || players[0];
    this.buttonSeat = next.seat;
    this.buttonPid = next.id;
    this.ps = new Map();
    this.pot = 0;
    this.deck = shuffledDeck();
    this.muck = [];
    this.board = [];
    this.note(`— Mano #${this.hand} · reparte ${next.name} —`);
    for (const p of players) {
      this.ps.set(p.id, {
        cards: [], folded: false, allIn: false, bet: 0, total: 0, acted: false, seenSeq: -1,
        drew: null, newIdx: [], lastAction: '', won: 0, show: false, ev: null,
      });
    }
    // Ciegas
    const left = this.leftOfButton();
    const [sb, bb] = this.order.length === 2 ? [this.buttonPid, left[0]] : [left[0], left[1]];
    this.sbPid = sb;
    this.bbPid = bb;
    this.postBlind(sb, this.rules.smallBlind, 'Ciega');
    this.postBlind(bb, this.rules.bigBlind, 'Ciega');
    // Dos cartas a cada uno, empezando a la izquierda del botón
    for (let k = 0; k < 2; k++) for (const pid of left) this.ps.get(pid).cards.push(this.deck.pop());
    // Preflop: la apuesta a igualar es la ciega grande, aunque quien la puso no la cubriera entera
    this.phase = 'preflop';
    this.currentBet = this.rules.bigBlind;
    this.minRaise = this.rules.bigBlind;
    this.fullSeq = 0;
    this.advance(bb);
  }

  postBlind(pid, amount, label) {
    const p = this.room.getPlayer(pid);
    const s = this.ps.get(pid);
    const amt = Math.min(amount, p.chips);
    this.put(pid, amt);
    s.lastAction = `${label} ${amt}`;
  }

  handle(p, msg) {
    if (msg.t !== 'act') return 'Acción no válida en Texas Hold’em.';
    if (!STREETS.includes(this.phase)) return 'No es una ronda de apuestas.';
    if (this.turn !== p.id) return 'No es tu turno.';
    return this.doAct(p.id, msg);
  }

  endBettingRound() {
    this.room.clearGameTimers();
    this.refundUncalled();
    this.turn = null;
    if (this.phase === 'river') {
      this.showdown();
      return;
    }
    const runout = this.active().length <= 1;
    this.deadline = null;
    this.room.setTimer('g:street', runout ? RUNOUT_MS : STREET_MS, () => this.nextStreet());
    this.room.emit();
  }

  nextStreet() {
    const next = STREETS[STREETS.indexOf(this.phase) + 1];
    this.deck.pop(); // carta quemada
    const n = next === 'flop' ? 3 : 1;
    for (let i = 0; i < n; i++) this.board.push(this.deck.pop());
    const names = { flop: 'Flop', turn: 'Turn', river: 'River' };
    this.note(`${names[next]}: ${this.board.map((c) => `${{ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[c.r] || c.r}${{ s: '♠', h: '♥', d: '♦', c: '♣' }[c.s]}`).join(' ')}`);
    this.startBetting(next);
  }

  evalFor(pid) {
    const s = this.ps.get(pid);
    if (!s.cards.length) return null;
    const all = [...s.cards, ...this.board];
    return all.length >= 5 ? evaluate7(all) : describeHole(s.cards);
  }

  botMove(pid) {
    if (this.turn !== pid) return;
    const s = this.ps.get(pid);
    const p = this.room.getPlayer(pid);
    if (!s || !p) return;
    const o = this.options(pid);
    const choice = botHoldemAction({
      hole: s.cards,
      board: this.board,
      toCall: o.toCall,
      pot: this.pot,
      chips: p.chips,
      bet: s.bet,
      currentBet: this.currentBet,
      minTo: o.minTo,
      maxTo: o.maxTo,
      canRaise: o.canRaise,
      bigBlind: this.rules.bigBlind,
    });
    let err = this.doAct(pid, choice);
    if (err) err = this.doAct(pid, { a: o.canCheck ? 'check' : 'call' });
    if (err) this.doAct(pid, { a: 'fold' });
    this.room.emit();
  }

  view(pid) {
    const v = super.view(pid);
    v.board = this.board;
    v.sb = this.sbPid;
    v.bb = this.bbPid;
    // Las 5 cartas con las que gana cada uno, para resaltarlas en la enseñanza
    if (this.phase === 'showdown' && this.results && !this.results.byFold) {
      v.best = {};
      for (const [id, s] of this.ps) if (s.show && s.ev && s.ev.cards) v.best[id] = s.ev.cards;
    }
    return v;
  }
}
