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

module.exports = { hiddenTiles, sampleOpponentHands, probRivalHasSuit };
