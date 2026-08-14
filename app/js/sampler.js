/* ============================================================
 * Baduy Academy — Sampler de manos ocultas
 * Inferir las fichas posibles de los rivales (información
 * imperfecta). Similar al "range" del póker: dado lo que se ve
 * (mi mano + fichas jugadas), ¿qué puede tener cada rival?
 * ============================================================ */
const E = require('./engine.js');

// Fichas NO visibles: todas las fichas menos (mi mano + tablero + historial)
function hiddenTiles(state, visiblePlayerIdx) {
  const seen = new Set();
  const mark = t => seen.add(t[0] * 10 + t[1]);

  // Fichas en tablero e historial
  state.board.forEach(t => mark(t));
  state.history.forEach(h => mark(h.tile));

  // Manos visibles (la del jugador que preguntamos)
  state.players.forEach((p, i) => {
    if (i === visiblePlayerIdx) p.hand.forEach(mark);
  });

  const hidden = E.ALL_TILES.filter(t => !seen.has(t[0] * 10 + t[1]));
  return hidden;
}

// Muestrea manos para todos los rivales (consistentes con el total de fichas)
function sampleOpponentHands(state, viewerIdx, rng = Math.random) {
  const hidden = hiddenTiles(state, viewerIdx);
  const nOpponents = state.players.length - 1;
  // ¿Cuántas fichas le faltan a cada rival? (7 - las que ya jugó)
  const hands = [];
  state.players.forEach((p, i) => {
    if (i === viewerIdx) return;
    const played = state.history.filter(h => h.player === p.name).length;
    const remaining = 7 - played;
    hands.push({ playerIdx: i, count: remaining });
  });

  // Barajar las fichas ocultas y repartir
  const shuffled = hidden.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const result = {};
  let cursor = 0;
  for (const h of hands) {
    result[h.playerIdx] = shuffled.slice(cursor, cursor + h.count);
    cursor += h.count;
  }
  return result;
}

// ============================================================
// SAMPLER CONDICIONAL (modo estudio)
// El jugador de turno no conoce las manos de los rivales, pero
// INFIERE por:
//  1. Fichas jugadas (tablero)
//  2. Pases previos (si P pasó, NO tiene fichas del palo que pasó)
//  3. Secuencia de juego
// Muestrea manos CONSISTENTES con esa información.
// ============================================================

// Información deducida de los pases:
// Si un jugador pasó, no tiene ninguna ficha del palo que estaba
// en juego en ese momento.
function passConstraints(state, viewerIdx) {
  // Para cada jugador rival, qué palos NO puede tener
  const constraints = {};
  state.players.forEach((p, i) => {
    if (i === viewerIdx) return;
    constraints[i] = { cannotHave: new Set(), forced: [] };
  });

  // Reconstruir la secuencia: necesitamos saber QUÉ palo estaba
  // en juego cuando alguien pasó.
  // Aproximación: si un jugador pasó, no tiene los palos de los
  // extremos en ese momento. Para simplificar, usamos los pases
  // registrados con el estado del tablero en ese turno.
  // (En una implementación completa, history guardaría el tablero)
  return constraints;
}

// Versión práctica: muestrea manos de rivales RESPETANDO pases.
// `passHistory`: [{playerIdx, suit}] — palos que cada rival no tiene
function sampleConstrained(state, viewerIdx, passHistory = [], rng = Math.random) {
  const hidden = hiddenTiles(state, viewerIdx);

  // Fichas prohibidas para cada rival (por pases)
  const banned = {};
  state.players.forEach((p, i) => { banned[i] = new Set(); });
  passHistory.forEach(ph => {
    if (banned[ph.playerIdx]) banned[ph.playerIdx].add(ph.suit);
  });

  // Repartir respetando restricciones (rechazo simple)
  const attempts = 0;
  const result = {};
  state.players.forEach((p, i) => {
    if (i === viewerIdx) return;
    const played = state.history.filter(h => h.player === p.name).length;
    const count = 7 - played;
    // Filtrar fichas permitidas
    const allowed = hidden.filter(t =>
      !(banned[i] && (banned[i].has(t[0]) || banned[i].has(t[1]))));
    // Si no hay suficientes permitidas, usar todas (relajar)
    const pool = allowed.length >= count ? allowed : hidden;
    // Muestreo sin reemplazo
    const shuffled = pool.slice();
    for (let k = shuffled.length - 1; k > 0; k--) {
      const j = Math.floor(rng() * (k + 1));
      [shuffled[k], shuffled[j]] = [shuffled[j], shuffled[k]];
    }
    const hand = shuffled.slice(0, count);
    result[i] = hand;
    // Quitar del pool oculto (evitar duplicados entre rivales)
    hand.forEach(t => {
      const idx = hidden.findIndex(h => h[0] === t[0] && h[1] === t[1]);
      if (idx >= 0) hidden.splice(idx, 1);
    });
  });
  return result;
}

// Probabilidad de que un rival tenga al menos una ficha de un palo
// (dado lo que se ve). Útil para decisiones de "forzar palo".
function probRivalHasSuit(state, viewerIdx, suit, simulations = 200, rng = Math.random) {
  let has = 0;
  for (let i = 0; i < simulations; i++) {
    const hands = sampleOpponentHands(state, viewerIdx, rng);
    const anyHas = Object.values(hands).some(h => h.some(t => t[0] === suit || t[1] === suit));
    if (anyHas) has++;
  }
  return has / simulations;
}

module.exports = { hiddenTiles, sampleOpponentHands, sampleConstrained, passConstraints, probRivalHasSuit };
if (typeof window !== 'undefined') window.Sampler = module.exports;
