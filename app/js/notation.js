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
 * ============================================================ */
const E = require('./engine.js');

// Reconstruye la secuencia jugada a jugada y genera la notación
function readHand(state) {
  const nPlayers = state.players.length;
  // Mapear nombre → letra (por índice de asiento)
  const nameToLetter = {};
  state.players.forEach((p, i) => { nameToLetter[p.name] = 'ABCD'[i]; });

  const parts = [];

  // Reconstruir: estado vacío, aplicamos cada jugada del historial
  // para conocer los extremos del tablero en cada momento.
  const emptyPlayers = state.players.map((p, i) => new E.Player(p.name, p.teamId));
  const replay = new E.GameState(emptyPlayers);
  // Nota: las manos ya no importan — solo reconstruimos el tablero.
  // Los movimientos del historial tienen la ficha y el lado.

  for (let h = 0; h < state.history.length; h++) {
    const entry = state.history[h];
    const letter = nameToLetter[entry.player] || '?';
    const tile = entry.tile;

    // Reconstruir el estado de ese momento
    // (aplicar las jugadas anteriores si no lo hemos hecho)
    // Aplicamos SOLO si la jugada es la siguiente en el replay
    // (el historial ya está ordenado)

    // Aplicar la jugada al replay
    const playerObj = replay.players.find(p => p.name === entry.player);
    // Para reconstruir el tablero necesitamos dar la ficha al jugador
    // en el replay. Las manos no importan: la ponemos temporalmente.
    playerObj.hand.push(tile);
    const ok = E.applyMove(replay, playerObj, tile, entry.side);
    if (!ok) {
      // Fallback: insertar directamente en el tablero
      if (!replay.board.length) replay.board.push([tile[0], tile[1]]);
      else if (entry.side === 'left') replay.board.unshift([tile[0], tile[1]]);
      else replay.board.push([tile[0], tile[1]]);
    }

    // Determinar si cuadró: tras la jugada, ¿ambos extremos son iguales?
    const ends = replay.boardEnds();
    let cuadre = null;
    if (ends && ends[0] === ends[1]) {
      cuadre = ends[0];
    }

    // Notación de la ficha: concatenar números (ej: 6-6 → "66", 1-6 → "16")
    const tileStr = `${tile[0]}${tile[1]}`;
    parts.push(`${letter}${tileStr}${cuadre !== null ? `(${cuadre})` : ''}`);
  }

  // Añadir los pases registrados en orden aproximado:
  // Los pases se registran en state.passed (nombres). Pero el orden
  // exacto requiere reconstruir. Añadimos los pases del estado actual
  // al final con la letra correspondiente.
  state.passed.forEach(pname => {
    const letter = nameToLetter[pname] || '?';
    parts.push(`${letter} P`);
  });

  return parts.join(', ');
}

// Notación de UNA jugada individual (para el panel en vivo)
function moveNotation(letter, tile, side, prevEnds) {
  // prevEnds: extremos ANTES de la jugada
  const tileStr = `${tile[0]}${tile[1]}`;
  // Simular el cuadre: conocemos el extremo donde se jugó
  let cuadre = null;
  if (prevEnds) {
    const end = side === 'left' ? prevEnds[0] : prevEnds[1];
    // Si la ficha conecta por `end`, el nuevo extremo de ese lado es el otro número
    const other = tile[0] === end ? tile[1] : tile[0];
    const otherEnd = side === 'left' ? prevEnds[1] : prevEnds[0];
    if (other === otherEnd) cuadre = other;
  }
  return `${letter}${tileStr}${cuadre !== null ? `(${cuadre})` : ''}`;
}

module.exports = { readHand, moveNotation };
if (typeof window !== 'undefined') window.Notation = module.exports;
