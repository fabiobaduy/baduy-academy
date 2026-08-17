(function(){
/* ============================================================
 * Baduy Academy — Sampler de manos ocultas
 * Inferir las fichas posibles de los rivales (información
 * imperfecta). Similar al "range" del póker: dado lo que se ve
 * (mi mano + fichas jugadas), ¿qué puede tener cada rival?
 * ============================================================ */
const Engine = (typeof window !== 'undefined') ? window.Engine : require('./engine.js');

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

  const hidden = Engine.ALL_TILES.filter(t => !seen.has(t[0] * 10 + t[1]));
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
// SAMPLER CONDICIONAL (modo estudio) — lógica del Campeón
// El jugador de turno no conoce las manos de los rivales, pero
// INFIERE con CERTEZA 100% a partir de:
//  1. Fichas jugadas (tablero) → ya no son desconocidas
//  2. Pases: si P pasó con extremos [x, y], P NO tiene ninguna
//     ficha con x ni con y. (Regla del dominó: pasar = no tener)
//  3. Secuencia de juego (quién juega cuándo)
// Muestrea manos CONSISTENTES con toda esa información.
// ============================================================

// Fichas prohibidas por pases — derivado del passLog del estado.
// Devuelve { playerIdx: Set(palos que NO puede tener) }
function passConstraintsFromLog(state) {
  const constraints = {};
  state.players.forEach((_, i) => { constraints[i] = new Set(); });

  state.passLog.forEach(pl => {
    const pIdx = state.players.findIndex(p => p.name === pl.player);
    if (pIdx < 0 || !pl.ends) return;
    // Pasó con extremos [x, y] → NO tiene fichas con x NI con y
    constraints[pIdx].add(pl.ends[0]);
    constraints[pIdx].add(pl.ends[1]);
  });

  // EXTRA: si el jugador nunca pasó, no tiene restricciones
  return constraints;
}

// Información deducida de los pases (compatibilidad con API antigua)
function passConstraints(state, viewerIdx) {
  const constraints = {};
  state.players.forEach((_, i) => {
    constraints[i] = { cannotHave: new Set(), forced: [] };
  });
  const fromLog = passConstraintsFromLog(state);
  state.players.forEach((_, i) => {
    constraints[i].cannotHave = fromLog[i];
  });
  return constraints;
}

// Versión práctica: muestrea manos de rivales RESPETANDO pases.
// Si `passHistory` no se pasa, deriva las restricciones del
// passLog del estado (certeza 100% por pases registrados).
function sampleConstrained(state, viewerIdx, passHistory = null, rng = Math.random) {
  const hidden = hiddenTiles(state, viewerIdx);

  // Fichas prohibidas para cada rival (por pases)
  const banned = {};
  state.players.forEach((p, i) => { banned[i] = new Set(); });

  if (passHistory && passHistory.length) {
    passHistory.forEach(ph => {
      if (banned[ph.playerIdx]) banned[ph.playerIdx].add(ph.suit);
    });
  } else {
    // Derivar del passLog del estado (nueva lógica del Campeón)
    const fromLog = passConstraintsFromLog(state);
    state.players.forEach((_, i) => {
      fromLog[i].forEach(s => banned[i].add(s));
    });
  }

  // Repartir respetando restricciones (rechazo simple)
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

const Sampler = { hiddenTiles, sampleOpponentHands, sampleConstrained, passConstraints, passConstraintsFromLog, probRivalHasSuit };
if (typeof module !== 'undefined' && module.exports) module.exports = Sampler;
if (typeof window !== 'undefined') window.Sampler = Sampler;

})();