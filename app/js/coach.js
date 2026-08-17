(function(){
/* ============================================================
 * Baduy Academy — Coach GTO: análisis de jugadas con EV
 * Calcula el Valor Esperado de cada jugada legal mediante
 * simulación Monte Carlo del final de la partida.
 *
 * EV = puntos que el equipo del viewer GANA (+) o PIERDE (-)
 * en promedio con cada decisión, usando el punteo real:
 *   - Dominada: el equipo del que dominó cobra (contrarios
 *     [+ compañero si modalidad 'todas'])
 *   - Tranca: gana el equipo con menos tantos
 * EV positivo = ganas puntos; EV negativo = los pierdes.
 * ============================================================ */
const Engine = (typeof window !== 'undefined') ? window.Engine : require('./engine.js');
const SamplerM = (typeof window !== 'undefined') ? window.Sampler : require('./sampler.js');
const Scoring = (typeof window !== 'undefined') ? window.Scoring : require('./scoring.js');
const Worlds = (typeof window !== 'undefined') ? window.Worlds : require('./worlds.js');

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
// Devuelve el RESULTADO NETO desde la perspectiva del equipo del viewer:
//   +puntos = el equipo del viewer GANÓ y cobró N tantos
//   -puntos = el equipo del viewer PERDIÓ y pagó N tantos
// Usa el punteo real (scoring.js) con la modalidad indicada.
//
// IMPORTANTE: los rivales juegan RACIONALMENTE (heurística experta),
// NO al azar. Esto hace que el EV sea el de una partida real contra
// jugadores competentes, no contra ruido aleatorio.
function simulateToEnd(state, viewerIdx, modalidad = 'todas', maxPlies = 60, world = null) {
  const s = deepCloneState(state);

  // Si hay un mundo definido (manos de rivales ya fijadas), usarlo
  if (world) {
    for (const [idx, hand] of Object.entries(world)) {
      s.players[parseInt(idx)].hand = hand.map(t => [t[0], t[1]]);
    }
  }

  for (let i = 0; i < maxPlies; i++) {
    const p = s.currentPlayer();
    const moves = Engine.legalMoves(p.hand, s.board);
    if (!moves.length) {
      s.recordPass(p.name);
      // TRANCA (regla del campeón): 4 pases consecutivos (uno de cada
      // jugador) o pinta completa en ambos extremos
      if (s.isTrancado()) break;
    } else {
      // JUGADA RACIONAL: elegir la mejor opción con heurística experta
      const m = chooseRationalMove(s, p, moves);
      const ends = s.boardEnds();
      // Lado: preferir el que no crea un extremo que no puedo cubrir
      const side = chooseSide(s, p, m, ends);
      const ok = Engine.applyMove(s, p, m, side);
      if (!ok) s.recordPass(p.name);
    }
    s.advanceTurn();
    // Si alguien se quedó sin fichas
    if (s.players.some(pl => pl.hand.length === 0)) break;
  }

  // Punteo real de la mano
  const result = Scoring.scoreHand(s, modalidad);
  if (!result) return 0; // mano no terminó (no debería pasar)

  const viewerTeam = s.players[viewerIdx].teamId;
  const gained = result.equipoGanador === viewerTeam ? result.puntos : -result.puntos;
  return gained;
}

// Elige la jugada racional: minimiza el peso de la mano resultante
// y maximiza el control de palos (heurística experta del dominó).
function chooseRationalMove(state, player, moves) {
  let best = null;
  let bestScore = -Infinity;
  for (const m of moves) {
    const ends = state.boardEnds();
    if (!state.board.length) {
      // Primera jugada: salir con el doble más alto o la ficha más pesada
      const score = (m[0] === m[1] ? m[0] * 10 : 0) + m[0] + m[1];
      if (score > bestScore) { bestScore = score; best = m; }
      continue;
    }
    // Para cada lado posible, simular el efecto
    for (const side of ['left', 'right']) {
      const end = side === 'left' ? ends[0] : ends[1];
      if (!Engine.orientations(m, end).length) continue;
      // Puntaje: soltar fichas pesadas es bueno; quedarse con dobles del
      // palo en juego es malo; crear extremos que no controlas es malo
      let score = 0;
      // Soltar ficha pesada = bueno (menos puntos en mano)
      score += (m[0] + m[1]) * 0.5;
      // El palo que generas: si no tienes más de ese palo, es peligroso
      const gen = (m[0] === end) ? m[1] : m[0];
      const hasGen = player.hand.some(t => t !== m && (t[0] === gen || t[1] === gen));
      if (!hasGen) score -= 4; // dejas un palo que no controlas
      // Si el otro extremo es un palo que no tienes, peligro futuro
      const otherEnd = side === 'left' ? ends[1] : ends[0];
      const hasOther = player.hand.some(t => t !== m && (t[0] === otherEnd || t[1] === otherEnd));
      if (!hasOther) score -= 2;
      // Ficha doble: controla el palo
      if (m[0] === m[1]) score += 3;
      if (score > bestScore) { bestScore = score; best = m; }
    }
  }
  return best || moves[0];
}

// Elige el lado de la jugada: el que mantenga control
function chooseSide(state, player, tile, ends) {
  if (!state.board.length) return 'right';
  const leftOk = Engine.orientations(tile, ends[0]).length > 0;
  const rightOk = Engine.orientations(tile, ends[1]).length > 0;
  if (leftOk && rightOk) {
    // Preferir el lado cuyo palo generado controlo mejor
    const leftGen = (tile[0] === ends[0]) ? tile[1] : tile[0];
    const rightGen = (tile[0] === ends[1]) ? tile[1] : tile[0];
    const hasL = player.hand.some(t => t !== tile && (t[0] === leftGen || t[1] === leftGen));
    const hasR = player.hand.some(t => t !== tile && (t[0] === rightGen || t[1] === rightGen));
    if (hasL && !hasR) return 'left';
    if (hasR && !hasL) return 'right';
    return 'right'; // empate: convención
  }
  return leftOk ? 'left' : 'right';
}

// Análisis GTO de una jugada: simula N partidas desde después de jugarla
// EV = puntos promedio que el equipo del viewer GANA (+) o PIERDE (-)
// (EV positivo = buena jugada, negativo = mala)
function analyzeMove(state, tile, side, simulations = 800, modalidad = 'todas') {
  const s = deepCloneState(state);
  const viewerIdx = s.turn % s.players.length;
  const p = s.players[viewerIdx];
  const ok = Engine.applyMove(s, p, tile, side);
  if (!ok) return null;
  s.advanceTurn();

  let total = 0;
  for (let i = 0; i < simulations; i++)
    total += simulateToEnd(s, viewerIdx, modalidad);

  const ev = total / simulations; // puntos ganados (+)/perdidos (-)
  return {
    tile: tile.slice(),
    side,
    ev: Math.round(ev * 100) / 100,
    simulations,
    winRate: Math.round((simulateToEnd(s, viewerIdx, modalidad) > 0 ? 1 : 0) * 100), // aprox
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

// Analiza una jugada en modo estudio — ALGORITMO DE MÁXIMA CALIDAD
// `viewerIdx`: el jugador cuyo punto de vista usamos (el que decide)
// `modalidad`: 'todas' | 'solo_contrarios' (variante de punteo)
//
// MÉTODO (la visión del Campeón):
//  1. Generar TODOS los mundos posibles compatibles con lo que ha
//     pasado en la mano (mano del viewer + fichas jugadas + pases
//     = certeza 100%). Si son demasiados, muestreo denso.
//  2. Para CADA mundo, proyectar la partida hacia adelante con
//     rivales RACIONALES (heurística experta).
//  3. EV = promedio de todos los desenlaces (puntos ganados/perdidos
//     con el punteo real). Un EV + significa jugada ganadora en el
//     largo plazo; EV - significa jugada perdedora.
function analyzeMoveStudy(state, tile, side, viewerIdx, simulations = 200, passHistory = [], modalidad = 'todas', rng = Math.random) {
  let totalEv = 0;
  let valid = 0;

  // Generar mundos compatibles (enumera si puede, muestrea si no)
  const worlds = Worlds.generateWorlds(state, viewerIdx, simulations, rng);
  const worldList = worlds.worlds;

  for (let i = 0; i < worldList.length; i++) {
    const world = worldList[i];

    // Aplicar la jugada candidata EN ESTE MUNDO (manos ya fijadas)
    const s = deepCloneState(state);
    for (const [idx, hand] of Object.entries(world)) {
      s.players[parseInt(idx)].hand = hand.map(t => [t[0], t[1]]);
    }
    const p = s.players[viewerIdx];
    const ok = Engine.applyMove(s, p, tile, side);
    if (!ok) continue;
    s.advanceTurn();

    // Proyectar el final con rivales racionales en ESTE mundo fijo
    const ev = simulateToEnd(s, viewerIdx, modalidad, 150, null);
    totalEv += ev;
    valid++;
  }

  if (!valid) return null;
  return {
    tile: [tile[0], tile[1]],
    side,
    // EV = promedio de todos los desenlaces: +gana / -pierde en el largo plazo
    ev: Math.round((totalEv / valid) * 100) / 100,
    modalidad,
    simulations: valid,
    worlds: worldList.length,
  };
}

// Analiza TODAS las jugadas del viewer en modo estudio
function analyzeAllStudy(state, viewerIdx, simulations = 200, passHistory = [], modalidad = 'todas', rng = Math.random) {
  const p = state.players[viewerIdx];
  const moves = Engine.legalMoves(p.hand, state.board);
  const results = [];

  // Generar los mundos UNA SOLA VEZ para toda la mano.
  // Todas las opciones se evalúan sobre los MISMOS escenarios →
  // EVs comparables y estables (sin ruido de muestreo entre fichas).
  const worlds = Worlds.generateWorlds(state, viewerIdx, simulations, rng);
  const worldList = worlds.worlds;

  if (!state.board.length) {
    // Primera jugada
    for (const t of moves) {
      const r = analyzeMoveStudyWorlds(state, t, 'right', viewerIdx, worldList, modalidad);
      if (r) results.push(r);
    }
  } else {
    const ends = state.boardEnds();
    for (const t of moves) {
      // Evaluar solo los lados donde la ficha realmente encaja
      const leftOk = Engine.orientations(t, ends[0]).length > 0;
      const rightOk = Engine.orientations(t, ends[1]).length > 0;
      const sides = [];
      if (leftOk) sides.push('left');
      if (rightOk) sides.push('right');

      for (const side of sides) {
        const r = analyzeMoveStudyWorlds(state, t, side, viewerIdx, worldList, modalidad);
        if (r) results.push(r);
      }
    }
  }
  return results.sort((a, b) => b.ev - a.ev); // MAYOR EV = mejor (puntos ganados)
}

// Variante de analyzeMoveStudy que recibe los mundos YA generados
// (mismos escenarios para todas las opciones → EVs estables).
function analyzeMoveStudyWorlds(state, tile, side, viewerIdx, worldList, modalidad) {
  let totalEv = 0;
  let valid = 0;

  for (let i = 0; i < worldList.length; i++) {
    const world = worldList[i];
    const s = deepCloneState(state);
    for (const [idx, hand] of Object.entries(world)) {
      s.players[parseInt(idx)].hand = hand.map(t => [t[0], t[1]]);
    }
    const p = s.players[viewerIdx];
    const ok = Engine.applyMove(s, p, tile, side);
    if (!ok) continue;
    s.advanceTurn();

    const ev = simulateToEnd(s, viewerIdx, modalidad, 150, null);
    totalEv += ev;
    valid++;
  }

  if (!valid) return null;
  return {
    tile: [tile[0], tile[1]],
    side,
    ev: Math.round((totalEv / valid) * 100) / 100,
    modalidad,
    simulations: valid,
    worlds: worldList.length,
  };
}

// Exponer en navegador (window.Coach) y en Node (module.exports)
const Coach = { tileValue, simulateToEnd, analyzeMove, analyzeAll, analyzeMoveStudy, analyzeAllStudy };
if (typeof module !== 'undefined' && module.exports) module.exports = Coach;
if (typeof window !== 'undefined') window.Coach = Coach;

})();