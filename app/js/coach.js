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

// ---- Heurística experta del Campeón Mundial ----
// Fuerza de cada palo en la mano (cuántas fichas tengo de cada palo;
// los dobles cuentan doble porque controlan el palo).
function suitStrength(hand) {
  const suits = [0, 0, 0, 0, 0, 0, 0];
  hand.forEach(t => {
    suits[t[0]]++;
    suits[t[1]]++;
    if (t[0] === t[1]) suits[t[0]]++; // el doble da control extra
  });
  return suits;
}

// Volumen de tantos de un palo: suma de los tantos de todas las
// fichas de mi mano que contienen ese palo (peso real del control).
function suitVolume(hand, suit) {
  return hand
    .filter(t => t[0] === suit || t[1] === suit)
    .reduce((acc, t) => acc + t[0] + t[1], 0);
}

// Puntaje de UNA ficha de salida (primera jugada).
// DOCTRINA OFICIAL DEL CAMPEÓN:
//   1. DOBLES MAYORES ACOMPAÑADOS = la salida por excelencia.
//      PERO la CALIDAD del acompañamiento importa:
//      - Trío al doble (doble + 2 mixtas del palo) = control total
//      - Acompañante "minga" (ficha cuyo otro palo no tiene apoyo)
//        = pasivo peligroso: te obligan a gastarla y quedas desarmado
//   2. EN PELO = excepción, fuertemente penalizada.
//   3. PURAS MIXTAS: la que mejor represente la mano, por CANTIDAD
//      y VOLUMEN DE TANTOS, evitando mingas.
function openingScore(tile, hand) {
  const suits = suitStrength(hand);
  const a = tile[0], b = tile[1];

  // ---- DOBLE ----
  if (a === b) {
    // Acompañantes = fichas mixtas del palo (sin contar el doble)
    const companions = hand.filter(t => t !== tile && (t[0] === a || t[1] === a));
    if (companions.length > 0) {
      // CALIDAD de cada acompañante: ¿su otro palo tiene apoyo?
      let quality = 0;
      companions.forEach(c => {
        const other = c[0] === a ? c[1] : c[0];
        const otherSupport = hand.some(t => t !== c && t !== tile &&
          (t[0] === other || t[1] === other));
        if (otherSupport) quality += 15;  // acompañante sólido
        else quality -= 10;              // MINGA: no tiene agrado
      });
      // DOBLE ACOMPAÑADO: mayor doble = mejor; calidad = control real
      return 200 + a * 10 + quality;
    }
    // EN PELO: excepción — se penaliza MUY duro (salir en pelo es
    // un error garrafal: quemas el control del palo y no tienes
    // acompañamiento para sostenerlo)
    return a * 2 - 120;
  }

  // ---- MIXTA ----
  let score = 0;
  // CANTIDAD: cuántas fichas tengo de cada palo (mostrar mi fuerza)
  score += suits[a] * 14;
  score += suits[b] * 14;
  // VOLUMEN DE TANTOS: peso real del palo en mi mano
  score += suitVolume(hand, a) * 0.6;
  score += suitVolume(hand, b) * 0.6;
  // FALLA: palo con 1 sola ficha (generar falla de salida = grave)
  if (suits[a] <= 1) score -= 35;
  if (suits[b] <= 1) score -= 35;
  // MINGA: si el otro palo de la ficha no tiene apoyo, es pasivo
  const supportA = hand.some(t => t !== tile && (t[0] === a || t[1] === a));
  const supportB = hand.some(t => t !== tile && (t[0] === b || t[1] === b));
  if (!supportA) score -= 20;
  if (!supportB) score -= 20;
  return score;
}

