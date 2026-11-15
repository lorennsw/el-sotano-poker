# 🃏 El Sótano — Póker clandestino online

Póker en el navegador con estética arcade pixel: fondo de plasma pixelado, botones gordos que se hunden,
un logo que baila y cartas que se inclinan hacia el ratón.
Dos modalidades, tutorial interactivo y mesas privadas para jugar **online con amigos** (o contra bots).

**▶ Jugar: https://el-sotano-poker.onrender.com** (plan gratuito de Render: si nadie lo ha usado en un rato,
la primera carga tarda unos segundos en despertar el servidor).

| Modalidad | Cómo se juega |
| --- | --- |
| **Texas Hold’em** (principal) | Sin límite, entre jugadores: botón y ciegas 5/10 que rotan, dos cartas propias, flop, turn y river, mejor mano de 5 entre 7, all-in y botes secundarios. |
| **Póker de 5 Cartas** (clásico) | Póker cubierto con descarte, sin límite, entre jugadores: ante, dos rondas de apuestas, descarte de hasta 3 (4 con As), all-in y botes secundarios. |

## Arrancar

Necesitas Node.js 18 o superior.

```bash
git clone https://github.com/lorennsw/el-sotano-poker
cd el-sotano-poker
npm install
npm start          # → http://localhost:3000
```

- **Jugar ya**: te sienta contra la casa y los "habituales" (bots). Funciona sin conexión.
- **Crear mesa privada**: te da un código de 4 letras y un enlace de invitación (`?sala=CÓDIGO`).
  Hasta 6 jugadores por mesa; el anfitrión elige el juego, sienta bots, empieza y detiene la partida.

### Jugar con amigos por internet

El servidor tiene que ser accesible para tus amigos. Tres formas:

1. **Misma WiFi**: `npm start` y que abran `http://TU-IP-LOCAL:3000`.
2. **Túnel rápido** (sin desplegar nada): con el servidor arrancado,
   `npx localtunnel --port 3000` o `cloudflared tunnel --url http://localhost:3000`, y comparte la URL que te den.
3. **Desplegarlo gratis en [Render](https://render.com)**: *New + → Blueprint* y elige este repositorio
   (usa el `render.yaml` de la raíz). También hay un `Dockerfile` para cualquier otro proveedor.
   La variable `PORT` se respeta.

## Cómo está hecho

```
.
├── server.js          HTTP estático + WebSocket (/ws) con salas, reconexión y límites
├── shared/            Lógica del juego, la MISMA en servidor y navegador
│   ├── cards.js       Baraja y barajado criptográfico (Fisher–Yates sin sesgo)
│   ├── eval5.js       Evaluador de 5 cartas con desempates completos y mejor mano de 5 entre 7
│   ├── holdem.js      Texas Hold’em: ciegas, calles y enseñanza (hereda las apuestas de draw.js)
│   ├── draw.js        Partida de 5 cartas: turnos, subidas sin límite, all-in corto, botes secundarios
│   ├── bots.js        Personajes y estrategia de los bots
│   └── room.js        Sala: jugadores, anfitrión, chat, recargas
├── public/            Cliente: index.html, css/style.css, js/ (mesa, cartas SVG, tutorial, sonido)
└── test/              Pruebas (node --test)
```

- El **servidor es la autoridad**: baraja, reparte y valida cada acción. Cada jugador sólo recibe sus propias
  cartas; las ajenas viajan únicamente en la enseñanza.
- El modo en solitario ejecuta la misma clase `Room` en el navegador, así que las reglas son idénticas.
- Las cartas (figuras, ases, dorso) y las fichas están dibujadas con SVG/CSS; el fondo es un plasma con tramado
  ordenado pintado en un `<canvas>` de baja resolución (`public/js/bg.js`); los sonidos se sintetizan con Web Audio.
  No hay imágenes ni audios externos. Con "reducir movimiento" activado en el sistema, las animaciones se detienen.

## Pruebas

```bash
npm test
```

Incluyen la enumeración **exhaustiva** de las 2.598.960 manos de 5 cartas (frecuencias exactas por
categoría y las 7.462 clases distintas), la mejor mano de 5 entre 7 con kicker y empates, ciegas y orden
de habla del Hold’em (también mano a mano), botes secundarios, la regla de all-in corto que no reabre la
subida, el límite de descarte y simulaciones de cientos de manos de cada juego comprobando que no se
crean ni se pierden fichas y que nunca se repite una carta.

> Fichas ficticias: aquí no se juega dinero real.
