// Póker de 3 Cartas (Three Card Poker), reglas de casino.
//
// Cada jugador juega contra la CASA (el crupier), no contra los demás.
//  1. Apuestas: Ante y/o Pair Plus.
//  2. Se reparten 3 cartas a cada jugador y 3 al crupier (boca abajo).
//  3. Quien puso Ante decide: JUGAR (pone una apuesta Play igual al Ante) o RETIRARSE
//     (pierde Ante y Pair Plus).
//  4. El crupier muestra. Califica con Reina alta o mejor.
//       - No califica: Ante paga 1:1 y Play se devuelve (empate).
//       - Califica y ganas: Ante y Play pagan 1:1. Pierdes: pierdes ambas. Empate: se devuelven.
//  5. Bono Ante (si juegas, gane quien gane): Escalera 1:1, Trío 4:1, Escalera de color 5:1.
//  6. Pair Plus paga según tu mano, sin importar la del crupier: Pareja 1:1, Color 4:1,
//     Escalera 6:1, Trío 30:1, Escalera de color 40:1.

import { shuffledDeck } from './cards.js';
import { evaluate3, dealerQualifies, ANTE_BONUS, PAIR_PLUS } from './eval3.js';
import { botThreeBet, botThreeDecide, rand } from './bots.js';

export const THREE_LIMITS = { anteMin: 5, anteMax: 500, ppMin: 5, ppMax: 500 };
const BET_WAIT_MS = 15000; // tras la primera apuesta, cuánto esperamos al resto
const DECIDE_MS = 25000;
const SHOWDOWN_MS = 8000;

export class ThreeCardGame {
  constructor(room) {
    this.room = room;
    this.mode = 'three';
    this.round = 0;
    this.phase = 'betting';
    this.seats = new Map();
    this.dealer = null;
    this.dealerEval = null;
    this.deadline = null;
    this.stopRequested = false;
  }

  start() {
    this.newRound();
  }

  destroy() {
    this.room.clearGameTimers();
  }

  st(pid) {
    let s = this.seats.get(pid);
    if (!s) {
      s = { ante: 0, pp: 0, play: 0, ready: false, inRound: false, cards: null, ev: null, decided: false, folded: false, result: null };
      this.seats.set(pid, s);
    }
    return s;
  }

  newRound() {
    this.room.clearGameTimers();
    if (this.stopRequested) {
      this.room.endGame();
      return;
    }
    this.round++;
    this.phase = 'betting';
    this.dealer = null;
    this.dealerEval = null;
    this.deadline = null;
    this.seats = new Map();
    for (const p of this.room.players) {
      this.st(p.id);
      if (p.isBot) this.scheduleBotBet(p);
    }
    this.room.emit();
  }

  scheduleBotBet(p) {
    this.room.setTimer(`g:botbet:${p.id}`, rand(700, 2200), () => {
      if (this.phase !== 'betting' || !this.room.getPlayer(p.id)) return;
      const s = this.st(p.id);
      if (s.ready) return;
      if (p.chips < THREE_LIMITS.anteMin * 2) p.chips = this.room.startChips; // los bots se recargan solos
      const { ante, pp } = botThreeBet(p.chips);
      this.placeBet(p, ante, pp);
      this.room.emit();
    });
  }

  requestStop() {
    this.stopRequested = true;
    // Si nadie ha apostado aún, podemos cerrar ya.
    if (this.phase === 'betting' && ![...this.seats.values()].some((s) => s.ready && s.inRound)) {
      this.room.endGame();
      return;
    }
    this.room.emit();
  }

  /** ¿Puede este jugador recargar fichas ahora? (no con apuestas en juego) */
  canRebuy(pid) {
    const s = this.seats.get(pid);
    return !s || !s.inRound || this.phase === 'showdown';
  }

  handle(p, msg) {
    switch (msg.t) {
      case 'bet':
        return this.onBet(p, msg);
      case 'decide':
        return this.onDecide(p, msg);
      default:
        return 'Acción no válida en Póker de 3 Cartas.';
    }
  }

  validateBet(p, ante, pp) {
    const L = THREE_LIMITS;
    if (!Number.isInteger(ante) || !Number.isInteger(pp)) return 'Apuesta no válida.';
    if (ante !== 0 && (ante < L.anteMin || ante > L.anteMax)) return `El Ante va de ${L.anteMin} a ${L.anteMax}.`;
    if (pp !== 0 && (pp < L.ppMin || pp > L.ppMax)) return `El Pair Plus va de ${L.ppMin} a ${L.ppMax}.`;
    if (ante === 0 && pp === 0) return 'Pon al menos una apuesta (Ante o Pair Plus).';
    if (2 * ante + pp > p.chips) {
      return ante > 0
        ? 'No tienes fichas suficientes: necesitas reservar otra vez el Ante para la apuesta Play.'
        : 'No tienes fichas suficientes.';
    }
    return null;
  }

