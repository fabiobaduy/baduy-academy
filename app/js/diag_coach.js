// Diagnóstico del Coach GTO — reproduce la posición del usuario
const Engine = require('./engine.js');
const SamplerM = require('./sampler.js');
const Scoring = require('./scoring.js');
const Worlds = require('./worlds.js');
const Coach = require('./coach.js');

// Estado según captura: tablero [6,6] (A salió con doble 6), turno de B
function makeState(bHand) {
  const players = [
    new Engine.Player('A', 0), new Engine.Player('B', 1),
    new Engine.Player('C', 0), new Engine.Player('D', 1),
  ];
  const st = new Engine.GameState(players);
  // A (idx 0) jugó el 6-6 de salida
  st.board = [[6, 6]];
  st.history = [{ player: 'A', tile: [6, 6], side: 'right' }];
  st.turn = 1; // turno de B
  players[0].hand = []; // A ya jugó su única ficha visible; ponemos resto
  players[1].hand = bHand.map(t => [t[0], t[1]]);
  players[2].hand = []; // se rellenan en analyze via worlds
  players[3].hand = [];
  return st;
}

// Escenario 1: mano que produce el ranking raro de la captura
// (B tiene 6-5 con 5-5 de apoyo, y varios dobles)
const bHand1 = [[6,5],[5,5],[4,4],[6,6],[4,3],[4,2],[3,2]];
console.log('=== ESCENARIO 1: B mano ' + JSON.stringify(bHand1.map(t=>t.join('-'))) + ' ===');
console.log('Tablero: [6,6] — extremos: 6 y 6 (IGUALES)');
console.log('Jugadas legales: ' + JSON.stringify(Engine.legalMoves(bHand1, [[6,6]]).map(t=>t.join('-'))) + '\n');

const st1 = makeState(bHand1);
const perfect = Coach.analyzeAllPerfect(st1, 1, 'todas');
console.log('--- EV con información PERFECTA (determinista) ---');
perfect.forEach(r => console.log(`  ${r.tile.join('-')} ${r.side.padEnd(5)} EV=${r.ev}`));

// Escenario 2: demostración de la teoría de Fabio — 6-4 vs 6-5 con control
// Tablero con extremos DIFERENTES [6,...|...,4]: B decide si jugar 6-4 (controla 4, conserva 6) o 6-5
function makeState2(bHand) {
  const players = [
    new Engine.Player('A', 0), new Engine.Player('B', 1),
    new Engine.Player('C', 0), new Engine.Player('D', 1),
  ];
  const st = new Engine.GameState(players);
  // A salió 6-4, luego B jugó 4-2 a la derecha... extremos: 6 (izq) y 2 (der)
  st.board = [[6,4],[4,2]];
  st.history = [
    { player: 'A', tile: [6,4], side: 'right' },
    { player: 'B', tile: [4,2], side: 'right' },
  ];
  st.turn = 2; // turno de C
  players[1].hand = bHand.map(t => [t[0], t[1]]);
  return st;
}

console.log('\n=== ESCENARIO 2: teoría de Fabio (6-4 vs 6-5, extremos distintos) ===');
const bHand2 = [[6,4],[6,5],[5,5],[4,4],[3,3],[2,1],[6,3]];
const st2 = makeState2(bHand2);
console.log('Tablero: [6-4 | 4-2] — extremos: 6 (izq) y 2 (der)');
console.log('Mano B: ' + JSON.stringify(bHand2.map(t=>t.join('-'))) + ' (6-4 con 4-4 apoyo, 6-5 con 5-5 apoyo)');
console.log('Jugadas legales: ' + JSON.stringify(Engine.legalMoves(bHand2, st2.board).map(t=>t.join('-'))) + '\n');
const perfect2 = Coach.analyzeAllPerfect(st2, 1, 'todas');
perfect2.forEach(r => console.log(`  ${r.tile.join('-')} ${r.side.padEnd(5)} EV=${r.ev}`));

// Escenario 3: mismos extremos — verificar duplicados en modo estudio
console.log('\n=== ESCENARIO 3: extremos iguales [6,6] — ¿duplica lados? ===');
const st3 = makeState(bHand1);
const study = Coach.analyzeAllStudy(st3, 1, 60, [], 'todas', () => 0.42);
study.forEach(r => console.log(`  ${r.tile.join('-')} ${r.side.padEnd(5)} EV=${r.ev} (${r.simulations} sims)`));
