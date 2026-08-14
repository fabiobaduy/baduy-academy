/* ============================================================
 * Baduy Academy — Sistema de Punteo (Scoring) del Dominó
 * ============================================================
 * Dos modalidades oficiales:
 *
 * 1) CONTÁNDOLAS TODAS (Todas)
 *    - Dominada: el equipo ganador suma las fichas de los 2
 *      contrarios + las fichas restantes de su propio compañero.
 *    - Tranca: gana la pareja con MENOS tantos, pero suma a su
 *      cuenta TODOS los tantos no jugados (los 4 jugadores).
 *
 * 2) SOLO CONTRARIOS
 *    - Dominada: el equipo ganador suma solo las fichas de los
 *      2 contrarios.
 *    - Tranca: el equipo ganador suma solo los tantos del equipo
 *      perdedor.
 *
 * Retorna: { equipoGanador: teamId, puntos: N, modalidad, tipo }
 * ============================================================ */
const E = require('./engine.js');

function tileValue(t) { return t[0] + t[1]; }

// Suma de tantos de un jugador (fichas en mano)
function handPoints(player) {
  return player.hand.reduce((a, t) => a + tileValue(t), 0);
}

// Suma de tantos de un equipo (2 jugadores)
function teamPoints(state, teamId) {
  return state.players
    .filter(p => p.teamId === teamId)
    .reduce((a, p) => a + handPoints(p), 0);
}

// ¿La mano terminó por dominada (alguien sin fichas)?
function isDominada(state) {
  return state.players.some(p => p.hand.length === 0);
}

// ¿La mano terminó por tranca (bloqueada)?
function isTranca(state) {
  return state.passed.length >= state.players.length &&
         !state.players.some(p => p.hand.length === 0);
}

// Equipo del jugador que dominó (se quedó sin fichas)
function dominadaTeam(state) {
  const empty = state.players.find(p => p.hand.length === 0);
  return empty ? empty.teamId : null;
}

// Punteo principal
// modalidad: 'todas' | 'solo_contrarios'
function scoreHand(state, modalidad = 'todas') {
  const nPlayers = state.players.length;
  const teams = [...new Set(state.players.map(p => p.teamId))];

  // ---- Dominada ----
  if (isDominada(state)) {
    const winnerTeam = dominadaTeam(state);
    // Fichas de los contrarios
    const opponents = state.players.filter(p => p.teamId !== winnerTeam);
    const oppPoints = opponents.reduce((a, p) => a + handPoints(p), 0);

    if (modalidad === 'solo_contrarios') {
      return {
        tipo: 'dominada',
        modalidad,
        equipoGanador: winnerTeam,
        puntos: oppPoints,
        detalle: `Dominada · Solo contrarios: ${oppPoints} tantos`,
      };
    }

    // 'todas': + fichas del compañero
    const teammate = state.players.find(p => p.teamId === winnerTeam && p.hand.length > 0);
    const matePoints = teammate ? handPoints(teammate) : 0;
    return {
      tipo: 'dominada',
      modalidad,
      equipoGanador: winnerTeam,
      puntos: oppPoints + matePoints,
      detalle: `Dominada · Todas: contrarios ${oppPoints} + compañero ${matePoints} = ${oppPoints + matePoints}`,
    };
  }

  // ---- Tranca ----
  if (isTranca(state)) {
    // Equipo con menos tantos gana
    const teamTotals = teams.map(tid => ({ tid, pts: teamPoints(state, tid) }));
    teamTotals.sort((a, b) => a.pts - b.pts);
    const winner = teamTotals[0];
    const loser = teamTotals[1];

    if (modalidad === 'solo_contrarios') {
      return {
        tipo: 'tranca',
        modalidad,
        equipoGanador: winner.tid,
        puntos: loser.pts,
        detalle: `Tranca · Solo contrarios: perdedores ${loser.pts} tantos`,
      };
    }

    // 'todas': todos los tantos no jugados
    const allPoints = state.players.reduce((a, p) => a + handPoints(p), 0);
    return {
      tipo: 'tranca',
      modalidad,
      equipoGanador: winner.tid,
      puntos: allPoints,
      detalle: `Tranca · Todas: ${allPoints} tantos (${winner.tid === teams[0] ? 'Eq A' : 'Eq B'} gana con menos)`,
    };
  }

  return null; // la mano no ha terminado
}

module.exports = { tileValue, handPoints, teamPoints, isDominada, isTranca, dominadaTeam, scoreHand };
if (typeof window !== 'undefined') window.Scoring = module.exports;