  onBet(p, msg) {
    if (this.phase !== 'betting') return 'Las apuestas están cerradas: espera a la próxima ronda.';
    const s = this.st(p.id);
    if (s.ready) return 'Ya has apostado en esta ronda.';
    const ante = msg.ante | 0;
    const pp = msg.pp | 0;
    if (msg.ante !== ante || msg.pp !== pp) return 'Apuesta no válida.';
    const err = this.validateBet(p, ante, pp);
    if (err) return err;
    this.placeBet(p, ante, pp);
    this.checkBettingDone();
    return null;
  }

  placeBet(p, ante, pp) {
    if (this.validateBet(p, ante, pp)) return;
    const s = this.st(p.id);
    p.chips -= ante + pp;
    s.ante = ante;
    s.pp = pp;
    s.ready = true;
    s.inRound = true;
    if (p.isBot) this.checkBettingDone();
  }

  checkBettingDone() {
    if (this.phase !== 'betting') return;
    const humans = this.room.players.filter((p) => !p.isBot && p.connected);
    const readyHumans = humans.filter((p) => this.st(p.id).ready);
    if (readyHumans.length === 0) return; // la mesa no arranca sola sin ningún humano
    const botsPending = this.room.players.some((p) => p.isBot && !this.st(p.id).ready);
    if (readyHumans.length === humans.length && !botsPending) {
      this.deal();
      return;
    }
    if (readyHumans.length === humans.length) {
      // Sólo faltan bots: les damos un instante y repartimos.
      if (!this.room.hasTimer('g:betwait') || this.deadline - this.room.now() > 2500) {
        this.deadline = this.room.now() + 2500;
        this.room.setTimer('g:betwait', 2500, () => this.deal());
      }
      return;
    }
    if (!this.room.hasTimer('g:betwait')) {
      this.deadline = this.room.now() + BET_WAIT_MS;
      this.room.setTimer('g:betwait', BET_WAIT_MS, () => this.deal());
    }
  }

  deal() {
    if (this.phase !== 'betting') return;
    this.room.clearGameTimers();
    const players = this.room.players.filter((p) => this.st(p.id).inRound);
    if (players.length === 0) {
      this.newRound();
      return;
    }
    const deck = shuffledDeck();
    for (const p of players) {
      const s = this.st(p.id);
      s.cards = [deck.pop(), deck.pop(), deck.pop()];
      s.ev = evaluate3(s.cards);
      if (s.ante === 0) s.decided = true; // sólo Pair Plus: no hay decisión
    }
    this.dealer = [deck.pop(), deck.pop(), deck.pop()];
    this.dealerEval = evaluate3(this.dealer);
    this.phase = 'deciding';
    this.deadline = this.room.now() + DECIDE_MS;
    this.room.setTimer('g:decide', DECIDE_MS, () => this.autoFoldPending());
    for (const p of players) {
      const s = this.st(p.id);
      if (p.isBot && !s.decided) {
        this.room.setTimer(`g:botdec:${p.id}`, rand(1200, 3000), () => {
          if (this.phase !== 'deciding' || s.decided) return;
          this.decide(p, botThreeDecide(s.ev));
          this.room.emit();
        });
      }
    }
    if (!this.checkDecisionsDone()) this.room.emit();
  }

  onDecide(p, msg) {
    if (this.phase !== 'deciding') return 'No es momento de decidir.';
    const s = this.seats.get(p.id);
    if (!s || !s.inRound || s.ante === 0) return 'No tienes una apuesta Ante en esta mano.';
    if (s.decided) return 'Ya has decidido.';
    this.decide(p, !!msg.play);
    return null;
  }

  decide(p, play) {
    const s = this.st(p.id);
    if (s.decided) return;
    if (play) {
      p.chips -= s.ante; // siempre hay fichas: se reservó al apostar
      s.play = s.ante;
    } else {
      s.folded = true;
    }
    s.decided = true;
    this.checkDecisionsDone();
  }

  autoFoldPending() {
    if (this.phase !== 'deciding') return;
    for (const p of this.room.players) {
      const s = this.seats.get(p.id);
      if (s && s.inRound && !s.decided) {
        s.folded = true;
        s.decided = true;
        this.room.log(`${p.name} no decidió a tiempo y se retira.`);
      }
    }
    this.checkDecisionsDone();
  }

  checkDecisionsDone() {
    if (this.phase !== 'deciding') return false;
    for (const p of this.room.players) {
      const s = this.seats.get(p.id);
      if (s && s.inRound && !s.decided) return false;
    }
    this.showdown();
    return true;
  }

