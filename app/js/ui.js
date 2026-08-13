/* ============================================================
 * Baduy Academy — UI del Coach de Dominó GTO
 * Conecta el motor (engine.js) con el coach (coach.js)
 * ============================================================ */
(function () {
  const E = window.Engine;
  const C = window.Coach;

  let state = null;
  let selectedTile = null;
  let selectedSide = 'right';
  let isAnalyzing = false;

  // ---- Referencias DOM ----
  const el = {
    board: document.getElementById('board'),
    hand: document.getElementById('hand'),
    turn: document.getElementById('turn-info'),
    round: document.getElementById('round-info'),
    btnNew: document.getElementById('btn-new'),
    btnPass: document.getElementById('btn-pass'),
    btnAnalyze: document.getElementById('btn-analyze'),
    coachResults: document.getElementById('coach-results'),
    coachHint: document.getElementById('coach-hint'),
  };

  // ---- Utilidades de render ----
  function renderPips(n) {
    let html = '';
    const positions = pipPositions(n);
    positions.forEach(p => {
      html += `<span class="pip" style="grid-area:${p}"></span>`;
    });
    return `<div class="pips" style="display:grid;grid-template-columns:repeat(2,1fr);gap:3px;width:100%;place-items:center">${html}</div>`;
  }

  // Posiciones de pips según el número (estilo dominó clásico)
  function pipPositions(n) {
    const map = {
      0: [], 1: ['2/2'], 2: ['1/1', '3/3'], 3: ['1/1', '2/2', '3/3'],
      4: ['1/1', '1/3', '3/1', '3/3'], 5: ['1/1', '1/3', '2/2', '3/1', '3/3'],
      6: ['1/1', '1/3', '2/1', '2/3', '3/1', '3/3'],
    };
    return map[n] || [];
  }

  function tileHTML(t, horizontal = false) {
    const [a, b] = t;
    const cls = horizontal ? 'tile horizontal' : 'tile';
    return `<div class="${cls}" data-a="${a}" data-b="${b}">${renderPips(a)}<div class="divider"></div>${renderPips(b)}</div>`;
  }

  function renderBoard() {
    if (!state.board.length) {
      el.board.innerHTML = '<div class="board-empty">El tablero está vacío — juega tu primera ficha</div>';
      return;
    }
    el.board.innerHTML = state.board.map(t => tileHTML(t, true)).join('');
  }

  function renderHand() {
    const p = state.currentPlayer();
    el.hand.innerHTML = p.hand.map((t, i) => {
      const sel = selectedTile && selectedTile[0] === t[0] && selectedTile[1] === t[1] ? ' selected' : '';
      return `<div class="tile${sel}" data-idx="${i}" data-a="${t[0]}" data-b="${t[1]}">${renderPips(t[0])}<div class="divider"></div>${renderPips(t[1])}</div>`;
    }).join('');

    // Click en ficha para seleccionar
    el.hand.querySelectorAll('.tile').forEach(node => {
      node.addEventListener('click', () => {
        const a = parseInt(node.dataset.a), b = parseInt(node.dataset.b);
        selectTile([a, b]);
      });
    });
  }

  function selectTile(tile) {
    if (!E.legalMoves(state.currentPlayer().hand, state.board).some(t => t[0] === tile[0] && t[1] === tile[1])) return;
    selectedTile = tile;
    renderHand();
    updateTurnInfo();
  }

  function updateTurnInfo() {
    const p = state.currentPlayer();
    el.turn.textContent = `Turno: ${p.name}${p.teamId ? ` (Equipo ${p.teamId})` : ''}`;
    const moves = E.legalMoves(p.hand, state.board);
    el.btnPass.disabled = moves.length > 0;
    if (moves.length) {
      el.btnPass.textContent = 'Pasar';
    } else {
      el.btnPass.textContent = 'No tienes jugadas — Pasar';
    }
  }

  // ---- Acciones ----
  function newGame() {
    const players = [
      new E.Player('Tú', 1),
      new E.Player('CPU 1', 2),
      new E.Player('CPU 2', 1),
      new E.Player('CPU 3', 2),
    ];
    E.dealTiles(players);
    state = new E.GameState(players);
    selectedTile = null;
    el.coachResults.innerHTML = '';
    el.coachHint.textContent = 'Toca "Analizar jugada" para que el Coach calcule la mejor opción.';
    renderBoard();
    renderHand();
    updateTurnInfo();
  }

  function playSelected() {
    if (!selectedTile) {
      alert('Selecciona una ficha de tu mano primero.');
      return;
    }
    const p = state.currentPlayer();
    const ok = E.applyMove(state, p, selectedTile, selectedSide);
    if (!ok) { alert('Jugada inválida.'); return; }
    selectedTile = null;
    state.advanceTurn();
    renderBoard();
    renderHand();
    updateTurnInfo();
    // Revisar fin de partida
    checkEnd();
    // Si el turno es de la CPU, jugar automáticamente
    if (!isHumanTurn()) setTimeout(cpuTurn, 500);
  }

  function isHumanTurn() {
    return state.currentPlayer().name === 'Tú';
  }

  function cpuTurn() {
    if (isHumanTurn()) return;
    const p = state.currentPlayer();
    const moves = E.legalMoves(p.hand, state.board);
    if (moves.length) {
      const m = moves[Math.floor(Math.random() * moves.length)];
      const ends = state.boardEnds();
      const side = state.board.length ? (Math.random() < 0.5 ? 'left' : 'right') : 'right';
      // Verificar orientación válida en el lado elegido
      const end = state.board.length ? (side === 'left' ? ends[0] : ends[1]) : null;
      const oris = state.board.length ? E.orientations(m, end) : [[m[0], m[1]]];
      if (!oris.length) { state.passed.push(p.name); }
      else {
        const ok = E.applyMove(state, p, m, side);
        if (!ok) state.passed.push(p.name);
      }
    } else {
      state.passed.push(p.name);
    }
    state.advanceTurn();
    renderBoard();
    renderHand();
    updateTurnInfo();
    checkEnd();
    if (!isHumanTurn()) setTimeout(cpuTurn, 600);
  }

  function checkEnd() {
    const someoneEmpty = state.players.some(p => p.hand.length === 0);
    const blocked = state.passed.length >= state.players.length;
    if (someoneEmpty || blocked) {
      // Calcular puntos
      const totals = state.players.map(p => p.hand.reduce((a, t) => a + t[0] + t[1], 0));
      const winnerIdx = totals.indexOf(Math.min(...totals));
      const winner = state.players[winnerIdx];
      alert(`🏆 ¡Fin de la partida!\nGanador: ${winner.name}\nPuntos en mano: ${totals.join(' / ')}`);
      newGame();
    }
  }

  function analyze() {
    if (isAnalyzing) return;
    isAnalyzing = true;
    el.btnAnalyze.textContent = '⏳ Calculando...';
    el.coachHint.textContent = 'Simulando cientos de finales de partida...';

    setTimeout(() => {
      const results = C.analyzeAll(state, 400);
      renderCoach(results);
      isAnalyzing = false;
      el.btnAnalyze.textContent = '🎯 Analizar jugada (Coach GTO)';
    }, 50);
  }

  function renderCoach(results) {
    if (!results.length) {
      el.coachResults.innerHTML = '<div class="coach-hint">No hay jugadas legales.</div>';
      return;
    }
    el.coachResults.innerHTML = results.map((r, i) => {
      const cls = i === 0 ? 'coach-row best' : 'coach-row';
      const evCls = r.ev < 0 ? 'ev neg' : 'ev';
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`;
      const sideLabel = r.side === 'left' ? '← izquierda' : r.side === 'right' ? '→ derecha' : '';
      return `
        <div class="${cls}">
          <span class="rank">${medal}</span>
          <span class="tile-mini">${tileHTML(r.tile)}</span>
          <span style="font-size:0.85rem;opacity:0.8">${sideLabel}</span>
          <span class="${evCls}">EV ${r.ev > 0 ? '+' : ''}${r.ev}</span>
        </div>`;
    }).join('');
    el.coachHint.textContent = '🥇 La jugada con mayor EV es la recomendada. EV positivo = ventaja esperada para ti.';
  }

  // ---- Eventos ----
  el.btnNew.addEventListener('click', newGame);
  el.btnPass.addEventListener('click', () => {
    const p = state.currentPlayer();
    const moves = E.legalMoves(p.hand, state.board);
    if (moves.length) { alert('Tienes jugadas legales — no puedes pasar.'); return; }
    state.passed.push(p.name);
    state.advanceTurn();
    renderBoard();
    renderHand();
    updateTurnInfo();
    checkEnd();
    if (!isHumanTurn()) setTimeout(cpuTurn, 500);
  });
  el.btnAnalyze.addEventListener('click', analyze);

  // Iniciar
  newGame();
})();
