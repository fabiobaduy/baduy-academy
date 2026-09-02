// Diagnóstico FINO v2: posición EXACTA del usuario con manos limpias
// Tablero [6,6] (A salió con doble 6), turno de B.
// B tiene: 6-5 + DOS cincos de apoyo (5-5, 5-4) y 6-4 + apoyo de 4s.
// A/C/D manos VACÍAS → worlds.js genera mundos consistentes de las fichas restantes.
const Engine = require('./engine.js');
const Coach = require('./coach.js');

function makeState(bHand) {
  const players = [
    new Engine.Player('A', 0), new Engine.Player('B', 1),
    new Engine.Player('C', 0), new Engine.Player('D', 1),
  ];
  const st = new Engine.GameState(players);
  st.board = [[6, 6]];
  st.history = [{ player: 'A', tile: [6, 6], side: 'right' }];
  st.turn = 1;
  players[0].hand = []; // vacío: se infiere
  players[1].hand = bHand.map(t => [t[0], t[1]]);
  players[2].hand = []; // vacío: se infiere
  players[3].hand = []; // vacío: se infiere
  return st;
}

const bHand = [[6,5],[5,5],[5,4],[6,4],[4,4],[4,3],[3,3]];
const st = makeState(bHand);

console.log('=== POSICIÓN DEL USUARIO (v2, mundos limpios) ===');
console.log('Tablero: [6,6] (extremos IGUALES = 6 y 6)');
console.log('Mano de B: ' + bHand.map(t=>t.join('-')).join(', '));
console.log('Jugadas legales: ' + Engine.legalMoves(bHand, [[6,6]]).map(t=>t.join('-')).join(', '));
console.log('');

// 1) EV PERFECTO (todas las manos conocidas = base del detector)
// Manos reales fijadas para A, C, D — SIN duplicados con B:
const stPerfect = makeState(bHand);
stPerfect.players[0].hand = [[5,3],[3,2],[2,2],[1,1],[0,0],[0,1],[0,2]].map(t=>[t[0],t[1]]);
stPerfect.players[2].hand = [[5,2],[4,2],[3,1],[2,0],[6,0],[5,1],[4,1]].map(t=>[t[0],t[1]]);
stPerfect.players[3].hand = [[6,3],[6,2],[6,1],[5,0],[3,0],[2,1],[1,0]].map(t=>[t[0],t[1]]);

// Verificar que no haya duplicados entre las 4 manos + el 6-6 del tablero
const todas = [stPerfect.players[0].hand, stPerfect.players[1].hand, stPerfect.players[2].hand, stPerfect.players[3].hand].flat().map(t=>t.join('-'));
const unicas = new Set(todas);
console.log('Fichas totales en manos: ' + todas.length + ', únicas: ' + unicas.size + (todas.length===unicas.size ? ' ✅ SIN duplicados' : ' ❌ HAY duplicados'));
console.log('');

console.log('--- EV PERFECTO (determinista, 1 mundo) ---');
const perfect = Coach.analyzeAllPerfect(stPerfect, 1, 'todas');
perfect.forEach(r => console.log(`  ${r.tile.join('-')} → EV=${r.ev}  (${r.simulations} desenlaces)`));

// 2) EV IMPERFECTO (modo estudio real)
console.log('\n--- EV IMPERFECTO (modo estudio, B no ve manos rivales) ---');
const study = Coach.analyzeAllStudy(st, 1, 300, [], 'todas');
study.forEach(r => console.log(`  ${r.tile.join('-')} ${r.side.padEnd(5)} → EV=${r.ev}  (${r.simulations} mundos válidos de ${r.worlds})`));
