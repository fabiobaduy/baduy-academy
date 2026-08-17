(function(){
/* ============================================================
 * Baduy Academy — Coach GTO: análisis de jugadas con EV
 * Calcula el Valor Esperado de cada jugada legal mediante
 * simulación Monte Carlo del final de la partida.
 * ============================================================ */
const Engine = (typeof window !== 'undefined') ? window.Engine : require('./engine.js');
const SamplerM = (typeof window !== 'undefined') ? window.Sampler : require('./sampler.js');

// Clonado profundo que preserva métodos de clase (structuredClone pierde prototipos)
function deepCloneState(state) {
  const s = new Engine.GameState(state.players.map(p => new Engine.Player(p.name, p.teamId)));
  s.players.forEach((p, i) => { p.hand = state.players[i].hand.map(t => [t[0], t[1]]); });
  s.board = state.board.map(t => [t[0], t[1]]);
  s.history = state.history.map(h => ({ player: h.player, tile: [h.tile[0], h.tile[1]], side: h.side }));
  s.turn = state.turn;
  s.passed = state.passed.slice();
  s.scores = state.scores.slice();
  return s;
}

// Puntos que vale cada ficha (suma de sus extremos)
function tileValue(t) { return t[0] + t[1]; }

// Simula el resto de la partida desde un estado (juego bloqueado o alguien se queda sin fichas)
// Devuelve los PUNTOS que quedaron en mano del jugador `viewerIdx`
// (menos puntos = mejor para el viewer). El viewer es quien tomó la
// decisión; la simulación termina y medimos SU mano, no la del que
// tendría el turno al final.
function simulateToEnd(state, viewerIdx, maxPlies = 60) {
  const s = deepCloneState(state);
  for (let i = 0; i < maxPlies; i++) {
    const p = s.currentPlayer();
    const moves = Engine.legalMoves(p.hand, s.board);
    if (!moves.length) {
      s.passed.push(p.name);
      // TRANCA (regla del campeón): 4 pases consecutivos (uno de cada
      // jugador) o pinta completa en ambos extremos
      if (s.isTrancado()) break;
    } else {
      const m = moves[Math.floor(Math.random() * moves.length)];
      const ends = s.boardEnds();
      const end = s.board.length ? (Math.random() < 0.5 ? ends[0] : ends[1]) : null;
      const ok = Engine.applyMove(s, p, m, s.board.length ? (end === ends[0] ? 'left' : 'right') : 'right');
      if (!ok) s.passed.push(p.name);
    }
    s.advanceTurn();
    // Si alguien se quedó sin fichas
    if (s.players.some(pl => pl.hand.length === 0)) break;
  }
  // Puntos en mano del viewer al final (menos = mejor para él)
  const viewerPts = s.players[viewerIdx].hand.reduce((a, t) => a + tileValue(t), 0);
  return viewerPts;
}

// Análisis GTO de una jugada: simula N partidas desde después de jugarla
// EV = puntos promedio que quedan en mano del viewer al final
// (menos puntos = mejor jugada)
function analyzeMove(state, tile, side, simulations = 800) {
  const s = deepCloneState(state);
  const viewerIdx = s.turn % s.players.length;
  const p = s.players[viewerIdx];
  const ok = Engine.applyMove(s, p, tile, side);
  if (!ok) return null;
  s.advanceTurn();

  let totalPts = 0;
  for (let i = 0; i < simulations; i++)
    totalPts += simulateToEnd(s, viewerIdx);

  const ev = totalPts / simulations; // puntos en mano al final (menos = mejor)
  return {
    tile: tile.slice(),
    side,
    ev: Math.round(ev * 100) / 100,
    simulations,
    winRate: Math.round((simulateToEnd(s, viewerIdx) < 10 ? 1 : 0) * 100), // aprox
  };
}

// Analiza todas las jugadas legales del jugador actual
function analyzeAll(state, simulations = 800) {
  const viewerIdx = state.turn % state.players.length;
  const p = state.players[viewerIdx];
  const moves = Engine.legalMoves(p.hand, state.board);
  if (!state.board.length) {
    // Primera jugada: cada ficha de la mano es una opción
    return moves.map(t => {
      const s = deepCloneState(state);
      Engine.applyMove(s, p, t, 'right');
      s.advanceTurn();
      let pts = 0;
      for (let i = 0; i < simulations; i++) pts += simulateToEnd(s, viewerIdx);
      return { tile: t.slice(), side: 'right', ev: Math.round((pts / simulations) * 100) / 100, simulations };
    }).sort((a, b) => a.ev - b.ev); // MENOS puntos = mejor
  }

  const results = [];
  for (const tile of moves) {
    const ends = state.boardEnds();
    // Probar lado izquierdo y derecho
    for (const side of ['left', 'right']) {
      const r = analyzeMove(state, tile, side, simulations);
      if (r) results.push(r);
    }
  }
  return results.sort((a, b) => a.ev - b.ev); // MENOS puntos = mejor
}

// ============================================================
// MODO ESTUDIO: análisis con información imperfecta
// El jugador de turno NO conoce las manos de los rivales.
// Para cada jugada candidata:
//   1. Muestrea N mundos posibles (manos de rivales consistentes
//      con pases e información deducida — sampleConstrained)
//   2. En cada mundo, simula el final de la partida
//   3. Promedia el EV sobre todos los mundos
// Esto es análogo a un solver: EV sobre la distribución de
// manos posibles, no sobre un estado fijo.
// ============================================================

// Analiza una jugada en modo estudio
// `viewerIdx`: el jugador cuyo punto de vista usamos (el que decide)
// `passHistory`: [{playerIdx, suit}] — palos que cada rival no tiene
function analyzeMoveStudy(state, tile, side, viewerIdx, simulations = 200, passHistory = [], rng = Math.random) {
  let totalPts = 0;
  let valid = 0;

  for (let i = 0; i < simulations; i++) {
    // Crear un mundo posible: clonar y muestrear manos ocultas
    const s = deepCloneState(state);

    // El jugador de turno (viewer) mantiene su mano conocida
    // Los rivales reciben manos muestreadas condicionalmente
    const sample = SamplerM.sampleConstrained(s, viewerIdx, passHistory, rng);
    for (const [idx, hand] of Object.entries(sample)) {
      s.players[parseInt(idx)].hand = hand;
    }

    // Aplicar la jugada candidata en este mundo
    const p = s.players[viewerIdx];
    const ok = Engine.applyMove(s, p, tile, side);
    if (!ok) continue;
    s.advanceTurn();

    // Simular el resto y medir puntos en mano del viewer
    totalPts += simulateToEnd(s, viewerIdx, 150);
    valid++;
  }

  if (!valid) return null;
  return {
    tile: [tile[0], tile[1]],
    side,
    // EV = puntos promedio en mano del viewer al final (menos = mejor)
    ev: Math.round((totalPts / valid) * 100) / 100,
    simulations: valid,
  };
}

// Analiza TODAS las jugadas del viewer en modo estudio
function analyzeAllStudy(state, viewerIdx, simulations = 200, passHistory = [], rng = Math.random) {
  const p = state.players[viewerIdx];
  const moves = Engine.legalMoves(p.hand, state.board);
  const results = [];

  if (!state.board.length) {
    // Primera jugada
    for (const t of moves) {
      const r = analyzeMoveStudy(state, t, 'right', viewerIdx, simulations, passHistory, rng);
      if (r) results.push(r);
    }
  } else {
    const ends = state.boardEnds();
    for (const t of moves) {
      for (const side of ['left', 'right']) {
        const end = side === 'left' ? ends[0] : ends[1];
        if (!Engine.orientations(t, end).length) continue;
        const r = analyzeMoveStudy(state, t, side, viewerIdx, simulations, passHistory, rng);
        if (r) results.push(r);
      }
    }
  }
  return results.sort((a, b) => a.ev - b.ev); // MENOS puntos = mejor
}

// Exponer en navegador (window.Coach) y en Node (module.exports)
const Coach = { tileValue, simulateToEnd, analyzeMove, analyzeAll, analyzeMoveStudy, analyzeAllStudy };
if (typeof module !== 'undefined' && module.exports) module.exports = Coach;
if (typeof window !== 'undefined') window.Coach = Coach;

})();