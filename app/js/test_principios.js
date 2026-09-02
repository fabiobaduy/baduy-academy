// TEST de los 10 PRINCIPIOS DOMINA en chooseRationalMove
// Usa las funciones EXPORTADAS del coach (chooseRationalMove, openingScore)
const Engine = require('./engine.js');
const Coach = require('./coach.js');

function makeState(history, hands, turnIdx, passLog) {
  const players = [
    new Engine.Player('A', 0), new Engine.Player('B', 1),
    new Engine.Player('C', 0), new Engine.Player('D', 1),
  ];
  const st = new Engine.GameState(players);
  st.turn = turnIdx;
  st.board = [];
  st.history = history.map(h => ({...h, tile: [h.tile[0], h.tile[1]]}));
  st.history.forEach(h => {
    if (!st.board.length) st.board.push([h.tile[0], h.tile[1]]);
    else if (h.side === 'left') st.board.unshift([h.tile[1], h.tile[0]]);
    else st.board.push([h.tile[0], h.tile[1]]);
  });
  players.forEach((p, i) => { p.hand = (hands[i]||[]).map(t => [t[0], t[1]]); });
  if (passLog) st.passLog = passLog;
  return st;
}

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} — ${detail || ''}`); }
}

console.log('=== TEST PRINCIPIO #2: REPETIR PALOS DEL COMPAÑERO ===');
{
  const st = makeState(
    [{player:'A',tile:[4,4],side:'right'},{player:'B',tile:[4,5],side:'right'}],
    {0:[[4,4],[3,3],[2,2],[1,1],[0,0],[0,1],[0,2]], 1:[[4,5],[5,6],[6,6],[3,2],[2,1],[1,0],[5,5]], 2:[[4,2],[6,3],[5,3],[4,3],[6,1],[5,2],[3,1]], 3:[[6,4],[6,2],[5,4],[5,1],[4,1],[3,0],[2,0]]},
    1
  );
  const moves = Engine.legalMoves(st.players[1].hand, st.board);
  const choice = Coach.chooseRationalMove(st, st.players[1], moves);
  console.log(`  B elige: ${choice.join('-')} de [${moves.map(t=>t.join('-')).join(', ')}]`);
  check('B elige una jugada legal', moves.some(t => t[0]===choice[0] && t[1]===choice[1]));
}

console.log('\n=== TEST PRINCIPIO #7: CASTIGAR POR DEBAJO DEL COMPAÑERO ===');
{
  const st = makeState(
    [{player:'A',tile:[3,3],side:'right'},{player:'B',tile:[3,6],side:'right'}],
    {0:[[3,3],[6,6],[5,5],[4,4],[2,2],[1,1],[0,0]], 1:[[3,6],[6,5],[5,4],[4,3],[3,1],[2,0],[1,0]], 2:[[3,2],[3,5],[6,4],[5,2],[4,1],[2,1],[0,3]], 3:[[3,4],[6,2],[5,1],[4,0],[2,1],[1,5],[0,6]]},
    2
  );
  const moves = Engine.legalMoves(st.players[2].hand, st.board);
  const choice = Coach.chooseRationalMove(st, st.players[2], moves);
  console.log(`  C castiga con: ${choice.join('-')} de [${moves.map(t=>t.join('-')).join(', ')}]`);
  // Compañero A salió doble 3 → C debe castigar por debajo (3-2, 3-1, 3-0)
  const isBelow = (choice[0] === 3 && choice[1] <= 2) || (choice[1] === 3 && choice[0] <= 2);
  check('C castiga POR DEBAJO del doble 3 del compañero', isBelow, `eligió ${choice.join('-')}`);
}

console.log('\n=== TEST PRINCIPIO #5: CASTIGAR POR ENCIMA DEL CONTRARIO ===');
{
  const st = makeState(
    [{player:'A',tile:[4,3],side:'right'},{player:'B',tile:[3,5],side:'right'},{player:'C',tile:[5,6],side:'right'}],
    {0:[[4,3],[6,6],[2,2],[1,1],[0,0],[0,1],[0,2]], 1:[[3,5],[5,5],[6,5],[2,1],[1,0],[6,2],[5,2]], 2:[[5,6],[6,4],[4,4],[3,2],[2,0],[1,6],[0,5]], 3:[[5,4],[2,4],[6,3],[5,1],[4,1],[3,0],[2,1]]},
    3
  );
  const moves = Engine.legalMoves(st.players[3].hand, st.board);
  const choice = Coach.chooseRationalMove(st, st.players[3], moves);
  console.log(`  D castiga con: ${choice.join('-')} de [${moves.map(t=>t.join('-')).join(', ')}]`);
  // El contrario A salió 4-3 → D castiga el 4. Preferir 5-4 (alto) sobre 2-4 (bajo)
  const isHigh = choice[0]===5 || choice[1]===5;
  check('D castiga POR ENCIMA (5-4 > 2-4)', isHigh, `eligió ${choice.join('-')}`);
}

console.log('\n=== TEST PRINCIPIO #4: MOSTRAR LO QUE TENGO (palo dominante) ===');
{
  const st = makeState(
    [{player:'A',tile:[5,3],side:'right'}],
    {0:[[5,3],[6,6],[4,4],[2,2],[1,1],[0,0],[0,1]], 1:[[5,6],[5,4],[5,2],[5,1],[5,0],[6,3],[4,2]], 2:[[6,5],[6,4],[6,2],[4,3],[3,2],[2,1],[1,0]], 3:[[6,1],[5,5],[4,1],[3,1],[2,0],[1,6],[0,6]]},
    1
  );
  const moves = Engine.legalMoves(st.players[1].hand, st.board);
  const choice = Coach.chooseRationalMove(st, st.players[1], moves);
  console.log(`  B juega: ${choice.join('-')} de [${moves.map(t=>t.join('-')).join(', ')}]`);
  check('B juega en su palo dominante 5', choice[0]===5 || choice[1]===5, `eligió ${choice.join('-')}`);
}

console.log(`\n=== RESULTADO: ${pass} ✅ / ${fail} ❌ ===`);
process.exit(fail > 0 ? 1 : 0);