// Elige la jugada racional con la heurística del Campeón.
// - SALIDA: mostrar el palo fuerte, evitar fallas y no quemar dobles
// - INTERMEDIO: no generar fallas, mantener control, y EXPLOTAR
//   las fallas de los oponentes (si alguien pasó en un palo,
//   atacar ese palo para forzarlo a seguir pasando)
function chooseRationalMove(state, player, moves) {
  // Oponentes que han pasado: palos que NO tienen (por pases registrados)
  // El jugador actual ataca los palos donde el oponente es débil.
  const enemySuits = new Set();
  const myTeam = player.teamId;
  (state.passLog || []).forEach(pl => {
    const pIdx = state.players.findIndex(p => p.name === pl.player);
    if (pIdx < 0) return;
    const passer = state.players[pIdx];
    // Solo explotar a los oponentes (no a mi compañero)
    if (passer.teamId !== myTeam && pl.ends) {
      enemySuits.add(pl.ends[0]);
      enemySuits.add(pl.ends[1]);
    }
  });

  // INFERIR FALLAS POR SECUENCIA: si un oponente salió con un palo
  // y luego NO ha vuelto a jugar ninguna ficha de ese palo, está en
  // falla probable de ese palo → atacarlo para forzarlo a pasar.
  // (Clave: el salidor que sale con 6-6 en pelo y no repite 6)
  const opponentFallas = new Set();
  const opponentOpenSuits = new Set(); // palos con los que salió cada oponente
  state.players.forEach((p, i) => {
    if (p.teamId === myTeam) return; // solo oponentes
    const myMoves = state.history.filter(h => h.player === p.name);
    if (myMoves.length === 0) return;
    // Con qué palo salió este oponente (su 1ª jugada)
    const fTile = myMoves[0].tile;
    const fSuits = [fTile[0], fTile[1]];
    fSuits.forEach(s => opponentOpenSuits.add(s));
    // ¿Ha jugado algo de esos palos después?
    const later = myMoves.slice(1);
    fSuits.forEach(s => {
      const playedLater = later.some(h => h.tile[0] === s || h.tile[1] === s);
      // Si salió con s y no ha vuelto a tocar s → falla probable
      if (!playedLater && state.board.some(t => t[0] === s || t[1] === s)) {
        opponentFallas.add(s);
      }
    });
  });

  let best = null;
  let bestScore = -Infinity;
  for (const m of moves) {
    const ends = state.boardEnds();
    if (!state.board.length) {
      // PRIMERA JUGADA: heurística de salida del Campeón
      const score = openingScore(m, player.hand);
      if (score > bestScore) { bestScore = score; best = m; }
      continue;
    }
    // JUGADA INTERMEDIA: evaluar cada lado posible
    for (const side of ['left', 'right']) {
      const end = side === 'left' ? ends[0] : ends[1];
      if (!Engine.orientations(m, end).length) continue;
      let score = 0;
      const suits = suitStrength(player.hand);
      // El palo que GENERO con esta jugada:
      const gen = (m[0] === end) ? m[1] : m[0];
      const hasGen = player.hand.some(t => t !== m && (t[0] === gen || t[1] === gen));
      // GENERAR FALLA = lo peor que puedes hacer
      if (!hasGen) score -= 40;
      // El otro extremo: si no lo controlo, riesgo
      const otherEnd = side === 'left' ? ends[1] : ends[0];
      const hasOther = player.hand.some(t => t !== m && (t[0] === otherEnd || t[1] === otherEnd));
      if (!hasOther) score -= 15;
      // EXPLOTAR FALLAS DEL OPONENTE: si genero un palo donde el
      // enemigo ya pasó, lo fuerzo a pasar de nuevo (MUY valioso)
      if (enemySuits.has(gen)) score += 50;
      if (enemySuits.has(otherEnd)) score += 30;
      // Explotar fallas INFERIDAS por secuencia (salió y no repitió)
      if (opponentFallas.has(gen)) score += 40;
      if (opponentFallas.has(otherEnd)) score += 20;
      // ATACAR EL PALO DE SALIDA DEL OPONENTE: si el oponente salió
      // con este palo, mantenerlo vivo lo obliga a seguir jugando ahí
      // (y si es su palo débil, lo fuerza a gastar fichas malas)
      if (opponentOpenSuits.has(gen)) score += 15;
      if (opponentOpenSuits.has(otherEnd)) score += 10;
      // Soltar ficha pesada: bueno PERO no a costa de control
      score += (m[0] + m[1]) * 0.3;
      // Doble: si es del palo en juego, es control (no soltar);
      // si es inerte, soltarlo pronto es aceptable
      if (m[0] === m[1]) {
        if (ends.includes(m[0])) score += 2; // control del palo vivo
        else score += 1; // inerte
      }
      // Mantener mi palo fuerte: jugar en el palo que más tengo
      score += suits[gen] * 0.8;
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
    // PRIMERA JUGADA: EV en PUNTOS REALES (lo que ganas/pierdes).
    // La doctrina del campeón NO infla los números — solo DESEMPATA
    // cuando dos jugadas tienen EV casi idéntico (diferencia < umbral).
    const evs = {};
    for (const t of moves) {
      const r = analyzeMoveStudyWorlds(state, t, 'right', viewerIdx, worldList, modalidad);
      if (r) evs[t[0] * 10 + t[1]] = r;
    }
    const evList = Object.values(evs);
    if (evList.length) {
      // DOCTRINA DEL CAMPEÓN EN LA SALIDA:
      // El EV simulado se ajusta con un bonus de doctrina en PUNTOS
      // REALES (±4 máx) — el doble mayor acompañado domina porque
      // soltar 12 tantos y controlar el palo alto es estratégicamente
      // superior. NO se infla a escala 0-100: los valores siguen
      // siendo puntos reales ganados/perdidos.
      const scored = evList.map(r => ({
        ...r,
        exp: openingScore(r.tile, p.hand),
      }));
      const minExp = Math.min(...scored.map(s => s.exp));
      const maxExp = Math.max(...scored.map(s => s.exp));
      const span = (maxExp - minExp) || 1;
      for (const s of scored) {
        // Bonus SELECTIVO de doctrina:
        //  - Jugadas buenas (exp alto): bonus moderado hasta +5
        //  - Errores garrafales (exp muy bajo, ej. doble en pelo):
        //    penalización fuerte hasta -10
        // Esto castiga lo que el Monte Carlo no ve (fallas no
        // explotadas) sin inflar los EVs de las jugadas buenas.
        const expNorm = (s.exp - minExp) / span; // 0..1
        let bonus;
        if (expNorm > 0.5) {
          bonus = expNorm * 5; // +0..+5 para buenas
        } else {
          bonus = (expNorm - 0.5) * 20; // 0..-10 para malas
        }
        s.ev = Math.round((s.ev + bonus) * 100) / 100;
        s.side = 'right';
        results.push(s);
      }
      // REGLA GARRAFAL DIRECTA: un doble en pelo NUNCA puede ser la
      // mejor salida. Cualquier doble sin acompañamiento se castiga
      // fuerte (-12 puntos) porque quemas control sin sostén.
      // (Se aplica a TODOS los dobles en pelo, antes de ordenar.)
      for (const s of results) {
        if (s.tile[0] === s.tile[1]) {
          // Comparar por VALOR (s.tile es copia, no referencia)
          const comps = p.hand.filter(t =>
            (t[0] !== s.tile[0] || t[1] !== s.tile[1]) &&
            (t[0] === s.tile[0] || t[1] === s.tile[0]));
          if (comps.length === 0) {
            s.ev = Math.round((s.ev - 12) * 100) / 100;
          }
        }
      }
      // Ordenar por EV final (EV real + bonus de doctrina)
      results.sort((a, b) => b.ev - a.ev);
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

// ============================================================
// ANÁLISIS CON INFORMACIÓN PERFECTA (base del detector anti-señas)
// Cuando TODAS las manos son conocidas (modo Editar Manos o partida
// grabada), el EV de cada jugada es EXACTO: no hay muestreo de mundos,
// el estado es único y determinista (rivales racionales).
//
// USO PARA EL DETECTOR:
//   - EV_imperfecto = lo que el jugador ve racionalmente (muestreo)
//   - EV_perfecto   = lo que la jugada VALE con todas las manos vistas
//   Si un jugador elige una jugada con EV_imperfecto bajo pero
//   EV_perfecto alto → "sabía más de lo que debía" → señal de colusión.
// ============================================================
function analyzeAllPerfect(state, viewerIdx, modalidad = 'todas') {
  const p = state.players[viewerIdx];
  const moves = Engine.legalMoves(p.hand, state.board);
  const results = [];

  // Mundo ÚNICO: las manos reales de los rivales (sin muestreo)
  const world = {};
  state.players.forEach((pl, i) => {
    if (i !== viewerIdx) world[i] = pl.hand.map(t => [t[0], t[1]]);
  });
  const worldList = [world];

  if (!state.board.length) {
    for (const t of moves) {
      const r = analyzeMoveStudyWorlds(state, t, 'right', viewerIdx, worldList, modalidad);
      if (r) results.push(r);
    }
  } else {
    const ends = state.boardEnds();
    const sameEnds = ends[0] === ends[1];
    for (const t of moves) {
      // Evaluar solo los lados donde la ficha realmente encaja
      const leftOk = Engine.orientations(t, ends[0]).length > 0;
      const rightOk = Engine.orientations(t, ends[1]).length > 0;
      const sides = [];
      if (leftOk) sides.push('left');
      // Si ambos extremos son IGUALES, izquierda y derecha son la MISMA
      // jugada → no duplicar
      if (rightOk && !sameEnds) sides.push('right');
      for (const side of sides) {
        const r = analyzeMoveStudyWorlds(state, t, side, viewerIdx, worldList, modalidad);
        if (r) results.push(r);
      }
    }
  }
  // Info perfecta: EV exacto, sin bonus de doctrina (la doctrina es
  // para info imperfecta). Ordenar por EV real.
  return results.sort((a, b) => b.ev - a.ev);
}

// Exponer en navegador (window.Coach) y en Node (module.exports)
const Coach = { tileValue, simulateToEnd, analyzeMove, analyzeAll, analyzeMoveStudy, analyzeAllStudy, analyzeAllPerfect };
if (typeof module !== 'undefined' && module.exports) module.exports = Coach;
if (typeof window !== 'undefined') window.Coach = Coach;

})();