  showdown() {
    this.room.clearGameTimers();
    this.phase = 'showdown';
    const dq = dealerQualifies(this.dealerEval);
    for (const p of this.room.players) {
      const s = this.seats.get(p.id);
      if (!s || !s.inRound) continue;
      s.result = settleThree(s, this.dealerEval, dq);
      p.chips += s.result.back;
      if (s.result.net >= 200) this.room.log(`🔥 ${p.name} gana ${s.result.net} con ${s.ev.desc}.`);
    }
    this.deadline = this.room.now() + SHOWDOWN_MS;
    this.room.setTimer('g:next', SHOWDOWN_MS, () => this.newRound());
    this.room.emit();
  }

  onPlayerJoined(p) {
    this.st(p.id);
    if (p.isBot && this.phase === 'betting') this.scheduleBotBet(p);
  }

  onPlayerLeft(p) {
    const s = this.seats.get(p.id);
    if (s && s.inRound && this.phase === 'deciding' && !s.decided) {
      s.folded = true;
      s.decided = true;
    }
    if (this.phase === 'betting') this.checkBettingDone();
    else if (this.phase === 'deciding') this.checkDecisionsDone();
  }

  onConnectionChange() {
    if (this.phase === 'betting') this.checkBettingDone();
  }

  view(pid) {
    const showAll = this.phase === 'showdown';
    const dealt = this.phase !== 'betting';
    const seats = this.room.players.map((p) => {
      const s = this.seats.get(p.id) || {};
      const mine = p.id === pid;
      const visible = s.cards && (mine || (showAll && !s.folded));
      return {
        id: p.id,
        ante: s.ante || 0,
        pp: s.pp || 0,
        play: s.play || 0,
        ready: !!s.ready,
        inRound: !!s.inRound,
        decided: !!s.decided,
        folded: !!s.folded,
        cardCount: s.cards ? 3 : 0,
        cards: visible ? s.cards : null,
        hand: visible ? { cat: s.ev.cat, desc: s.ev.desc, name: s.ev.name } : null,
        result: showAll && s.result ? { net: s.result.net, lines: s.result.lines } : null,
      };
    });
    return {
      mode: 'three',
      round: this.round,
      phase: this.phase,
      deadline: this.deadline,
      stopRequested: this.stopRequested,
      limits: THREE_LIMITS,
      dealer: {
        cards: dealt ? (showAll ? this.dealer : [null, null, null]) : [],
        hand: showAll ? { cat: this.dealerEval.cat, desc: this.dealerEval.desc, name: this.dealerEval.name } : null,
        qualifies: showAll ? dealerQualifies(this.dealerEval) : null,
      },
      seats,
    };
  }
}

/**
 * Liquida la mano de un jugador contra el crupier.
 * Devuelve { back, net, lines } — back = fichas que vuelven al jugador (apuesta + ganancia),
 * net = resultado neto de la mano, lines = desglose legible.
 */
export function settleThree(s, dealerEval, dq) {
  const lines = [];
  let back = 0;
  const staked = s.ante + s.pp + s.play;
  if (s.ante > 0 && s.folded) {
    lines.push({ label: 'Ante (te retiras)', amount: -s.ante });
    if (s.pp > 0) lines.push({ label: 'Pair Plus (te retiras)', amount: -s.pp });
    return { back: 0, net: -staked, lines };
  }
  if (s.ante > 0) {
    const bonus = ANTE_BONUS[s.ev.cat] || 0;
    if (bonus) {
      back += s.ante * bonus;
      lines.push({ label: `Bono Ante · ${s.ev.name} ${bonus}:1`, amount: s.ante * bonus });
    }
    if (!dq) {
      back += s.ante * 2 + s.play;
      lines.push({ label: 'Ante · el crupier no califica', amount: s.ante });
      lines.push({ label: 'Play · se devuelve', amount: 0 });
    } else {
      const cmp = Math.sign(s.ev.score - dealerEval.score);
      if (cmp > 0) {
        back += s.ante * 2 + s.play * 2;
        lines.push({ label: 'Ante · ganas al crupier', amount: s.ante });
        lines.push({ label: 'Play · ganas al crupier', amount: s.play });
      } else if (cmp < 0) {
        lines.push({ label: 'Ante · gana el crupier', amount: -s.ante });
        lines.push({ label: 'Play · gana el crupier', amount: -s.play });
      } else {
        back += s.ante + s.play;
        lines.push({ label: 'Ante · empate', amount: 0 });
        lines.push({ label: 'Play · empate', amount: 0 });
      }
    }
  }
  if (s.pp > 0) {
    const mult = PAIR_PLUS[s.ev.cat] || 0;
    if (mult) {
      back += s.pp + s.pp * mult;
      lines.push({ label: `Pair Plus · ${s.ev.name} ${mult}:1`, amount: s.pp * mult });
    } else {
      lines.push({ label: 'Pair Plus · sin pareja', amount: -s.pp });
    }
  }
  return { back, net: back - staked, lines };
}
