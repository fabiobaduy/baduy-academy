/* ============================================================
 * Baduy Academy — Evaluador heurístico experto
 * Conocimiento de dominó de alto nivel convertido en puntajes:
 *  - Peso de fichas (suma baja = flexible, suma alta = pesada)
 *  - Dobles: controlan el palo (valiosos, pero hay que soltarlos)
 *  - Control de palos (tener muchas fichas de un palo = poder)
 *  - Peligro: palos que NO tienes (te pueden "ahogar")
 *  - Progreso hacia vaciar la mano
 * ============================================================ */

// Peso estándar de cada ficha: su suma. Las fichas pesadas son
// difíciles de soltar; las ligeras son flexibles.
function tileWeight(t) { return t[0] + t[1]; }

// Puntaje heurístico del estado desde la perspectiva de `playerIdx`.
// Mientras MÁS ALTO, mejor para ese jugador.
function evaluateState(state, playerIdx = state.turn % state.players.length) {
  const p = state.players[playerIdx];

  // 1. Progreso: cuantas menos fichas en mano, mejor
  const handSize = p.hand.length;
  let score = handSize * -12; // -12 por ficha restante

  // 2. Peso total de la mano (menos = mejor): fichas pesadas = lastre
  const totalWeight = p.hand.reduce((a, t) => a + tileWeight(t), 0);
  score -= totalWeight * 0.8;

  // 3. Control de palos: contar cuántas fichas tengo de cada palo
  const suitCount = [0, 0, 0, 0, 0, 0, 0];
  p.hand.forEach(t => { suitCount[t[0]]++; suitCount[t[1]]++; });

  // Dobles cuentan doble para el palo (control fuerte)
  p.hand.forEach(t => { if (t[0] === t[1]) suitCount[t[0]]++; });

  // Palo más fuerte: mi capacidad de dominar ese palo
  const maxSuit = Math.max(...suitCount);
  score += maxSuit * 3.5;

  // 4. Peligro: palos que NO tengo (los rivales me pueden ahogar)
  const endSuits = state.boardEnds();
  if (endSuits) {
    // Si un extremo del tablero es un palo que no tengo, peligro
    endSuits.forEach(s => {
      if (suitCount[s] === 0) score -= 6; // me van a obligar a pasar
    });
  }

  // 5. Dobles en mano: si tengo el doble del palo que está en juego,
  //    es una carta de control (la puedo jugar cuando quiera)
  p.hand.forEach(t => {
    if (t[0] === t[1] && endSuits && endSuits.includes(t[0])) {
      score += 4; // controlo el palo en juego
    } else if (t[0] === t[1]) {
      score += 1.5; // doble inerte: soltarlo pronto
    }
  });

  // 6. Si el tablero está vacío (primera jugada), favorecer:
  //    - El doble más alto (control inmediato)
  //    - La ficha más pesada que pueda soltar (o la más ligera)
  if (!state.board.length) {
    const bestDouble = p.hand.filter(t => t[0] === t[1])
      .sort((a, b) => tileWeight(b) - tileWeight(a))[0];
    if (bestDouble) score += 6;
  }

  return Math.round(score * 100) / 100;
}

module.exports = { tileWeight, evaluateState };
