/* ============================================================
 * Baduy Academy — Coach GTO: análisis de jugadas con EV
 * Calcula el Valor Esperado de cada jugada legal mediante
 * simulación Monte Carlo del final de la partida.
 * ============================================================ */
const E = require('./engine.js');

// Clonado profundo que preserva métodos de clase (structuredClone pierde prototipos)
function deepCloneState(state) {
  const s = new E.GameState(state.players.map(p => new E.Player(p.name, p.teamId)));
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
// Devuelve puntos: +gana el jugador actual, -pierde, 0 empate (aproximación por equipo)
function simulateToEnd(state, maxPlies = 200) {
  const s = deepCloneState(state);
  for (let i = 0; i < maxPlies; i++) {
    const p = s.currentPlayer();
    const moves = E.legalMoves(p.hand, s.board);
    if (!moves.length) {
      s.passed.push(p.name);
      if (s.passed.length === s.players.length) break; // bloqueado
    } else {
      const m = moves[Math.floor(Math.random() * moves.length)];
      const ends = s.boardEnds();
      const end = s.board.length ? (Math.random() < 0.5 ? ends[0] : ends[1]) : null;
      const ok = E.applyMove(s, p, m, s.board.length ? (end === ends[0] ? 'left' : 'right') : 'right');
      if (!ok) s.passed.push(p.name);
    }
    s.advanceTurn();
    // Si alguien se quedó sin fichas
    if (s.players.some(pl => pl.hand.length === 0)) break;
  }
  // Resultado: quien tenga menos puntos en mano gana
  const totalPts = s.players.map(p => p.hand.reduce((a, t) => a + tileValue(t), 0));
  const minPts = Math.min(...totalPts);
  const winners = s.players.filter((_, i) => totalPts[i] === minPts);
  const currentIdx = s.players.indexOf(s.players[s.turn % s.players.length]);
  const curPts = totalPts[currentIdx];
  // Retorna diferencia de puntos (negativo = bueno para el actual)
  return curPts - minPts;
}

// Análisis GTO de una jugada: simula N partidas desde después de jugarla
function analyzeMove(state, tile, side, simulations = 800) {
  const s = deepCloneState(state);
  const p = s.currentPlayer();
  const ok = E.applyMove(s, p, tile, side);
  if (!ok) return null;

  let totalDiff = 0;
  for (let i = 0; i < simulations; i++)
    totalDiff += simulateToEnd(s);

  const avgDiff = totalDiff / simulations;
  // Normalizar: mientras más negativo, mejor para quien juega
  // EV se presenta como "ventaja esperada": -avgDiff
  const ev = -avgDiff;
  return {
    tile: tile.slice(),
    side,
    ev: Math.round(ev * 100) / 100,
    simulations,
    winRate: Math.round((simulateToEnd(s) < 0 ? 1 : 0) * 100), // aprox
  };
}

// Analiza todas las jugadas legales del jugador actual
function analyzeAll(state, simulations = 800) {
  const p = state.currentPlayer();
  const moves = E.legalMoves(p.hand, state.board);
  if (!state.board.length) {
    // Primera jugada: cada ficha de la mano es una opción
    return moves.map(t => {
      const s = deepCloneState(state);
      E.applyMove(s, p, t, 'right');
      let diff = 0;
      for (let i = 0; i < simulations; i++) diff += simulateToEnd(s);
      return { tile: t.slice(), side: 'right', ev: Math.round((-diff / simulations) * 100) / 100, simulations };
    }).sort((a, b) => b.ev - a.ev);
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
  return results.sort((a, b) => b.ev - a.ev);
}

// Exponer en navegador (window.Coach) y en Node (module.exports)
const Coach = { tileValue, simulateToEnd, analyzeMove, analyzeAll };
if (typeof module !== 'undefined' && module.exports) module.exports = Coach;
if (typeof window !== 'undefined') window.Coach = Coach;
