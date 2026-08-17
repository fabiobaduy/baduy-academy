/* ============================================================
 * Baduy Academy — Motor de Dominó (port de dominogto_fase1-3.py)
 * Fiel al motor original de Fabio Baduy, reescrito en JS.
 * ============================================================ */

// ---- Tipos: ficha = [a, b] con a <= b ----
const ALL_TILES = [];
for (let i = 0; i <= 6; i++)
  for (let j = i; j <= 6; j++)
    ALL_TILES.push([i, j]);

class Player {
  constructor(name, teamId) {
    this.name = name;
    this.teamId = teamId;
    this.hand = [];
  }
}

class GameState {
  constructor(players) {
    this.players = players;
    this.board = [];            // fichas en el tablero (con orientación)
    this.history = [];          // {player, tile, side}
    this.turn = 0;
    this.passed = [];
    this.scores = players.map(() => 0);
  }
  currentPlayer() {
    return this.players[this.turn % this.players.length];
  }
  boardEnds() {
    if (!this.board.length) return null;
    return [this.board[0][0], this.board[this.board.length - 1][1]];
  }
  advanceTurn() {
    this.turn = (this.turn + 1) % this.players.length;
  }

  // ---- Detección de TRANCA (reglas del Campeón Mundial) ----
  // Regla 1: 4 pases consecutivos (uno de cada jugador, sin jugadas
  //          entre medio) → el juego está trancado.
  // Regla 2: Ambos extremos con la MISMA pinta Y las 7 fichas de esa
  //          pinta ya jugadas (6 mixtas + el doble) → tranca segura.
  isTrancado() {
    // Regla 1: 4 pases consecutivos = los últimos 4 turnos fueron pases
    if (this.passed.length >= this.players.length) return true;

    // Regla 2: pinta completa en ambos extremos
    if (this.board.length >= 2) {
      const ends = this.boardEnds();
      if (ends[0] === ends[1]) {
        const pinta = ends[0];
        // Contar FICHAS de esa pinta en el tablero (6 mixtas + el doble = 7)
        // Un doble de la pinta cuenta como 1 ficha (no 2 pips)
        const fichasPinta = this.board.filter(t => t[0] === pinta || t[1] === pinta).length;
        // Regla del campeón: 7 fichas de la pinta jugadas = 6 mixtas + doble
        if (fichasPinta >= 7) return true;
      }
    }
    return false;
  }
}

function dealTiles(players) {
  const tiles = ALL_TILES.slice();
  // Fisher-Yates shuffle
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  players.forEach(p => (p.hand = []));
  for (let i = 0; i < 28; i++)
    players[i % players.length].hand.push(tiles[i]);
}

function legalMoves(hand, board) {
  if (!board.length) return hand.slice();
  const ends = [board[0][0], board[board.length - 1][1]];
  return hand.filter(t => t[0] === ends[0] || t[1] === ends[0] ||
                           t[0] === ends[1] || t[1] === ends[1]);
}

// Devuelve orientaciones posibles de una ficha en un extremo
function orientations(tile, end) {
  const out = [];
  if (tile[0] === end) out.push([tile[0], tile[1]]);
  if (tile[1] === end) out.push([tile[1], tile[0]]);
  return out;
}

function applyMove(state, player, tile, side = 'right') {
  const idx = player.hand.findIndex(t => t[0] === tile[0] && t[1] === tile[1]);
  if (idx === -1) return false;

  const ends = state.boardEnds();
  if (!state.board.length) {
    state.board.push([tile[0], tile[1]]);
  } else {
    const end = side === 'left' ? ends[0] : ends[1];
    const oris = orientations(tile, end);
    if (!oris.length) return false;
    let oriented = oris[0];
    // Orientación según el lado (clave para la cadena visual correcta):
    // - DERECHA (push): la ficha se añade al final. El primer número
    //   de la ficha debe conectar con el extremo derecho del tablero.
    //   orientations() pone `end` primero → [end, other]. ✓ sin invertir.
    // - IZQUIERDA (unshift): la ficha se inserta al inicio. El SEGUNDO
    //   número de la ficha debe conectar con el extremo izquierdo viejo
    //   (board[0][0]). Necesitamos [other, end] → INVERTIR [end, other].
    //   Ejemplo: tablero [2,2], jugar 4-2 a la izquierda → debe quedar
    //   [4,2] con el 2 tocando el doble (no [2,4] con el 4 tocando).
    if (side === 'left') oriented = [oriented[1], oriented[0]];
    if (side === 'left') state.board.unshift(oriented);
    else state.board.push(oriented);
  }

  player.hand.splice(idx, 1);
  state.history.push({ player: player.name, tile: [tile[0], tile[1]], side });
  state.passed = [];
  return true;
}

function canPlay(state) {
  return legalMoves(state.currentPlayer().hand, state.board).length > 0;
}

// ---- Evaluación heurística (para el árbol de decisión) ----
function evaluateState(state) {
  const current = state.currentPlayer();
  return -current.hand.length;
}

// Exponer en navegador (window.Engine) y en Node (module.exports)
// isTrancado: método de GameState (st.isTrancado()) — también se expone
// como función auxiliar para compatibilidad
const Engine = {
  ALL_TILES, Player, GameState, dealTiles, legalMoves,
  orientations, applyMove, canPlay, evaluateState,
  isTrancado: (st) => st.isTrancado(),
};
if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
if (typeof window !== 'undefined') window.Engine = Engine;
