/* ============================================================
 * Baduy Academy — Validación del detector anti-señas
 * Simula partidas de parejas HONESTAS vs COLUDIDAS y verifica
 * que el detector las distinga estadísticamente.
 *
 * Estrategias:
 *  - Honesta: elige la jugada con mejor EV (heurístico).
 *  - Coludida: con probabilidad p, elige una jugada subóptima
 *    que maximiza el beneficio al compañero (como si supiera
 *    lo que el compañero tiene).
 * ============================================================ */
const E = require('./engine.js');
const Eval = require('./eval.js');
const Detector = require('./detector.js');

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

// Jugada óptima (heurística)
function bestMove(state, playerIdx) {
  const options = Detector.analyzeOptions(state, playerIdx);
  return options.length ? options[0] : null;
}

// Jugada coludida: el patrón REAL de señas
// El coludido NO hace jugadas absurdas (eso lo delataría al instante).
// Hace jugadas que parecen razonables (2ª o 3ª mejor opción) pero
// que solo tienen sentido con información oculta del compañero.
function collusiveMove(state, playerIdx) {
  const p = state.players[playerIdx];
  const moves = E.legalMoves(p.hand, state.board);
  if (!moves.length) return null;

  const teammateIdx = state.players.findIndex(x => x.teamId === p.teamId && x.name !== p.name);
  const options = Detector.analyzeOptions(state, playerIdx);
  if (!options.length) return null;

  // El coludido considera las 3 mejores opciones para él (no absurdas)
  const candidates = options.slice(0, 3);

  // De esas, elige la que más beneficia al compañero
  let best = null, bestTeammate = -Infinity;
  for (const opt of candidates) {
    const s = deepCloneState(state);
    const ok = E.applyMove(s, s.players[playerIdx], opt.tile, opt.side);
    if (!ok) continue;
    const teammateScore = Eval.evaluateState(s, teammateIdx);
    if (teammateScore > bestTeammate) {
      bestTeammate = teammateScore;
      best = { tile: opt.tile, side: opt.side };
    }
  }
  return best;
}

// Juega una partida completa, alimentando al detector en cada jugada
function playDetected(assignments, colludeProb = 0, verbose = false) {
  // assignments: ['honest'|'collude', ...] por jugador
  const players = [0, 1, 2, 3].map(i => new E.Player(`P${i}`, (i % 2) + 1));
  E.dealTiles(players);
  const state = new E.GameState(players);
  const log = new Detector.MatchLog('test', players);
  const engine = new Detector.SuspicionEngine({ minMoves: 6 }); // partidas cortas para test

  let plies = 0;
  while (plies < 150) {
    const idx = state.turn % 4;
    const p = state.players[idx];
    const strat = assignments[idx];
    let move = null;

    if (strat === 'collude' && Math.random() < colludeProb) {
      move = collusiveMove(state, idx);
    } else {
      move = bestMove(state, idx);
    }

    if (!move || !E.legalMoves(p.hand, state.board).length) {
      state.passed.push(p.name);
      if (state.passed.length >= 4) break;
    } else {
      // Alimentar detector ANTES de aplicar la jugada (necesita el estado pre-jugada)
      engine.processMove(state, idx, move.tile, move.side, log);
      const ok = E.applyMove(state, p, move.tile, move.side);
      if (!ok) { state.passed.push(p.name); }
    }
    state.advanceTurn();
    plies++;
    if (players.some(pl => pl.hand.length === 0)) break;
  }

  return { log, report: engine.report() };
}

// ---- Torneo de validación ----
function validate(honestGames = 20, colludeGames = 20, colludeProb = 0.5, verbose = false) {
  // Todas las configuraciones: P0 honesto siempre (referencia)
  const honestAssign = ['honest', 'honest', 'honest', 'honest'];
  // Colusión en el equipo 1 (P0 y P2)
  const colludeAssign = ['collude', 'honest', 'collude', 'honest'];

  console.log('=== VALIDACIÓN DEL DETECTOR ANTI-SEÑAS ===\n');

  // 1. Parejas honestas
  console.log(`--- Parejas HONESTAS (${honestGames} partidas) ---`);
  let honestSusp = 0, honestDisq = 0;
  for (let g = 0; g < honestGames; g++) {
    const { report } = playDetected(honestAssign, 0);
    for (const teamId of Object.keys(report)) {
      const v = report[teamId];
      if (v.status === 'sospechoso') honestSusp++;
      if (v.status === 'descalificacion') honestDisq++;
    }
  }
  console.log(`Sospechosas: ${honestSusp} (${Math.round(honestSusp / (honestGames * 2) * 100)}%)`);
  console.log(`Descalificadas: ${honestDisq} (${Math.round(honestDisq / (honestGames * 2) * 100)}%)`);
  console.log('→ Ideal: 0% (falsos positivos)\n');

  // 2. Parejas coludidas
  console.log(`--- Parejas COLUDIDAS (${colludeGames} partidas, prob=${colludeProb}) ---`);
  let colludeSusp = 0, colludeDisq = 0;
  for (let g = 0; g < colludeGames; g++) {
    const { report } = playDetected(colludeAssign, colludeProb);
    // Solo mirar el equipo 1 (el coludido)
    const v = report['1'];
    if (v.status === 'sospechoso') colludeSusp++;
    if (v.status === 'descalificacion') colludeDisq++;
  }
  console.log(`Sospechosas: ${colludeSusp} (${Math.round(colludeSusp / colludeGames * 100)}%)`);
  console.log(`Descalificadas: ${colludeDisq} (${Math.round(colludeDisq / colludeGames * 100)}%)`);
  console.log('→ Ideal: 100% (verdaderos positivos)\n');

  console.log('=== RESUMEN ===');
  console.log(`Falsos positivos (honestos acusados): ${Math.round(honestSusp / (honestGames * 2) * 100)}%`);
  console.log(`Verdaderos positivos (coludidos detectados): ${Math.round(colludeSusp / colludeGames * 100)}%`);
}

// Ejemplo de una partida detallada
function exampleGame() {
  console.log('\n=== EJEMPLO: Partida con colusión (prob=0.8) ===');
  const colludeAssign = ['collude', 'honest', 'collude', 'honest'];
  const { log, report } = playDetected(colludeAssign, 0.8);
  console.log('Jugadas registradas:', log.moves.length);
  const team1 = report['1'];
  console.log('Veredicto equipo 1:', JSON.stringify(team1, null, 2));
  if (team1.flags && team1.flags.length) {
    console.log('Jugadas sospechosas detectadas:');
    team1.flags.slice(0, 5).forEach(f => {
      console.log(`  Turno ${f.turn}: ${f.playerName} jugó [${f.tile}] gap=${f.gap.toFixed(2)} beneficio=${f.benefit.toFixed(2)}`);
    });
  }
}

if (require.main === module) {
  validate(15, 15, 0.5, false);
  exampleGame();
}

module.exports = { playDetected, validate, collusiveMove, bestMove };
