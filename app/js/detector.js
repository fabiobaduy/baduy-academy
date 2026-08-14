/* ============================================================
 * Baduy Academy — Detector de juego sucio (anti-señas)
 * ============================================================
 * Objetivo: detectar parejas que se hacen señas ilegales.
 *
 * El principio es estadístico:
 *   Un jugador honesto elige la jugada con mejor EV (o cerca).
 *   Un coludido hace jugadas subóptimas que "milagrosamente"
 *   benefician a su compañero (porque sabe lo que tiene).
 *
 * Detector:
 *   1. Registra cada jugada real.
 *   2. Calcula el EV de TODAS las jugadas legales en ese momento.
 *   3. Mide el "gap": EV_óptimo − EV_jugado.
 *   4. Mide el "beneficio al compañero" de la jugada elegida.
 *   5. Acumula un score de sospecha por pareja.
 *   6. Aplica umbrales de descalificación con base estadística.
 * ============================================================ */
const E = require('./engine.js');
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

// ---- 1. REGISTRO DE PARTIDAS ----
// Un MatchLog guarda todas las jugadas de una partida.
class MatchLog {
  constructor(gameId, players) {
    this.gameId = gameId;
    this.players = players.map(p => ({ name: p.name, teamId: p.teamId }));
    this.moves = []; // {turn, playerName, tile, side, evOptimal, evPlayed, gap, teammateBenefit}
    this.boards = []; // snapshot del tablero en cada jugada (para análisis posterior)
  }

  recordMove(entry) {
    this.moves.push(entry);
  }
}

// ---- 2. ANÁLISIS EV POR JUGADA ----
// Calcula el EV de cada jugada legal (usando el evaluador heurístico,
// que es rápido y determinista). Retorna {tile, side, ev} ordenado.
function analyzeOptions(state, playerIdx) {
  const p = state.players[playerIdx];
  const moves = E.legalMoves(p.hand, state.board);
  const options = [];
  for (const t of moves) {
    const ends = state.boardEnds();
    const sides = state.board.length ? ['left', 'right'] : ['right'];
    for (const side of sides) {
      const s = deepCloneState(state);
      const ok = E.applyMove(s, s.players[playerIdx], t, side);
      if (!ok) continue;
      const ev = Eval.evaluateState(s, playerIdx);
      options.push({ tile: [t[0], t[1]], side, ev });
    }
  }
  options.sort((a, b) => b.ev - a.ev);
  return options;
}

// EV de una jugada específica
function evOfMove(state, playerIdx, tile, side) {
  const s = deepCloneState(state);
  const ok = E.applyMove(s, s.players[playerIdx], tile, side);
  if (!ok) return null;
  return Eval.evaluateState(s, playerIdx);
}

// ---- 3. GAP DE SOSPECHA ----
// gap = evOptimal − evPlayed. Normalizado a [0, 1] para comparar
// entre distintas situaciones (la escala de EV varía según la fase).
function normalizedGap(evOptimal, evPlayed, spread) {
  if (spread <= 0) return 0;
  return Math.max(0, Math.min(1, (evOptimal - evPlayed) / spread));
}

// ---- 4. BENEFICIO AL COMPAÑERO ----
// ¿Cuánto mejora la posición del COMPAÑERO con esta jugada,
// comparado con la jugada óptima del jugador?
function teammateBenefit(state, playerIdx, tile, side) {
  const me = state.players[playerIdx];
  const teammateIdx = state.players.findIndex(p => p.teamId === me.teamId && p.name !== me.name);
  if (teammateIdx === -1) return 0;

  // Estado del compañero si jugamos la jugada óptima (para mí)
  const sOpt = deepCloneState(state);
  E.applyMove(sOpt, sOpt.players[playerIdx], tile, side); // la jugada REAL (supuesta subóptima)
  const teammateScoreWithMyPlay = Eval.evaluateState(sOpt, teammateIdx);

  // Estado del compañero si se juega la jugada óptima para MÍ
  const options = analyzeOptions(state, playerIdx);
  const opt = options[0];
  const sOptBest = deepCloneState(state);
  E.applyMove(sOptBest, sOptBest.players[playerIdx], opt.tile, opt.side);
  const teammateScoreWithOptimal = Eval.evaluateState(sOptBest, teammateIdx);

  // Beneficio = cuánto MEJORA el compañero vs si yo jugara óptimo
  return teammateScoreWithMyPlay - teammateScoreWithOptimal;
}

// ---- 5. ANÁLISIS COMPLETO DE UNA JUGADA ----
// Registra la jugada, calcula gap y beneficio al compañero.
// `thinkTimeMs` es el tiempo de pensada del jugador antes de ejecutar.
// `moveType` es el tipo de jugada: 'regular' | 'cuadre' | 'tranca'
function analyzeMove(state, playerIdx, tile, side, log, thinkTimeMs = 0, moveType = 'regular') {
  const options = analyzeOptions(state, playerIdx);
  if (!options.length) return null;

  const evOptimal = options[0].ev;
  const evPlayed = evOfMove(state, playerIdx, tile, side);
  if (evPlayed === null) return null;

  // spread = rango de EVs de las opciones (para normalizar el gap)
  const spread = options[0].ev - options[options.length - 1].ev;
  const gap = normalizedGap(evOptimal, evPlayed, spread);
  const benefit = teammateBenefit(state, playerIdx, tile, side);

  const entry = {
    turn: state.history.length + 1,
    playerName: state.players[playerIdx].name,
    tile: [tile[0], tile[1]],
    side,
    evOptimal,
    evPlayed,
    gap,
    teammateBenefit: Math.round(benefit * 100) / 100,
    rank: options.findIndex(o => o.tile[0] === tile[0] && o.tile[1] === tile[1] && o.side === side) + 1,
    totalOptions: options.length,
    // Tiempo de pensada
    thinkTimeMs,
    moveType,
  };

  if (log) log.recordMove(entry);
  return entry;
}

