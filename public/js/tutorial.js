// Escuela de El Sótano: tutorial por pasos de los dos juegos, ranking de manos y juego online.

import { parseCards, renderStatic } from './cards-ui.js';

const hand = (cards, caption = '', size = 'sm') =>
  `<figure class="tut-hand"><div class="tut-cards" data-cards="${cards}" data-size="${size}"></div>${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;

const practice = (mode, label) =>
  `<div class="tut-cta"><button class="btn btn-gold" data-practice="${mode}">${label}</button></div>`;

const TUTORIAL = {
  holdem: {
    label: 'Texas Hold’em',
    slides: [
      {
        h: 'El rey de los pókers',
        body: `
          <p class="lead">En el <b>Texas Hold’em</b> juegas contra los demás jugadores. Cada uno recibe <b>2 cartas tapadas</b> y en el centro salen <b>5 cartas comunes</b> que comparte toda la mesa.</p>
          <p>Gana quien forme la mejor mano de 5 cartas combinando sus 2 cartas con las 5 de la mesa: puedes usar las dos tuyas, solo una o ninguna. O gana el último que quede si los demás se retiran.</p>
          <div class="tut-row">${hand('As Kh', 'Tus cartas')}<div class="vs">+</div>${hand('Qd Jc Ts 4h 2s', 'La mesa')}</div>
          <p class="tip">Con esas 7 cartas tu mano es <b>escalera al As</b>: A-K tuyos y Q-J-10 de la mesa.</p>`,
      },
      {
        h: 'El botón y las ciegas',
        body: `
          <ul class="tut-list">
            <li>El botón <span class="dealer-chip">D</span> marca quién reparte y rota una silla cada mano.</li>
            <li>A su izquierda, la <b>ciega pequeña</b> (<b>SB</b>) pone 5 fichas obligatorias, y la siguiente, la <b>ciega grande</b> (<b>BB</b>), pone 10.</li>
            <li>Las ciegas hacen que siempre haya algo que ganar. Como el botón rota, todos las pagan por turnos.</li>
            <li>Mano a mano (2 jugadores), el botón pone la ciega pequeña.</li>
          </ul>`,
      },
      {
        h: 'Preflop: tus dos cartas',
        body: `
          <p>Con tus 2 cartas en la mano empieza la primera ronda de apuestas. Habla primero el jugador a la <b>izquierda de la ciega grande</b>, y cada uno puede:</p>
          <table class="tut-table">
            <tr><td><b>No ir</b></td><td>Te retiras sin poner nada más.</td></tr>
            <tr><td><b>Igualar</b></td><td>Pones lo mismo que la ciega grande (o que la última subida).</td></tr>
            <tr><td><b>Subir</b></td><td>Aumentas la apuesta: al menos el doble de la ciega grande la primera vez.</td></tr>
          </table>
          <p class="small">Si todos igualan, la ciega grande puede <b>pasar</b> o todavía <b>subir</b>: es su "opción".</p>`,
      },
      {
        h: 'Flop, turn y river',
        body: `
          <p>Después salen las cartas comunes, en tres tandas. Tras cada una hay otra ronda de apuestas:</p>
          <div class="tut-row">${hand('9h 7c 2d', 'Flop: 3 cartas')}${hand('Ks', 'Turn: la 4.ª')}${hand('9s', 'River: la 5.ª')}</div>
          <p>Desde el flop habla primero el primer jugador activo a la <b>izquierda del botón</b>. Si nadie ha apostado puedes <b>pasar</b>, o <b>apostar</b> (mínimo 10). Sin límite: puedes ir <b>all-in</b> cuando quieras.</p>`,
      },
      {
        h: 'Enseñanza y desempates',
        body: `
          <p>Si tras el river quedan dos o más, se enseñan las cartas: <b>la mejor mano de 5 de 7 se lleva el bote</b>. En la mesa verás resaltadas las 5 cartas ganadoras.</p>
          <div class="tut-row">${hand('Ac Kd', 'Tú')}${hand('Ad 7c 7h 3s 2d', 'La mesa')}${hand('Ah Qs', 'Rival')}</div>
          <p class="example">Los dos tenéis doble pareja de Ases y Sietes, pero tu quinta carta (el Rey) gana a su Reina. Esa carta que desempata se llama <b>kicker</b>.</p>
          <p class="small">Si las 5 mejores cartas son iguales (por ejemplo, cuando la mesa juega para los dos), el bote se reparte. Los palos nunca desempatan.</p>`,
      },
      {
        h: 'All-in y botes secundarios',
        body: `
          <p>Si alguien va all-in con menos fichas, solo puede ganar lo que él puso de cada rival. Lo que se apueste por encima forma un <b>bote secundario</b> para los demás.</p>
          <p>Cuando ya nadie puede apostar más (todos all-in), las cartas comunes que faltan salen solas, una detrás de otra.</p>
          <p class="small">El juego calcula los botes por ti. Las fichas impares de un reparto van al primer ganador a la izquierda del botón.</p>`,
      },
      {
        h: 'Consejos de la casa',
        body: `
          <ul class="tut-list">
            <li><b>Manos iniciales top</b>: A-A, K-K, Q-Q y A-K. Con ellas, sube.</li>
            <li><b>La posición vale oro</b>: hablar el último (en el botón) te deja ver qué hacen los demás antes de decidir.</li>
            <li><b>Regla del 4 y el 2</b>: cuenta las cartas que te ligan la mano (tus "outs"). Multiplícalas por 4 en el flop o por 2 en el turn y tendrás el porcentaje aproximado de ligar.</li>
            <li>Proyecto de color en el flop: 9 outs, así que un 35 % de ligarlo antes del river.</li>
            <li>Con una pareja en la mano, ligas trío en el flop una de cada 8 veces.</li>
            <li>Si en la mesa hay 4 cartas del mismo palo, cuidado: cualquiera con una de ese palo tiene color.</li>
          </ul>
          ${practice('holdem', 'Practicar en la mesa ▶')}`,
      },
    ],
  },
  draw: {
    label: 'Póker de 5 Cartas',
    slides: [
      {
        h: 'El póker de toda la vida',
        body: `
          <p class="lead">El <b>Póker de 5 Cartas con descarte</b> es el clásico de las timbas: de 2 a 6 jugadores, <b>todos contra todos</b>.</p>
          <p>Cada uno recibe 5 cartas tapadas, puede cambiar algunas una sola vez, y la mejor mano se lleva el bote… o se lo lleva el último que quede si los demás no se atreven a seguir. Aquí el farol es un arte.</p>
          <div class="tut-row">${hand('Ts Js Qs Ks As', 'Escalera real: la mano imbatible', 'md')}</div>`,
      },
      {
        h: 'Ante y reparto',
        body: `
          <ul class="tut-list">
            <li>Todos ponen una apuesta obligatoria, el <b>ante</b> (10 fichas), en el bote.</li>
            <li>El botón <span class="dealer-chip">D</span> marca quién reparte. Rota una silla cada mano.</li>
            <li>Cada jugador recibe <b>5 cartas tapadas</b>. Sólo tú ves las tuyas.</li>
          </ul>`,
      },
      {
        h: 'Primera ronda de apuestas',
        body: `
          <p>Empieza el jugador a la <b>izquierda del repartidor</b> y sigue en el sentido de las agujas del reloj. En tu turno puedes:</p>
          <table class="tut-table">
            <tr><td><b>Pasar</b></td><td>Si nadie ha apostado, no pones nada y sigues.</td></tr>
            <tr><td><b>Apostar</b></td><td>Abres la apuesta (mínimo 20).</td></tr>
            <tr><td><b>Igualar</b></td><td>Pones lo mismo que la apuesta más alta.</td></tr>
            <tr><td><b>Subir</b></td><td>Aumentas la apuesta, al menos tanto como la última subida.</td></tr>
            <tr><td><b>No ir</b></td><td>Te retiras y pierdes lo que ya pusiste.</td></tr>
            <tr><td><b>All-in</b></td><td>Lo apuestas todo. <i>Sin límite</i>: puedes hacerlo cuando quieras.</td></tr>
          </table>
          <p class="small">La ronda termina cuando todos los que siguen han puesto lo mismo.</p>`,
      },
      {
        h: 'El descarte',
        body: `
          <p>Toca las cartas que quieras cambiar y pulsa <b>Cambiar</b>. Puedes cambiar <b>hasta 3</b>, o <b>4 si la que te quedas es un As</b>.</p>
          <p><b>Servirse</b> es no cambiar ninguna: señal de mano hecha… o de un farol de los buenos. Fíjate en cuántas cambia cada rival: es información de oro.</p>
          <div class="tut-row">${hand('Kh Kd 7c 4s 2h', 'Guarda los Reyes, cambia 3')}${hand('2h 6h 9h Jh Kc', 'Proyecto de color: cambia 1')}</div>
          <p class="tip">💡 En la mesa tienes un botón <b>Sugerencia</b> que marca el descarte recomendado.</p>`,
      },
      {
        h: 'Segunda ronda y enseñanza',
        body: `
          <p>Tras el descarte hay otra ronda de apuestas, igual que la primera.</p>
          <p>Si al final quedan dos o más jugadores, se enseñan las cartas y <b>gana la mejor mano</b>. Con un empate exacto, el bote se reparte. Los palos nunca desempatan.</p>
          <div class="tut-row">${hand('Kc Kd Kh 4s 4d', 'Full de Reyes y Cuatros')}<div class="vs">gana a</div>${hand('2d 7d 9d Jd Ad', 'Color al As')}</div>`,
      },
      {
        h: 'All-in y botes secundarios',
        body: `
          <p>Si alguien va all-in con menos fichas que los demás, sólo puede ganar lo que él puso de cada rival. Lo que se apueste por encima forma un <b>bote secundario</b> que se juegan los demás.</p>
          <p class="example">Ejemplo: Ana va all-in con 50. Beto y Cris apuestan 200 cada uno. El bote principal (150) se lo puede llevar cualquiera de los tres; el secundario (300), sólo Beto o Cris.</p>
          <p class="small">El juego lo calcula todo solo. Las fichas impares de un reparto van al primer ganador a la izquierda del repartidor.</p>`,
      },
      {
        h: 'Consejos de la casa',
        body: `
          <ul class="tut-list">
            <li>Para apostar fuerte antes del descarte, <b>pareja de Jotas o mejor</b> es una buena referencia.</li>
            <li>Con <b>pareja</b>, cambia 3: mejorarás un 28,7 % de las veces.</li>
            <li>Con <b>4 del mismo palo</b>, cambia 1: ligas color un 19 % (9 de 47 cartas).</li>
            <li>Con <b>escalera abierta</b> (5-6-7-8), cambia 1: un 17 % (8 de 47).</li>
            <li>No persigas escaleras "de tripa" (5-6-_-8-9): sólo un 8,5 %.</li>
            <li>Un rival que se sirve y apuesta fuerte suele tener algo… o quiere que lo creas.</li>
          </ul>
          ${practice('draw', 'Practicar en la mesa ▶')}`,
      },
    ],
  },
  ranks: {
    label: 'Ranking de manos',
    slides: [
      {
        h: 'Manos de 5 cartas (de mayor a menor)',
        body: `
          <table class="tut-table ranks">
            <tr><td>Escalera real</td><td>${hand('Ts Js Qs Ks As', '', 'xs')}</td><td>1 de 649.740</td></tr>
            <tr><td>Escalera de color</td><td>${hand('5h 6h 7h 8h 9h', '', 'xs')}</td><td>0,0014 %</td></tr>
            <tr><td>Póker</td><td>${hand('9c 9d 9h 9s Kd', '', 'xs')}</td><td>0,024 %</td></tr>
            <tr><td>Full</td><td>${hand('Kc Kd Kh 4s 4d', '', 'xs')}</td><td>0,14 %</td></tr>
            <tr><td>Color</td><td>${hand('2d 7d 9d Jd Ad', '', 'xs')}</td><td>0,20 %</td></tr>
            <tr><td>Escalera</td><td>${hand('6c 7d 8h 9s Tc', '', 'xs')}</td><td>0,39 %</td></tr>
            <tr><td>Trío</td><td>${hand('7c 7d 7s Kh 2d', '', 'xs')}</td><td>2,11 %</td></tr>
            <tr><td>Doble pareja</td><td>${hand('Jc Jd 4h 4s Ad', '', 'xs')}</td><td>4,75 %</td></tr>
            <tr><td>Pareja</td><td>${hand('Qc Qh 8d 5s 2c', '', 'xs')}</td><td>42,26 %</td></tr>
            <tr><td>Carta alta</td><td>${hand('Ac Jd 8h 5s 3c', '', 'xs')}</td><td>50,12 %</td></tr>
          </table>
          <p class="small">Valen para los dos juegos. Empates: se comparan las cartas de más valor del grupo (el trío del full, la pareja mayor…) y después las sueltas. El As cierra 10-J-Q-K-A o abre A-2-3-4-5.</p>`,
      },
    ],
  },
  online: {
    label: 'Jugar con amigos',
    slides: [
      {
        h: 'Monta tu mesa privada',
        body: `
          <ol class="tut-steps">
            <li>En el menú, pulsa <b>AMIGOS</b>.</li>
            <li>Escribe tu apodo, elige el juego y pulsa <b>CREAR MESA PRIVADA</b>.</li>
            <li>Te damos un <b>código de 4 letras</b> y un enlace de invitación.</li>
          </ol>
          <p class="tip">¿Prefieres practicar antes? <b>JUGAR</b> te sienta en una mesa con los habituales del local (bots), sin conexión.</p>`,
      },
      {
        h: 'Invita a la banda',
        body: `
          <ol class="tut-steps">
            <li>Comparte el código o pulsa <b>🔗 Copiar invitación</b> y mándalo por WhatsApp.</li>
            <li>Tus amigos abren el enlace (o pulsan <b>AMIGOS</b> y escriben el código en <b>ENTRAR</b>) desde el móvil o el ordenador.</li>
            <li>Caben hasta <b>6 por mesa</b>. Si sois pocos, sienta a algún habitual 🤖.</li>
          </ol>`,
      },
      {
        h: 'Quien crea la mesa, manda',
        body: `
          <ul class="tut-list">
            <li>El anfitrión 👑 elige el juego, sienta o levanta bots y empieza la partida.</li>
            <li>Puede <b>detener</b> la partida para cambiar de juego: las fichas de cada uno se conservan.</li>
            <li>Todos empezáis con <b>1.000 fichas</b>. Si bajas de 100, puedes <b>recargar</b> entre manos.</li>
            <li>¿Se te cayó la conexión? Vuelve a abrir la página: recuperas tu silla durante 90 segundos.</li>
            <li>Hay chat en la mesa. Sé educado: el portero también lee.</li>
          </ul>
          <p class="small">El juego online necesita el servidor de El Sótano en marcha (ver README del proyecto).</p>`,
      },
    ],
  },
};

const ORDER = ['holdem', 'draw', 'ranks', 'online'];

export function initTutorial({ onPractice }) {
  const modal = document.getElementById('tutorial');
  const body = document.getElementById('tut-body');
  const dots = document.getElementById('tut-dots');
  const prev = document.getElementById('tut-prev');
  const next = document.getElementById('tut-next');
  const tabs = document.getElementById('tut-tabs');
  let tab = 'holdem';
  let idx = 0;
  let lastFocus = null;

  function render() {
    const t = TUTORIAL[tab];
    const slide = t.slides[idx];
    tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.tut === tab));
    body.innerHTML = `<div class="tut-slide"><div class="tut-step">${t.label} · ${idx + 1}/${t.slides.length}</div><h3>${slide.h}</h3>${slide.body}</div>`;
    body.querySelectorAll('.tut-cards').forEach((el) => renderStatic(el, parseCards(el.dataset.cards), el.dataset.size || 'sm'));
    body.querySelectorAll('[data-practice]').forEach((b) =>
      b.addEventListener('click', () => {
        close();
        onPractice(b.dataset.practice);
      }),
    );
    body.scrollTop = 0;
    dots.textContent = '';
    t.slides.forEach((_, i) => {
      const d = document.createElement('button');
      d.className = 'tut-dot' + (i === idx ? ' active' : '');
      d.setAttribute('aria-label', `Paso ${i + 1}`);
      d.addEventListener('click', () => {
        idx = i;
        render();
      });
      dots.appendChild(d);
    });
    prev.disabled = idx === 0 && ORDER.indexOf(tab) === 0;
    const lastSlide = idx === t.slides.length - 1;
    const lastTab = ORDER.indexOf(tab) === ORDER.length - 1;
    next.textContent = lastSlide ? (lastTab ? '¡A jugar!' : `${TUTORIAL[ORDER[ORDER.indexOf(tab) + 1]].label} →`) : 'Siguiente →';
  }

  function go(delta) {
    const t = TUTORIAL[tab];
    idx += delta;
    if (idx >= t.slides.length) {
      const ti = ORDER.indexOf(tab) + 1;
      if (ti >= ORDER.length) {
        close();
        return;
      }
      tab = ORDER[ti];
      idx = 0;
    } else if (idx < 0) {
      const ti = ORDER.indexOf(tab) - 1;
      if (ti < 0) {
        idx = 0;
        return;
      }
      tab = ORDER[ti];
      idx = TUTORIAL[tab].slides.length - 1;
    }
    render();
  }

  function open(which = 'holdem') {
    tab = TUTORIAL[which] ? which : 'holdem';
    idx = 0;
    lastFocus = document.activeElement;
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add('open'));
    render();
    next.focus();
  }

  function close() {
    modal.classList.remove('open');
    modal.hidden = true;
    lastFocus?.focus?.();
  }

  prev.addEventListener('click', () => go(-1));
  next.addEventListener('click', () => go(1));
  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tut]');
    if (!b) return;
    tab = b.dataset.tut;
    idx = 0;
    render();
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal || e.target.closest('[data-close-modal]')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (modal.hidden) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') go(1);
    if (e.key === 'ArrowLeft') go(-1);
  });

  return { open, close, isOpen: () => !modal.hidden };
}
