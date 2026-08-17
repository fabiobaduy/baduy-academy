/* ============================================================
 * Baduy Academy — Notación de mano (nomenclatura del dominó)
 * ============================================================
 * Convierte el historial de una partida en la notación estándar:
 *   A66, B65, C55, D51, A16(6), B P
 *
 * Reglas:
 *   - Letra = jugador (A/B/C/D en orden de asiento)
 *   - Número = ficha jugada (sin separador: A66 = A juega 6-6)
 *   - (n) = la ficha "cuadró" el palo n (ambos extremos quedaron en n)
 *   - "P" = el jugador pasó
 *   - La PRIMERA ficha nunca es cuadre (no hay dos extremos aún)
 * ============================================================ */
const E = (typeof window !== 'undefined') ? window.Engine : require('./engine.js');

// Reconstruye la secuencia completa (jugadas + pases en orden real)
function readHand(state) {
  const nPlayers = state.players.length;
  const nameToLetter = {};
  state.players.forEach((p, i) => { nameToLetter[p.name] = 'ABCD'[i]; });

  // Reconstruir el tablero jugada a jugada para saber extremos
  const emptyPlayers = state.players.map((p, i) => new E.Player(p.name, p.teamId));
  const replay = new E.GameState(emptyPlayers);

  // Timeline: intercalar jugadas y pases en orden real.
  // El historial tiene las jugadas; los pases hay que reconstruirlos:
  // cuando un jugador no tiene jugadas legales en su turno, pasa.
  const parts = [];
  let historyIdx = 0;

  // Reconstruimos turno a turno desde el inicio (turno 0).
  // Usamos el historial como fuente de jugadas y detectamos pases.
  const replayTurn = 0;
  const replayPassed = new Set();

  // Enfoque: recorrer turnos, si la siguiente jugada del historial
  // corresponde al jugador de turno, es jugada; si no, pasó.
  let turn = 0;
  const maxTurns = state.history.length + nPlayers * 3 + 10;
  for (let t = 0; t < maxTurns && historyIdx < state.history.length; t++) {
    const playerIdx = turn % nPlayers;
    const playerName = state.players[playerIdx].name;
    const next = state.history[historyIdx];

    if (next && next.player === playerName) {
      // Jugada real
      const letter = nameToLetter[playerName] || '?';
      const tile = next.tile;

      // Aplicar al replay para conocer extremos
      const pObj = replay.players[playerIdx];
      pObj.hand.push(tile);
      const ok = E.applyMove(replay, pObj, tile, next.side);
      if (!ok) {
        if (!replay.board.length) replay.board.push([tile[0], tile[1]]);
        else if (next.side === 'left') replay.board.unshift([tile[0], tile[1]]);
        else replay.board.push([tile[0], tile[1]]);
      }

      // ¿Cuadre? Solo si ya había fichas antes (2 extremos) y ahora son iguales
      const ends = replay.boardEnds();
      let cuadre = null;
      if (replay.board.length >= 2 && ends && ends[0] === ends[1]) {
        cuadre = ends[0];
      }

      const tileStr = `${tile[0]}${tile[1]}`;
      parts.push(`${letter}${tileStr}${cuadre !== null ? `(${cuadre})` : ''}`);
      historyIdx++;
    } else {
      // Pase: este jugador no tenía jugadas en su turno
      const letter = nameToLetter[playerName] || '?';
      parts.push(`${letter} P`);
    }
    turn++;
  }

  // Pases finales (si quedaron registrados al terminar)
  state.passed.forEach(pname => {
    const letter = nameToLetter[pname] || '?';
    if (!parts.includes(`${letter} P`)) parts.push(`${letter} P`);
  });

  return parts.join(', ');
}

// Notación de UNA jugada individual (para el panel en vivo)
function moveNotation(letter, tile, side, prevEnds) {
  const tileStr = `${tile[0]}${tile[1]}`;
  let cuadre = null;
  if (prevEnds) {
    const end = side === 'left' ? prevEnds[0] : prevEnds[1];
    const other = tile[0] === end ? tile[1] : tile[0];
    const otherEnd = side === 'left' ? prevEnds[1] : prevEnds[0];
    if (other === otherEnd) cuadre = other;
  }
  return `${letter}${tileStr}${cuadre !== null ? `(${cuadre})` : ''}`;
}

const Notation = { readHand, moveNotation };
if (typeof module !== 'undefined' && module.exports) module.exports = Notation;
if (typeof window !== 'undefined') window.Notation = Notation;
