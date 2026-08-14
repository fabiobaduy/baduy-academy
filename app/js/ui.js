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
    btnPlay: document.getElementById('btn-play'),
    btnPass: document.getElementById('btn-pass'),
    btnAnalyze: document.getElementById('btn-analyze'),
    coachResults: document.getElementById('coach-results'),
    coachHint: document.getElementById('coach-hint'),
    coachProgress: document.getElementById('coach-progress'),
    progressFill: document.getElementById('progress-fill'),
    progressText: document.getElementById('progress-text'),
    // Editor de manos
    btnEditHands: document.getElementById('btn-edit-hands'),
    handEditor: document.getElementById('hand-editor'),
    editorPlayers: document.getElementById('editor-players'),
    bankTiles: document.getElementById('bank-tiles'),
    bankCount: document.getElementById('bank-count'),
    btnEditorClear: document.getElementById('btn-editor-clear'),
    btnEditorRandom: document.getElementById('btn-editor-random'),
    btnEditorApply: document.getElementById('btn-editor-apply'),
  };

  // ---- Utilidades de render ----
  // Posiciones de pips en grid 3x3 (estilo dominó clásico)
  function pipPositions(n) {
    const map = {
      0: [],
      1: [[2, 2]],
      2: [[1, 1], [3, 3]],
      3: [[1, 1], [2, 2], [3, 3]],
      4: [[1, 1], [1, 3], [3, 1], [3, 3]],
      5: [[1, 1], [1, 3], [2, 2], [3, 1], [3, 3]],
      6: [[1, 1], [1, 3], [2, 1], [2, 3], [3, 1], [3, 3]],
    };
    return map[n] || [];
  }

  function renderPips(n) {
    const pos = pipPositions(n);
    const pips = pos.map(([r, c]) =>
      `<span class="pip" style="grid-row:${r};grid-column:${c}"></span>`).join('');
    return `<div class="pips">${pips}</div>`;
  }

  function tileHTML(t, onBoard = false) {
    const [a, b] = t;
    const cls = onBoard ? 'tile tile-board' : 'tile';
    return `<div class="${cls}" data-a="${a}" data-b="${b}">
      <div class="half">${renderPips(a)}</div>
      <div class="divider"></div>
      <div class="half">${renderPips(b)}</div>
    </div>`;
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
      return `<div class="tile${sel}" data-idx="${i}" data-a="${t[0]}" data-b="${t[1]}">
        <div class="half">${renderPips(t[0])}</div>
        <div class="divider"></div>
        <div class="half">${renderPips(t[1])}</div>
      </div>`;
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
    // Mostrar botón Jugar si el tablero tiene fichas y hay lado a elegir
    el.btnPlay.style.display = 'block';
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
    el.btnPlay.style.display = 'none';
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
    // Determinar el lado: si el tablero está vacío, derecha; si no,
    // pedir al usuario o elegir el lado donde la ficha encaja
    let side = selectedSide;
    if (state.board.length) {
      const ends = state.boardEnds();
      const leftOk = E.orientations(selectedTile, ends[0]).length > 0;
      const rightOk = E.orientations(selectedTile, ends[1]).length > 0;
      if (leftOk && rightOk) {
        // Ambos lados posibles: preguntar (simple)
        side = window.confirm('¿Jugar a la IZQUIERDA? (OK = izquierda, Cancelar = derecha)') ? 'left' : 'right';
      } else if (leftOk) {
        side = 'left';
      } else {
        side = 'right';
      }
    }
    const ok = E.applyMove(state, p, selectedTile, side);
    if (!ok) { alert('Jugada inválida.'); return; }
    selectedTile = null;
    el.btnPlay.style.display = 'none';
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
    const p = state.currentPlayer();
    const moves = E.legalMoves(p.hand, state.board);
    if (!moves.length) {
      el.coachHint.textContent = 'No tienes jugadas legales — debes pasar.';
      return;
    }
    isAnalyzing = true;
    el.btnAnalyze.disabled = true;
    el.btnAnalyze.textContent = '⏳ Calculando...';
    el.coachResults.innerHTML = '';
    el.coachHint.textContent = 'Analizando jugada por jugada...';
    el.coachProgress.style.display = 'block';
    el.progressFill.style.width = '0%';
    el.progressText.textContent = '0%';

    // Generar todas las opciones (ficha, lado)
    const options = [];
    if (!state.board.length) {
      moves.forEach(t => options.push({ tile: t, side: 'right' }));
    } else {
      moves.forEach(t => {
        options.push({ tile: t, side: 'left' });
        options.push({ tile: t, side: 'right' });
      });
    }

    const results = [];
    const SIMS = 25; // mundos por jugada (modo estudio)
    let idx = 0;

    // Procesa una opción por tick — la UI respira entre cada una (no se congela)
    function processNext() {
      if (idx >= options.length) { finish(); return; }
      const opt = options[idx];
      const pct = Math.round((idx / options.length) * 100);
      el.coachHint.textContent = `Analizando ${idx + 1}/${options.length}...`;
      el.progressFill.style.width = pct + '%';
      el.progressText.textContent = pct + '%';
      // Actualizar progreso ANTES de calcular (evita sensación de congelado)
      setTimeout(() => {
        // MODO ESTUDIO: analizar desde la perspectiva del jugador de turno,
        // muestreando manos posibles de los rivales (información imperfecta)
        const viewerIdx = state.turn % state.players.length;
        const r = C.analyzeMoveStudy(state, opt.tile, opt.side, viewerIdx, SIMS);
        if (r) results.push(r);
        idx++;
        processNext();
      }, 0);
    }

    function finish() {
      results.sort((a, b) => b.ev - a.ev);
      renderCoach(results);
      highlightBest(results[0]);
      isAnalyzing = false;
      el.btnAnalyze.disabled = false;
      el.btnAnalyze.textContent = '🎯 Analizar jugada (Coach GTO)';
      el.coachProgress.style.display = 'none';
    }

    processNext();
  }

  // Resalta la mejor jugada en la mano y la preselecciona
  function highlightBest(best) {
    if (!best) return;
    document.querySelectorAll('#hand .tile').forEach(node => {
      const a = parseInt(node.dataset.a), b = parseInt(node.dataset.b);
      if (a === best.tile[0] && b === best.tile[1]) {
        node.classList.add('best-tile');
        selectTile(best.tile);
      }
    });
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
  el.btnPlay.addEventListener('click', playSelected);
  el.btnEditHands.addEventListener('click', toggleEditor);
  el.btnEditorClear.addEventListener('click', clearEditor);
  el.btnEditorApply.addEventListener('click', applyHands);
  el.btnEditorRandom.addEventListener('click', randomHands);
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
  initEditor();

  // ============================================================
  // EDITOR DE MANOS DE ESTUDIO
  // Dos modalidades: asignación manual + generación aleatoria
  // ============================================================

  const PLAYER_NAMES = ['Tú', 'CPU 1', 'CPU 2', 'CPU 3'];
  let editorState = {
    visible: false,
    activePlayer: 0,
    hands: [[], [], [], []],       // fichas asignadas a cada jugador
    selectedBank: null,            // ficha seleccionada del banco
  };

  function initEditor() {
    clearEditor();
  }

  function toggleEditor() {
    editorState.visible = !editorState.visible;
    el.handEditor.style.display = editorState.visible ? 'block' : 'none';
    if (editorState.visible) renderEditor();
  }

  // Render completo del editor
  function renderEditor() {
    // Jugadores
    el.editorPlayers.innerHTML = PLAYER_NAMES.map((name, i) => {
      const active = i === editorState.activePlayer ? ' active' : '';
      const tiles = editorState.hands[i];
      const slots = [];
      for (let s = 0; s < 7; s++) {
        if (s < tiles.length) {
          const t = tiles[s];
          slots.push(`<div class="ep-slot filled" data-player="${i}" data-slot="${s}" data-a="${t[0]}" data-b="${t[1]}">
            <span class="ep-half"><span class="ep-dot"></span><span class="ep-dot"></span></span>
            <span class="ep-half"><span class="ep-dot"></span><span class="ep-dot"></span></span>
          </div>`);
        } else {
          slots.push(`<div class="ep-slot" data-player="${i}" data-slot="${s}">+</div>`);
        }
      }
      return `<div class="editor-player${active}" data-player="${i}">
        <div class="ep-name">${name} <small>(${tiles.length}/7)</small></div>
        <div class="ep-tiles">${slots.join('')}</div>
      </div>`;
    }).join('');

    // Banco: todas las fichas no usadas
    const used = editorState.hands.flat().map(t => t[0] * 10 + t[1]);
    const bank = E.ALL_TILES.filter(t => !used.includes(t[0] * 10 + t[1]));
    el.bankCount.textContent = bank.length;
    el.bankTiles.innerHTML = bank.map(t =>
      `<div class="bank-tile" data-a="${t[0]}" data-b="${t[1]}">
        <span class="bt-half"><span class="bt-dot"></span><span class="bt-dot"></span></span>
        <span class="bt-half"><span class="bt-dot"></span><span class="bt-dot"></span></span>
      </div>`).join('');

    // Eventos: seleccionar jugador
    el.editorPlayers.querySelectorAll('.editor-player').forEach(node => {
      node.addEventListener('click', () => {
        editorState.activePlayer = parseInt(node.dataset.player);
        renderEditor();
      });
    });

    // Eventos: slots (quitar ficha)
    el.editorPlayers.querySelectorAll('.ep-slot.filled').forEach(node => {
      node.addEventListener('click', (e) => {
        e.stopPropagation();
        const pi = parseInt(node.dataset.player);
        const si = parseInt(node.dataset.slot);
        editorState.hands[pi].splice(si, 1);
        renderEditor();
      });
    });

    // Eventos: banco (seleccionar ficha → asignar al jugador activo)
    el.bankTiles.querySelectorAll('.bank-tile').forEach(node => {
      node.addEventListener('click', () => {
        const a = parseInt(node.dataset.a), b = parseInt(node.dataset.b);
        addTileToActive(a, b);
      });
    });
  }

  // Agrega una ficha al jugador activo (si tiene espacio)
  function addTileToActive(a, b) {
    const pi = editorState.activePlayer;
    if (editorState.hands[pi].length >= 7) {
      alert(`${PLAYER_NAMES[pi]} ya tiene 7 fichas.`);
      return;
    }
    // Evitar duplicados
    const exists = editorState.hands[pi].some(t => t[0] === a && t[1] === b);
    if (exists) return;
    editorState.hands[pi].push([a, b]);
    renderEditor();
  }

  // Genera manos aleatorias completas (reparto estándar)
  function randomHands() {
    const players = PLAYER_NAMES.map((n, i) => new E.Player(n, (i % 2) + 1));
    E.dealTiles(players);
    editorState.hands = players.map(p => p.hand.slice());
    renderEditor();
  }

  function clearEditor() {
    editorState.hands = [[], [], [], []];
    editorState.activePlayer = 0;
    renderEditor();
  }

  // Aplica las manos editadas al juego y empieza a estudiar
  function applyHands() {
    // Validar: 7 fichas por jugador
    const incomplete = editorState.hands.some(h => h.length !== 7);
    if (incomplete) {
      alert('Todos los jugadores deben tener exactamente 7 fichas.');
      return;
    }
    // Validar: sin duplicados entre jugadores
    const all = editorState.hands.flat();
    const seen = new Set(all.map(t => t[0] * 10 + t[1]));
    if (seen.size !== 28) {
      alert('Hay fichas duplicadas o faltantes. Revisa las manos.');
      return;
    }

    // Crear el juego con las manos editadas
    const players = PLAYER_NAMES.map((n, i) => new E.Player(n, (i % 2) + 1));
    players.forEach((p, i) => { p.hand = editorState.hands[i].map(t => [t[0], t[1]]); });
    state = new E.GameState(players);
    selectedTile = null;
    el.btnPlay.style.display = 'none';
    el.coachResults.innerHTML = '';
    el.coachHint.textContent = 'Manos de estudio aplicadas. Analiza desde la perspectiva del jugador de turno.';
    el.handEditor.style.display = 'none';
    editorState.visible = false;
    renderBoard();
    renderHand();
    updateTurnInfo();
  }
})();