// ---- 6. SCORE ACUMULATIVO POR PAREJA ----
// Cada jugada contribuye al score de la PAREJA (no del individuo),
// porque la colusión es un fenómeno de equipo.
class SuspicionEngine {
  constructor(config = {}) {
    this.config = {
      // Umbral de gap para considerar una jugada "sospechosa"
      gapThreshold: 0.45,
      // Peso del gap en el score
      gapWeight: 1.0,
      // Peso del beneficio al compañero
      benefitWeight: 2.0,
      // Mínimo de jugadas antes de emitir juicio (evita falsos positivos)
      minMoves: 10,
      // Nivel de confianza para "sospechoso"
      suspicionThreshold: 6,
      // Nivel para "descalificación"
      disqualifyThreshold: 12,
      // ---- Tiempos máximos de pensada (reglamento Federación) ----
      maxThinkTime: {
        regular: 15000,   // 15 s jugada regular
        cuadre: 30000,    // 30 s piedra de cuadre
        tranca: 60000,    // 60 s piedra de tranca
      },
      // Fracción del tiempo máximo que ya se considera "prolongado"
      // (sistemáticamente cerca del máximo = procesando señales)
      prolongedFraction: 0.8,
      // Peso de la sospecha por tiempo prolongado
      timeWeight: 1.2,
      ...config,
    };
    this.teamScores = {}; // teamId → {score, moves, flags, timeFlags}
  }

  processMove(state, playerIdx, tile, side, log, thinkTimeMs = 0, moveType = 'regular') {
    // state debe ser el estado ANTES de la jugada (sin aplicarla aún)
    const entry = analyzeMove(state, playerIdx, tile, side, log, thinkTimeMs, moveType);
    if (!entry) return null;

    const player = state.players[playerIdx];
    const teamId = player.teamId;

    if (!this.teamScores[teamId]) {
      this.teamScores[teamId] = { score: 0, moves: 0, flags: [], timeFlags: [] };
    }
    const team = this.teamScores[teamId];
    team.moves++;

    // ¿Excede el tiempo máximo permitido? (infracción reglamentaria)
    const maxTime = this.config.maxThinkTime[moveType] || this.config.maxThinkTime.regular;
    if (thinkTimeMs > maxTime) {
      team.timeFlags.push({
        turn: entry.turn,
        playerName: entry.playerName,
        moveType,
        thinkTimeMs,
        maxTime,
        type: 'exceso_tiempo',
      });
      team.score += 0.5; // infracción menor
    }

    // ¿Tiempo prolongado (cerca del máximo) en jugada REGULAR?
    // Sistemáticamente = procesando señales ilegales
    const prolonged = thinkTimeMs > maxTime * this.config.prolongedFraction;
    if (prolonged && moveType === 'regular') {
      team.timeFlags.push({
        turn: entry.turn,
        playerName: entry.playerName,
        thinkTimeMs,
        maxTime,
        type: 'pensada_prolongada',
      });
      // Solo suma sospecha si además la jugada beneficia al compañero
      if (entry.teammateBenefit > 0) {
        team.score += this.config.timeWeight * this.config.prolongedFraction;
      }
    }

    // ¿Jugada sospechosa? gap alto Y beneficio al compañero alto
    const isSuspicious = entry.gap >= this.config.gapThreshold &&
                         entry.teammateBenefit > 0;
    if (isSuspicious) {
      team.score += this.config.gapWeight * entry.gap +
                    this.config.benefitWeight * Math.max(0, entry.teammateBenefit);
      team.flags.push({
        turn: entry.turn,
        playerName: entry.playerName,
        tile: entry.tile,
        gap: entry.gap,
        benefit: entry.teammateBenefit,
        thinkTimeMs: entry.thinkTimeMs,
        moveType: entry.moveType,
      });
    }

    return entry;
  }

  verdict(teamId) {
    const team = this.teamScores[teamId];
    if (!team) return { status: 'sin_datos', score: 0, moves: 0 };

    const { score, moves } = team;
    const cfg = this.config;

    if (moves < cfg.minMoves) {
      return { status: 'muestra_insuficiente', score, moves, confidence: 0 };
    }

    // Normalizar score por jugada
    const avgScore = score / moves;
    let status = 'limpio';
    let confidence = 0;

    if (avgScore >= cfg.disqualifyThreshold / cfg.minMoves) {
      status = 'descalificacion';
      confidence = Math.min(0.99, avgScore * 1.2);
    } else if (avgScore >= cfg.suspicionThreshold / cfg.minMoves) {
      status = 'sospechoso';
      confidence = Math.min(0.9, avgScore);
    } else if (avgScore >= 0.3) {
      status = 'observacion';
      confidence = avgScore * 0.5;
    }

    return { status, score, moves, confidence: Math.round(confidence * 100) / 100, flags: team.flags, timeFlags: team.timeFlags };
  }

  report() {
    const out = {};
    for (const teamId of Object.keys(this.teamScores)) {
      out[teamId] = this.verdict(parseInt(teamId));
    }
    return out;
  }
}

module.exports = {
  MatchLog, analyzeOptions, evOfMove, normalizedGap,
  teammateBenefit, analyzeMove, SuspicionEngine,
};
