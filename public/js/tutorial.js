// Escuela de El Sótano: tutorial por pasos de los dos juegos, ranking de manos y juego online.

import { parseCards, renderStatic } from './cards-ui.js';

const hand = (cards, caption = '', size = 'sm') =>
  `<figure class="tut-hand"><div class="tut-cards" data-cards="${cards}" data-size="${size}"></div>${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;

const practice = (mode, label) =>
  `<div class="tut-cta"><button class="btn btn-gold" data-practice="${mode}">${label}</button></div>`;

const TUTORIAL = {
  three: {
    label: 'Póker de 3 Cartas',
    slides: [
      {
        h: 'La casa contra ti',
        body: `
          <p class="lead">En el <b>Póker de 3 Cartas</b> no compites contra los demás jugadores: <b>cada uno juega su mano contra el crupier</b>. Si tu mano de tres cartas es mejor que la suya, cobras.</p>
          <p>Es el juego estrella del local: rápido (una mano dura menos de un minuto), fácil de aprender y con premios gordos si ligas un trío o una escalera de color.</p>
          <div class="tut-row">${hand('Qh Kh Ah', 'Escalera de color máxima: la mejor mano posible', 'md')}</div>`,
      },
      {
        h: 'Paso 1 · Haz tus apuestas',
        body: `
          <p>Antes de ver las cartas, pon fichas en las casillas del tapete:</p>
          <div class="tut-spots">
            <div class="tut-spot"><span class="mini-spot">ANTE</span><p><b>Ante</b> — la apuesta principal: tu mano contra la del crupier.</p></div>
            <div class="tut-spot"><span class="mini-spot pp">PAIR<br>PLUS</span><p><b>Pair Plus</b> — apuesta opcional a que te salga <b>pareja o algo mejor</b>. Se cobra pase lo que pase con el crupier.</p></div>
          </div>
          <p>Puedes jugar las dos o sólo una. Cada una va de <b>5 a 500</b> fichas.</p>
          <p class="tip">🎯 <b>En la mesa:</b> toca la casilla (ANTE o PAIR PLUS), luego las fichas, y pulsa <b>REPARTIR</b>. Necesitas tener guardado otro tanto como el Ante, por si decides jugar.</p>`,
      },
      {
        h: 'Paso 2 · Mira tus cartas y decide',
        body: `
          <p>Recibes 3 cartas boca arriba para ti; el crupier recibe 3 tapadas. Si pusiste Ante, decides:</p>
          <ul class="tut-list">
            <li><b class="t-gold">JUGAR</b> — pones en la casilla <b>PLAY</b> lo mismo que tienes en el Ante y sigues en la mano.</li>
            <li><b class="t-red">RETIRARSE</b> — abandonas y pierdes el Ante <i>y</i> el Pair Plus.</li>
          </ul>
          <div class="tut-row">${hand('Kd 9c 4s', 'Rey alto: juega')}${hand('Jh 8d 3c', 'Jota alta: retírate')}</div>`,
      },
      {
        h: 'Paso 3 · ¿Califica el crupier?',
        body: `
          <p>El crupier sólo "juega" si tiene <b>Reina alta o mejor</b>. Eso cambia cómo se paga:</p>
          <table class="tut-table">
            <tr><th>Situación</th><th>Ante</th><th>Play</th></tr>
            <tr><td>El crupier <b>no califica</b></td><td class="win">paga 1:1</td><td>se devuelve</td></tr>
            <tr><td>Califica y <b>le ganas</b></td><td class="win">paga 1:1</td><td class="win">paga 1:1</td></tr>
            <tr><td>Califica y <b>te gana</b></td><td class="lose">pierdes</td><td class="lose">pierdes</td></tr>
            <tr><td>Empate exacto</td><td>se devuelve</td><td>se devuelve</td></tr>
          </table>
          <div class="tut-row">${hand('Qs 7d 2c', 'Califica (justo)')}${hand('Jh 9s 8d', 'No califica')}</div>`,
      },
      {
        h: 'Los bonos: donde está el dinero',
        body: `
          <div class="tut-cols">
            <div>
              <h4>Bono Ante</h4>
              <p class="small">Si juegas, se paga <b>aunque el crupier te gane</b> o no califique.</p>
              <table class="tut-table pay">
                <tr><td>Escalera de color</td><td>5 : 1</td></tr>
                <tr><td>Trío</td><td>4 : 1</td></tr>
                <tr><td>Escalera</td><td>1 : 1</td></tr>
              </table>
            </div>
            <div>
              <h4>Pair Plus</h4>
              <p class="small">Sólo cuenta tu mano, no la del crupier. Si te retiras, se pierde.</p>
              <table class="tut-table pay">
                <tr><td>Escalera de color</td><td>40 : 1</td></tr>
                <tr><td>Trío</td><td>30 : 1</td></tr>
                <tr><td>Escalera</td><td>6 : 1</td></tr>
                <tr><td>Color</td><td>4 : 1</td></tr>
                <tr><td>Pareja</td><td>1 : 1</td></tr>
              </table>
            </div>
          </div>
          <p class="tip">"4 : 1" significa que por cada ficha apostada ganas 4 y además recuperas la tuya.</p>`,
      },
      {
        h: 'Ojo: aquí la escalera vale MÁS que el color',
        body: `
          <p>Con sólo tres cartas es más fácil ligar color que escalera, así que el orden cambia respecto al póker clásico:</p>
          <table class="tut-table rank3">
            <tr><td>1</td><td>Escalera de color</td><td>${hand('9h Th Jh', '', 'xs')}</td><td>0,22 %</td></tr>
            <tr><td>2</td><td>Trío</td><td>${hand('Kc Kd Ks', '', 'xs')}</td><td>0,24 %</td></tr>
            <tr><td>3</td><td>Escalera</td><td>${hand('4c 5d 6s', '', 'xs')}</td><td>3,26 %</td></tr>
            <tr><td>4</td><td>Color</td><td>${hand('2s 8s Js', '', 'xs')}</td><td>4,96 %</td></tr>
            <tr><td>5</td><td>Pareja</td><td>${hand('Ac Ad 7s', '', 'xs')}</td><td>16,94 %</td></tr>
            <tr><td>6</td><td>Carta alta</td><td>${hand('Kh 9d 3c', '', 'xs')}</td><td>74,39 %</td></tr>
          </table>
          <p class="small">El As vale alto o bajo: <b>Q-K-A</b> es la escalera más alta y <b>A-2-3</b> la más baja. K-A-2 no es escalera.</p>`,
      },
      {
        h: 'La estrategia del profesional: Q-6-4',
        body: `
          <p class="lead">Regla de oro: <b>juega con Reina-Seis-Cuatro o mejor</b>, retírate con peor.</p>
          <div class="tut-row">
            ${hand('Qc 6h 4d', '✅ Juega (justo el mínimo)')}
            ${hand('Qc 6h 3d', '❌ Retírate')}
            ${hand('Qs 5d 4h', '❌ Retírate')}
            ${hand('2c 2h 9s', '✅ Cualquier pareja: juega')}
          </div>
          <p>Con esta estrategia la ventaja de la casa es del <b>3,37 %</b> en Ante/Play. El Pair Plus con esta tabla (1-4-6-30-40) tiene un <b>2,32 %</b>.</p>
          <p class="tip">💡 En la mesa, cuando tengas que decidir, el crupier te susurrará lo que haría un profesional.</p>
          ${practice('three', 'Practicar en la mesa ▶')}`,
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
          <p class="small">Empates: se comparan las cartas de más valor del grupo (el trío del full, la pareja mayor…) y después las sueltas. El As cierra 10-J-Q-K-A o abre A-2-3-4-5.</p>`,
      },
      {
        h: 'Manos de 3 cartas (de mayor a menor)',
        body: `
          <table class="tut-table ranks">
            <tr><td>Escalera de color</td><td>${hand('9h Th Jh', '', 'xs')}</td><td>0,22 %</td></tr>
            <tr><td>Trío</td><td>${hand('Kc Kd Ks', '', 'xs')}</td><td>0,24 %</td></tr>
            <tr><td>Escalera</td><td>${hand('4c 5d 6s', '', 'xs')}</td><td>3,26 %</td></tr>
            <tr><td>Color</td><td>${hand('2s 8s Js', '', 'xs')}</td><td>4,96 %</td></tr>
            <tr><td>Pareja</td><td>${hand('Ac Ad 7s', '', 'xs')}</td><td>16,94 %</td></tr>
            <tr><td>Carta alta</td><td>${hand('Kh 9d 3c', '', 'xs')}</td><td>74,39 %</td></tr>
          </table>
          <p class="small">Recuerda: con 3 cartas la <b>escalera gana al color</b> y el trío gana a la escalera.</p>`,
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
            <li>Escribe tu apodo y elige el juego en la portada.</li>
            <li>Pulsa <b>🗝️ Crear mesa privada</b>.</li>
            <li>Te damos un <b>código de 4 letras</b> y un enlace de invitación.</li>
          </ol>
          <p class="tip">¿Prefieres practicar antes? <b>Jugar ya</b> te sienta en una mesa con los habituales del local (bots), sin conexión.</p>`,
      },
      {
        h: 'Invita a la banda',
        body: `
          <ol class="tut-steps">
            <li>Comparte el código o pulsa <b>🔗 Copiar invitación</b> y mándalo por WhatsApp.</li>
            <li>Tus amigos abren el enlace (o escriben el código en <b>Entrar</b>) desde el móvil o el ordenador.</li>
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

const ORDER = ['three', 'draw', 'ranks', 'online'];

export function initTutorial({ onPractice }) {
  const modal = document.getElementById('tutorial');
  const body = document.getElementById('tut-body');
  const dots = document.getElementById('tut-dots');
  const prev = document.getElementById('tut-prev');
  const next = document.getElementById('tut-next');
  const tabs = document.getElementById('tut-tabs');
  let tab = 'three';
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

  function open(which = 'three') {
    tab = TUTORIAL[which] ? which : 'three';
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
