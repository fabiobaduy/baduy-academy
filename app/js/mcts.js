/* ============================================================
 * Baduy Academy — MCTS (Monte Carlo Tree Search)
 * El algoritmo estándar para juegos con información imperfecta.
 * Combina:
 *  - Sampler: manos probables de los rivales
 *  - Evaluador: heurística experta
 *  - UCT: balance entre exploración y explotación
 * ============================================================ */
const E = require('./engine.js');
const Sampler = require('./sampler.js');
const Eval = require('./eval.js');

// deep clone que preserva métodos
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

class MCTSNode {
  constructor(state, parent = null, move = null, playerIdx = null) {
    this.state = state;
    this.parent = parent;
    this.move = move;           // {tile, side}
    this.playerIdx = playerIdx; // quién hizo este move
    this.children = [];
    this.visits = 0;
    this.value = 0;             // suma de evaluaciones (desde perspectiva de root)
    this.untriedMoves = [];
  }
}

const UCT_C = 1.4; // constante de exploración

function legalMovesFor(state, playerIdx) {
  const p = state.players[playerIdx];
  return E.legalMoves(p.hand, state.board);
}

function bestUCT(child) {
  return child.value / (child.visits || 1) +
    UCT_C * Math.sqrt(Math.log(child.parent.visits + 1) / (child.visits || 1));
}

// Simula UNA partida desde un estado con manos muestreadas
function simulate(state, rootPlayerIdx) {
  const s = deepCloneState(state);
  let plies = 0;
  while (plies < 150) {
    const p = s.currentPlayer();
    const moves = E.legalMoves(p.hand, s.board);
    if (!moves.length) {
      s.passed.push(p.name);
      if (s.passed.length === s.players.length) break;
    } else {
      // Jugada semi-inteligente: mejor según evaluador (1-ply)
      let best = null, bestScore = -Infinity;
      for (const m of moves) {
        const ends = s.boardEnds();
        const sides = s.board.length ? ['left', 'right'] : ['right'];
        for (const side of sides) {
          const test = deepCloneState(s);
          const ok = E.applyMove(test, test.currentPlayer(), m, side);
          if (!ok) continue;
          const sc = Eval.evaluateState(test, s.turn % s.players.length);
          if (sc > bestScore) { bestScore = sc; best = { m, side }; }
        }
      }
      if (best) {
        E.applyMove(s, p, best.m, best.side);
      }
    }
    s.advanceTurn();
    plies++;
    if (s.players.some(pl => pl.hand.length === 0)) break;
  }
  // Evaluación final
  return Eval.evaluateState(s, rootPlayerIdx);
}

// Selección UCT
function select(node) {
  while (node.children.length) {
    if (node.untriedMoves.length) return node;
    node = node.children.reduce((a, b) => (bestUCT(b) > bestUCT(a) ? b : a));
  }
  return node;
}

// Expansión
function expand(node) {
  if (!node.untriedMoves.length) return node;
  const move = node.untriedMoves.pop();
  const s = deepCloneState(node.state);
  const p = s.currentPlayer();
  const ok = E.applyMove(s, p, move.tile, move.side);
  if (!ok) return node;
  const playerIdx = s.turn % s.players.length;
  s.advanceTurn();
  const child = new MCTSNode(s, node, move, playerIdx);
  child.untriedMoves = genMoves(s);
  node.children.push(child);
  return child;
}

function genMoves(state) {
  const p = state.currentPlayer();
  const moves = E.legalMoves(p.hand, state.board);
  if (!state.board.length) return moves.map(t => ({ tile: t, side: 'right' }));
  const out = [];
  for (const t of moves) {
    const ends = state.boardEnds();
    for (const side of ['left', 'right']) {
      const end = side === 'left' ? ends[0] : ends[1];
      if (E.orientations(t, end).length) out.push({ tile: t, side });
    }
  }
  return out;
}

// Rollout: simula hasta el final con políticas mixtas
function rollout(node, rootPlayerIdx) {
  return simulate(node.state, rootPlayerIdx);
}

function backpropagate(node, result) {
  while (node) {
    node.visits++;
    node.value += result;
    node = node.parent;
  }
}

// API principal: mejores jugadas con MCTS
function findBestMove(state, iterations = 400, rootPlayerIdx = state.turn % state.players.length) {
  const root = new MCTSNode(deepCloneState(state), null, null, rootPlayerIdx);
  root.untriedMoves = genMoves(root.state);
  if (!root.untriedMoves.length) return null;

  for (let i = 0; i < iterations; i++) {
    // 1. Seleccionar
    let node = select(root);
    // 2. Expandir
    node = expand(node);
    // 3. Simular
    const result = rollout(node, rootPlayerIdx);
    // 4. Retropropagar
    backpropagate(node, result);
  }

  // Mejor hijo por visitas (el más confiable)
  const ranked = root.children.slice().sort((a, b) => b.visits - a.visits);
  if (!ranked.length) return null;

  const best = ranked[0];
  return {
    tile: best.move.tile,
    side: best.move.side,
    visits: best.visits,
    ev: Math.round((best.value / best.visits) * 100) / 100,
    totalIterations: iterations,
  };
}

module.exports = { findBestMove, MCTSNode };
