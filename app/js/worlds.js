(function(){
/* ============================================================
 * Baduy Academy — Generador de Mundos (enumeración de escenarios)
 * Construye TODAS las distribuciones posibles de las fichas
 * desconocidas entre los rivales, CONSISTENTES con todo lo que
 * ha pasado en la mano:
 *
 *   1. Mano del viewer (conocida)
 *   2. Fichas jugadas en el tablero (fuera del universo)
 *   3. Pases: si P pasó con extremos [x, y] → P NO tiene fichas
 *      con x ni con y (CERTEZA 100%)
 *
 * El universo de 399M repartos se poda drásticamente:
 *   - Sin pases:    C(21,7) × C(14,7) = 399M
 *   - Con pases:    pool de B se reduce → miles
 *
 * Cuando el número de mundos es factible (< MAX_ENUM), se
 * ENUMERAN todos. Si no, se muestrea densamente con
 * estratificación (cada rival muestreado de su pool real).
 * ============================================================ */
const Engine = (typeof window !== 'undefined') ? window.Engine : require('./engine.js');

// Límite de mundos a enumerar exactamente (más = más lento pero exacto)
const MAX_ENUM = 50000;

// Fichas no visibles para el viewer (todo menos su mano + tablero)
function hiddenTiles(state, viewerIdx) {
  const seen = new Set();
  const mark = t => seen.add(t[0] * 10 + t[1]);
  state.board.forEach(t => mark(t));
  state.history.forEach(h => mark(h.tile));
  state.players.forEach((p, i) => {
    if (i === viewerIdx) p.hand.forEach(mark);
  });
  return Engine.ALL_TILES.filter(t => !seen.has(t[0] * 10 + t[1]));
}

// Palos que cada rival NO puede tener (por pases) — certeza 100%
function bannedSuits(state) {
  const banned = {};
  state.players.forEach((_, i) => { banned[i] = new Set(); });
  (state.passLog || []).forEach(pl => {
    const pIdx = state.players.findIndex(p => p.name === pl.player);
    if (pIdx < 0 || !pl.ends) return;
    banned[pIdx].add(pl.ends[0]);
    banned[pIdx].add(pl.ends[1]);
  });
  return banned;
}

// Pool de fichas permitidas para cada rival
function allowedPools(state, viewerIdx) {
  const hidden = hiddenTiles(state, viewerIdx);
  const banned = bannedSuits(state);
  const pools = {};
  state.players.forEach((p, i) => {
    if (i === viewerIdx) return;
    const b = banned[i];
    pools[i] = hidden.filter(t => !(b.has(t[0]) || b.has(t[1])));
  });
  return pools;
}

// Combina listas de combinaciones con exclusión de fichas usadas
function combinations(arr, k, used = new Set()) {
  const out = [];
  const n = arr.length;
  function rec(start, chosen) {
    if (chosen.length === k) { out.push(chosen.slice()); return; }
    const remaining = k - chosen.length;
    for (let i = start; i <= n - remaining; i++) {
      const t = arr[i];
      const key = t[0] * 10 + t[1];
      if (used.has(key)) continue;
      used.add(key);
      chosen.push(t);
      rec(i + 1, chosen);
      chosen.pop();
      used.delete(key);
    }
  }
  rec(0, []);
  return out;
}

// Cuántas fichas le faltan a cada rival (7 - jugadas)
function remainingCount(state, playerIdx) {
  const name = state.players[playerIdx].name;
  const played = state.history.filter(h => h.player === name).length;
  return 7 - played;
}

// ============================================================
// ENUMERACIÓN EXACTA de mundos compatibles (con límite duro)
// Genera distribuciones { jugador: [fichas...] } consistentes
// con pases y fichas jugadas.
// Estrategia anti-explosión:
//   - Enumerar las manos del primer rival (pool más chico)
//   - Para C y D: muestrear si la enumeración total excede el límite
//   - Límite DURO de mundos (nunca OOM)
// ============================================================
function enumerateWorlds(state, viewerIdx, maxWorlds = 20000) {
  const hidden = hiddenTiles(state, viewerIdx);
  const banned = bannedSuits(state);
  const rivals = [];
  state.players.forEach((p, i) => {
    if (i === viewerIdx) return;
    const count = remainingCount(state, i);
    const b = banned[i];
    const pool = hidden.filter(t => !(b.has(t[0]) || b.has(t[1])));
    const finalPool = pool.length >= count ? pool : hidden;
    rivals.push({ idx: i, count, pool: finalPool });
  });
  // Ordenar por pool más chico primero (poda temprana)
  rivals.sort((a, b) => a.pool.length - b.pool.length);

  const first = rivals[0];
  // C(19,7) ≈ 50K, C(21,7) ≈ 116K — enumerable; C(15,7) con pase = 6.4K
  const combos = combinations(first.pool, first.count);
  if (combos.length > maxWorlds) return null; // demasiados → muestreo

  const worlds = [];
  const r2 = rivals[1];
  const r3 = rivals[2];

  for (const hand1 of combos) {
    if (worlds.length >= maxWorlds) break;
    // Pool 2 = ocultas - hand1, filtradas por restricciones de r2
    const inHand1 = new Set(hand1.map(t => t[0] * 10 + t[1]));
    const pool2 = r2.pool.filter(t => !inHand1.has(t[0] * 10 + t[1]));
    if (pool2.length < r2.count) continue;

    // Enumerar C si es factible; si no, muestrear
    const combos2 = combinations(pool2, r2.count);
    let hands2;
    if (combos2.length > maxWorlds) {
      // Muestreo: tomar hasta maxWorlds/combo1 combinaciones
      hands2 = combos2.slice(0, Math.max(1, Math.floor(maxWorlds / Math.max(1, combos.length))));
    } else {
      hands2 = combos2;
    }

    for (const hand2 of hands2) {
      if (worlds.length >= maxWorlds) break;
      const usedBoth = new Set(inHand1);
      hand2.forEach(t => usedBoth.add(t[0] * 10 + t[1]));
      const pool3 = r3.pool.filter(t => !usedBoth.has(t[0] * 10 + t[1]));
      if (pool3.length < r3.count) continue;
      // El tercero: muestrear hasta 20 manos por par (no enumerar todo)
      const combos3 = combinations(pool3, r3.count);
      const hands3 = combos3.length > 20 ? combos3.slice(0, 20) : combos3;
      for (const hand3 of hands3) {
        if (worlds.length >= maxWorlds) break;
        const world = {};
        world[rivals[0].idx] = hand1.slice();
        world[r2.idx] = hand2.slice();
        world[r3.idx] = hand3.slice();
        worlds.push(world);
      }
    }
  }
  return worlds;
}

// ============================================================
// MUESTREO DENSIFICADO (cuando la enumeración es inviable)
// Muestrea mundos desde los pools reales de cada rival,
// respetando las restricciones por pases.
// ============================================================
function sampleWorlds(state, viewerIdx, n = 200, rng = Math.random) {
  const hidden = hiddenTiles(state, viewerIdx);
  const banned = bannedSuits(state);
  const worlds = [];

  for (let w = 0; w < n; w++) {
    const pool = hidden.slice();
    const world = {};
    state.players.forEach((p, i) => {
      if (i === viewerIdx) return;
      const count = remainingCount(state, i);
      const b = banned[i];
      // Fichas permitidas de este rival (en el pool actual)
      const allowed = pool.filter(t => !(b.has(t[0]) || b.has(t[1])));
      const src = allowed.length >= count ? allowed : pool;
      // Barajar y tomar
      for (let k = src.length - 1; k > 0; k--) {
        const j = Math.floor(rng() * (k + 1));
        [src[k], src[j]] = [src[j], src[k]];
      }
      const hand = src.slice(0, count);
      world[i] = hand;
      // Quitar del pool global
      hand.forEach(t => {
        const idx = pool.findIndex(h => h[0] === t[0] && h[1] === t[1]);
        if (idx >= 0) pool.splice(idx, 1);
      });
    });
    worlds.push(world);
  }
  return worlds;
}

// ============================================================
// API principal: genera mundos compatibles (enumera si puede,
// muestrea si no).
// ============================================================
function generateWorlds(state, viewerIdx, maxSamples = 200, rng = Math.random) {
  const worlds = enumerateWorlds(state, viewerIdx);
  if (worlds && worlds.length > 0 && worlds.length <= MAX_ENUM) {
    return { worlds, exact: true, count: worlds.length };
  }
  const sampled = sampleWorlds(state, viewerIdx, maxSamples, rng);
  return { worlds: sampled, exact: false, count: sampled.length };
}

const Worlds = {
  hiddenTiles, bannedSuits, allowedPools, combinations,
  enumerateWorlds, sampleWorlds, generateWorlds, MAX_ENUM,
  remainingCount,
};
if (typeof module !== 'undefined' && module.exports) module.exports = Worlds;
if (typeof window !== 'undefined') window.Worlds = Worlds;

})();
