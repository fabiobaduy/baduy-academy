/* ============================================================
 * Baduy Academy — Benchmark de algoritmos
 * Enfrenta las estrategias entre sí para medir cuál es mejor:
 *  - Random: juega al azar (baseline)
 *  - Heuristic: elige la jugada con mejor evaluador (1-ply)
 *  - MCTS: Monte Carlo Tree Search (400 iteraciones)
 * Gana quien acumule más puntos al final de cada ronda.
 * ============================================================ */
const E = require('./engine.js');
const Eval = require('./eval.js');
const MCTS = require('./mcts.js');

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

// Estrategias: reciben (state, playerIdx) → {tile, side} | null
const STRATEGIES = {
  random(state, playerIdx) {
    const p = state.players[playerIdx];
    const moves = E.legalMoves(p.hand, state.board);
    if (!moves.length) return null;
    const m = moves[Math.floor(Math.random() * moves.length)];
    return { tile: m, side: state.board.length ? (Math.random() < 0.5 ? 'left' : 'right') : 'right' };
  },
  heuristic(state, playerIdx) {
    const p = state.players[playerIdx];
    const moves = E.legalMoves(p.hand, state.board);
    if (!moves.length) return null;
    let best = null, bestScore = -Infinity;
    for (const m of moves) {
      const ends = state.boardEnds();
      const sides = state.board.length ? ['left', 'right'] : ['right'];
      for (const side of sides) {
        const s = deepCloneState(state);
        const ok = E.applyMove(s, s.players[playerIdx], m, side);
        if (!ok) continue;
        const sc = Eval.evaluateState(s, playerIdx);
        if (sc > bestScore) { bestScore = sc; best = { tile: m, side }; }
      }
    }
    return best;
  },
  mcts(state, playerIdx) {
    const s = deepCloneState(state);
    // Forzar turno al jugador indicado (por si el estado está en otro turno)
    s.turn = playerIdx;
    const result = MCTS.findBestMove(s, 250, playerIdx);
    return result ? { tile: result.tile, side: result.side } : null;
  },
};

// Juega una partida completa con estrategias asignadas a cada posición
function playGame(assignments, verbose = false) {
  const players = [0, 1, 2, 3].map(i => new E.Player(`P${i}`, (i % 2) + 1));
  E.dealTiles(players);
  const state = new E.GameState(players);

  let plies = 0;
  while (plies < 200) {
    const idx = state.turn % 4;
    const strat = assignments[idx];
    const p = state.players[idx];
    const move = STRATEGIES[strat](state, idx);

    if (!move) {
      state.passed.push(p.name);
      if (state.passed.length >= 4) break;
    } else {
      const ok = E.applyMove(state, p, move.tile, move.side);
      if (!ok) { state.passed.push(p.name); }
      else { if (verbose) console.log(`${p.name} (${strat}) juega ${JSON.stringify(move.tile)} ${move.side}`); }
    }
    state.advanceTurn();
    plies++;
    if (players.some(pl => pl.hand.length === 0)) break;
  }

  // Puntaje: quien tenga menos puntos en mano gana la ronda
  const totals = players.map(p => p.hand.reduce((a, t) => a + t[0] + t[1], 0));
  const min = Math.min(...totals);
  const winners = totals.map((t, i) => (t === min ? i : -1)).filter(i => i >= 0);
  const points = totals.map((t, i) => (winners.includes(i) ? 1 : 0));

  if (verbose) {
    console.log('Puntos en mano:', totals);
    console.log('Ganador(es):', winners.map(i => `P${i} (${assignments[i]})`));
  }
  return points; // [p0, p1, p2, p3]
}

// Torneo: N partidas, acumulando victorias por estrategia
function tournament(assignments, games = 50, verbose = false) {
  const scores = { random: 0, heuristic: 0, mcts: 0 };
  for (let g = 0; g < games; g++) {
    const pts = playGame(assignments, false);
    assignments.forEach((strat, i) => { if (pts[i]) scores[strat]++; });
  }
  return scores;
}

module.exports = { STRATEGIES, playGame, tournament };

// Si se ejecuta directamente: benchmark rápido
if (require.main === module) {
  console.log('=== BENCHMARK: MCTS vs Heuristic vs Random (30 partidas) ===\n');

  // MCTS en P0, Heuristic en P1, Random en P2 y P3
  const a1 = ['mcts', 'heuristic', 'random', 'random'];
  const s1 = tournament(a1, 30);
  console.log('Config 1 (MCTS vs Heuristic, 2 Random):');
  console.log('  MCTS:', s1.mcts, '| Heuristic:', s1.heuristic, '| Random:', s1.random);

  // Heuristic en P0, Random en el resto
  const a2 = ['heuristic', 'random', 'random', 'random'];
  const s2 = tournament(a2, 30);
  console.log('\nConfig 2 (Heuristic vs 3 Random):');
  console.log('  Heuristic:', s2.heuristic, '| Random:', s2.random);

  // MCTS en P0, Random en el resto
  const a3 = ['mcts', 'random', 'random', 'random'];
  const s3 = tournament(a3, 30);
  console.log('\nConfig 3 (MCTS vs 3 Random):');
  console.log('  MCTS:', s3.mcts, '| Random:', s3.random);
}
