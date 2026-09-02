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
  let perspective = 0; // jugador cuya perspectiva mostramos (0-3)

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
    modalidadSelect: document.getElementById('modalidad-select'),
    // Mesa
    playerTop: document.getElementById('player-top'),
    playerLeft: document.getElementById('player-left'),
    playerRight: document.getElementById('player-right'),
    playerBottomInfo: document.getElementById('player-bottom-info'),
    perspectiveButtons: document.getElementById('perspective-buttons'),
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
  // Tiempo de pensada seleccionado ('sin' | 'breve' | 'larga')
  let thinkSelected = 'sin';
  function getThinkTime() { return thinkSelected; }
  function setThinkTime(t) {
    thinkSelected = t;
    document.querySelectorAll('.think-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.think === t);
    });
  }

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

  // Ficha vertical mini (para resultados del Coach)
  function tileHTML(t) {
    const [a, b] = t;
    return `<div class="tile tile-sm" data-a="${a}" data-b="${b}">
      <div class="half">${renderPips(a)}</div>
      <div class="divider"></div>
      <div class="half">${renderPips(b)}</div>
    </div>`;
  }

  // Posición de cada jugador en la mesa según la perspectiva
  // El dominó se juega en sentido CONTRARIO a las agujas del reloj:
  //   - El compañero está ENFRENTE (arriba)
  //   - El SIGUIENTE jugador (perspIdx+1) se sienta a la DERECHA
  //   - El ANTERIOR (perspIdx-1) se sienta a la IZQUIERDA
  // Ejemplo desde A: B a la derecha, D a la izquierda, C enfrente.
  function tablePositions(perspIdx) {
    const players = state.players;
    const teammate = players.findIndex((p, i) => i !== perspIdx && p.teamId === players[perspIdx].teamId);
    const left = (perspIdx + 3) % 4;  // el anterior (contra-reloj) → izquierda
    const right = (perspIdx + 1) % 4; // el siguiente (contra-reloj) → derecha
    return { me: perspIdx, teammate, left, right };
  }

  // Tarjeta de jugador (nombre, letra, fichas boca abajo o vacío)
  function playerCard(idx, isMe, isTeammate) {
    const p = state.players[idx];
    const letter = 'ABCD'[idx];
    const meCls = isMe ? ' me' : '';
    const teamCls = p.teamId === 1 ? ' team1' : ' team2';
    const teamLabel = p.teamId === 1 ? 'Equipo A' : 'Equipo B';
    const cards = p.hand.map(() => '<div class="card-back"></div>').join('');
    const count = p.hand.length;
    return `
      <div class="player-name${meCls}${teamCls}">
        <span class="p-letter">${letter}</span> ${p.name}
        ${isTeammate ? ' 🤝' : ''}
      </div>
      <div class="player-sub">${teamLabel} · ${count} fichas</div>
      <div class="player-cards">${cards}</div>`;
  }

  function renderBoard() {
    if (!state.board.length) {
      el.board.innerHTML = '<div class="board-empty">Tablero vacío — juega la primera ficha</div>';
      return;
    }

    // state.board guarda fichas ORIENTADAS correctamente por el motor:
    //   [n_izq, n_der] con t[i][1] === t[i+1][0] (Mickey-Mickey).
    // UNA SOLA LÍNEA CONTINUA — nunca se rompe:
    //   - El ancho de cada ficha se calcula en JS según las fichas totales
    //   - Con pocas fichas: grandes. Con muchas: más pequeñas, pero TODAS
    //     en una línea fluida, tocándose (Mickey con Mickey)
    //   - Los dobles van perpendiculares (verticales) pero en la línea
    const tiles = state.board;

    // Calcular ancho de ficha para que quepan todas en una línea
    const boardEl = document.querySelector('.board');
    const availW = (boardEl ? boardEl.clientWidth : 300) - 10;
    const gap = 2;
    // Ancho de ficha horizontal = halfW*2 + divider + padding
    // Objetivo: quepan todas con margen
    const maxHalf = 26; // máximo tamaño en desktop
    const minHalf = 8;
    let halfW = Math.floor((availW - gap * (tiles.length - 1) - 6) / (tiles.length * 2 + 1));
    halfW = Math.max(minHalf, Math.min(maxHalf, halfW));
    // La ficha vertical (doble) ocupa ~halfW+6 de ancho; compensar
    const nDoubles = tiles.filter(t => t[0] === t[1]).length;
    if (nDoubles) {
      const adjust = Math.floor((availW - gap * (tiles.length - 1) - 6 - nDoubles * (halfW + 6)) / (tiles.length * 2 + 1));
      if (adjust > minHalf + 2) halfW = Math.max(minHalf, Math.min(maxHalf, adjust));
    }

    let html = `<div class="board-chain" style="--halfw:${halfW}px">`;
    tiles.forEach(t => {
      const isDouble = t[0] === t[1];
      let cls = 'tile tile-board';
      cls += isDouble ? ' tile-v' : ' tile-h';
      html += `<div class="${cls}" data-a="${t[0]}" data-b="${t[1]}">
        <div class="half">${renderPips(t[0])}</div>
        <div class="divider"></div>
        <div class="half">${renderPips(t[1])}</div>
      </div>`;
    });
    html += '</div>';

    el.board.innerHTML = html;
  }

  // Bitácora de la mano (notación: quién jugó qué, en orden)
  function renderSequence() {
    const seqEl = document.getElementById('sequence');
    if (!seqEl) return;
    let label = '<span class="sequence-label">📜 Bitácora de la mano · S=Sin pensada · B=Breve · L=Larga</span>';
    if (!state.history.length && !state.passed.length) {
      seqEl.innerHTML = label + '<div class="sequence-empty">— aún no hay jugadas —</div>';
      return;
    }
    try {
      seqEl.innerHTML = label + window.Notation.readHand(state);
    } catch (e) {
      seqEl.innerHTML = label + '<div class="sequence-empty">...</div>';
    }
  }

  // Render de la mesa completa según la perspectiva
  function renderTable() {
    const pos = tablePositions(perspective);
    // Compañero arriba (enfrente)
    el.playerTop.innerHTML = playerCard(pos.teammate, false, true);
    // Rivales a los lados
    el.playerLeft.innerHTML = playerCard(pos.left, false, false);
    el.playerRight.innerHTML = playerCard(pos.right, false, false);
    // Yo abajo (mano visible)
    const me = state.players[pos.me];
    el.playerBottomInfo.innerHTML = playerCard(pos.me, true, false);
    // La mano visible es la del jugador de perspectiva
    renderHandFor(pos.me);
  }

  // Render de la mano del jugador indicado (visible solo para él)
  function renderHandFor(idx) {
    const p = state.players[idx];
    el.hand.innerHTML = p.hand.map((t, i) => {
      const sel = selectedTile && selectedTile[0] === t[0] && selectedTile[1] === t[1] ? ' selected' : '';
      return `<div class="tile${sel}" data-idx="${i}" data-a="${t[0]}" data-b="${t[1]}">
        <div class="half">${renderPips(t[0])}</div>
        <div class="divider"></div>
        <div class="half">${renderPips(t[1])}</div>
      </div>`;
    }).join('');

    // Click en ficha para seleccionar (solo si es la perspectiva y es su turno)
    el.hand.querySelectorAll('.tile').forEach(node => {
      node.addEventListener('click', () => {
        if (perspective !== state.turn % 4) {
          alert('No es el turno de este jugador.');
          return;
        }
        const a = parseInt(node.dataset.a), b = parseInt(node.dataset.b);
        selectTile([a, b]);
      });
    });
  }

  // Render de los botones de perspectiva
  function renderPerspectiveButtons() {
    el.perspectiveButtons.innerHTML = 'ABCD'.split('').map((letter, i) => {
      const p = state.players[i];
      const team = p.teamId === 1 ? 'A' : 'B';
      const active = i === perspective ? ' active' : '';
      return `<button class="perspective-btn${active}" data-p="${i}">${letter} · ${p.name} <small>(Eq ${team})</small></button>`;
    }).join('');

    el.perspectiveButtons.querySelectorAll('.perspective-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        perspective = parseInt(btn.dataset.p);
        selectedTile = null;
        el.btnPlay.style.display = 'none';
        renderPerspectiveButtons();
        renderTable();
        renderBoard();
        renderSequence();
        updateTurnInfo();
      });
    });
  }

  function selectTile(tile) {
    if (!E.legalMoves(state.currentPlayer().hand, state.board).some(t => t[0] === tile[0] && t[1] === tile[1])) return;
    selectedTile = tile;
    // Mostrar botón Jugar si el tablero tiene fichas y hay lado a elegir
    el.btnPlay.style.display = 'block';
    renderHandFor(perspective);
    updateTurnInfo();
  }

  function updateTurnInfo() {
    const p = state.currentPlayer();
    const persp = state.players[perspective];
    el.turn.textContent = `Turno: ${p.name} (${p.teamId === 1 ? 'Eq A' : 'Eq B'}) · Viendo: ${persp.name} (${'ABCD'[perspective]})`;
    const moves = E.legalMoves(p.hand, state.board);
    // El botón pasar solo es útil si vemos al jugador de turno
    const isViewingTurn = perspective === state.turn % 4;
    el.btnPass.disabled = !isViewingTurn || moves.length > 0;
    if (!isViewingTurn) {
      el.btnPass.textContent = '—';
    } else if (moves.length) {
      el.btnPass.textContent = 'Pasar';
    } else {
      el.btnPass.textContent = 'No tienes jugadas — Pasar';
    }
  }

  // ---- Acciones ----
  function newGame() {
    const players = [
      new E.Player('Salidor - Jugador A', 1),
      new E.Player('Jugador B', 2),
      new E.Player('Jugador C', 1),
      new E.Player('Jugador D', 2),
    ];
    E.dealTiles(players);
    state = new E.GameState(players);
    selectedTile = null;
    el.btnPlay.style.display = 'none';
    el.coachResults.innerHTML = '';
    el.coachHint.textContent = 'Toca "Analizar jugada" para que el Coach calcule la mejor opción.';
    renderPerspectiveButtons();
    renderTable();
    renderBoard();
    renderSequence();
    updateTurnInfo();
  }

  function playSelected() {
    if (!selectedTile) {
      alert('Selecciona una ficha de tu mano primero.');
      return;
    }
    const p = state.currentPlayer();
    // Determinar el lado de forma INTELIGENTE:
    // 1. Tablero vacío → derecha (sin preguntar)
    // 2. Solo un lado posible → ese lado
    // 3. Ambos extremos con la MISMA pinta → derecha por defecto
    // 4. Cuadre (extremos DIFERENTES, ficha conecta ambos) → preguntar
    //    "¿Cuadrar a X o cuadrar a Y?" (no izquierda/derecha)
    let side = 'right';
    if (state.board.length) {
      const ends = state.boardEnds();
      const leftOk = E.orientations(selectedTile, ends[0]).length > 0;
      const rightOk = E.orientations(selectedTile, ends[1]).length > 0;

      if (leftOk && rightOk) {
        if (ends[0] === ends[1]) {
          // Misma pinta en ambos extremos → derecha por defecto (sin preguntar)
          side = 'right';
        } else {
          // CUADRE: extremos diferentes y la ficha conecta ambos.
          // IMPORTANTE: "cuadrar a X" = dejar el palo X abierto en
          // ambos extremos. Para eso conectamos el palo OPUESTO:
          //   - Cuadrar a ends[0] (izquierda) → conectar ends[1] (derecha)
          //   - Cuadrar a ends[1] (derecha) → conectar ends[0] (izquierda)
          const cuadrarIzq = window.confirm(
            `¿Cuadrar a ${ends[0]} (OK) o cuadrar a ${ends[1]} (Cancelar)?`
          );
          side = cuadrarIzq ? 'right' : 'left';
        }
      } else if (leftOk) {
        side = 'left';
      } else {
        side = 'right';
      }
    }
    const ok = E.applyMove(state, p, selectedTile, side);
    if (!ok) { alert('Jugada inválida.'); return; }
    // Registrar el tiempo de pensada (la señal que recibe el compañero)
    const think = getThinkTime();
    const lastMove = state.history[state.history.length - 1];
    if (lastMove) lastMove.think = think;
    selectedTile = null;
    el.btnPlay.style.display = 'none';
    state.advanceTurn();
    // MODO ESTUDIO: rotar la vista al siguiente jugador automáticamente
    perspective = state.turn % 4;
    renderPerspectiveButtons();
    renderTable();
    renderBoard();
    renderSequence();
    updateTurnInfo();
    // Revisar fin de partida
    checkEnd();
  }

  function isHumanTurn() {
    return state.currentPlayer().name === 'Salidor - Jugador A';
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
    renderTable();
    renderBoard();
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
    el.coachHint.textContent = 'Generando mundos posibles y proyectando desenlaces...';
    el.coachProgress.style.display = 'block';
    el.progressFill.style.width = '0%';
    el.progressText.textContent = '0%';

    // Análisis de máxima calidad: mundos compatibles (una sola vez) +
    // rivales racionales + EV promedio de todos los desenlaces.
    // analyzeAllStudy genera los mundos UNA vez y evalúa cada ficha
    // solo en los lados donde encaja → sin fichas repetidas por ruido.
    const viewerIdx = perspective;
    const modalidad = el.modalidadSelect ? el.modalidadSelect.value : 'todas';
    const SIMS = 150;

    // Procesar en ticks para que la barra avance y la UI respire
    let tick = 0;
    const TICKS = 4; // dividir el cálculo en 4 pasos visuales

    function processNext() {
      tick++;
      const pct = Math.round((tick / TICKS) * 100);
      el.progressFill.style.width = pct + '%';
      el.progressText.textContent = pct + '%';
      el.coachHint.textContent = `Proyectando desenlaces... ${pct}%`;

      if (tick >= TICKS) {
        // Calcular el resultado final (los mundos se generan 1 vez)
        try {
          const results = C.analyzeAllStudy(state, viewerIdx, SIMS, [], modalidad);
          finish(results);
        } catch (e) {
          el.coachHint.textContent = '⚠️ Error en el análisis: ' + e.message;
          finish([]);
        }
        return;
      }
      setTimeout(processNext, 30);
    }

    function finish(results) {
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
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`;
      const sideLabel = r.side === 'left' ? '← izquierda' : r.side === 'right' ? '→ derecha' : '';
      // EV = puntos promedio ganados (+) o perdidos (-)
      const signo = r.ev > 0 ? '+' : '';
      const evCls = i === 0 ? 'ev best-ev' : (r.ev < 0 ? 'ev neg' : 'ev');
      // Transparencia: error estándar (cuánto ruido tiene la estimación)
      const seNote = (typeof r.stdErr !== 'undefined' && r.stdErr !== null)
        ? `<span style="font-size:0.72rem;opacity:0.65;margin-left:6px">±${r.stdErr}</span>`
        : '';
      return `
        <div class="${cls}">
          <span class="rank">${medal}</span>
          <span class="tile-mini">${tileHTML(r.tile)}</span>
          <span style="font-size:0.85rem;opacity:0.8">${sideLabel}</span>
          <span class="${evCls}">EV ${signo}${r.ev}${seNote}</span>
        </div>`;
    }).join('');
    const modalidad = el.modalidadSelect ? el.modalidadSelect.value : 'todas';
    const modoLabel = modalidad === 'solo_contrarios' ? 'Solo contrarios' : 'Contándolas todas';
    el.coachHint.textContent = `🥇 Mayor EV = más puntos que ganas en promedio. Punteo: ${modoLabel}.`;
  }

  // ---- Eventos ----
  el.btnNew.addEventListener('click', newGame);
  el.btnPlay.addEventListener('click', playSelected);
  el.btnEditHands.addEventListener('click', toggleEditor);
  el.btnEditorClear.addEventListener('click', clearEditor);
  el.btnEditorApply.addEventListener('click', applyHands);
  el.btnEditorRandom.addEventListener('click', randomHands);
  // Selector de tiempo de pensada (la señal al compañero)
  document.querySelectorAll('.think-btn').forEach(btn => {
    btn.addEventListener('click', () => setThinkTime(btn.dataset.think));
  });
  el.btnPass.addEventListener('click', () => {
    const p = state.currentPlayer();
    const moves = E.legalMoves(p.hand, state.board);
    if (moves.length) { alert('Tienes jugadas legales — no puedes pasar.'); return; }
    state.passed.push(p.name);
    state.advanceTurn();
    // Rotar vista al siguiente jugador
    perspective = state.turn % 4;
    renderPerspectiveButtons();
    renderTable();
    renderBoard();
    renderSequence();
    updateTurnInfo();
    checkEnd();
  });
  el.btnAnalyze.addEventListener('click', analyze);

  // Iniciar
  newGame();

  // ============================================================
  // EDITOR DE MANOS DE ESTUDIO
  // Dos modalidades: asignación manual + generación aleatoria
  // ============================================================

  const PLAYER_NAMES = ['Salidor - Jugador A', 'Jugador B', 'Jugador C', 'Jugador D'];
  let editorState = {
    visible: false,
    activePlayer: 0,
    hands: [[], [], [], []],       // fichas asignadas a cada jugador
    selectedBank: null,            // ficha seleccionada del banco
  };

  initEditor();

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
            <div class="ep-pips">${renderPips(t[0])}</div>
            <div class="ep-divider"></div>
            <div class="ep-pips">${renderPips(t[1])}</div>
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
        <div class="bt-pips">${renderPips(t[0])}</div>
        <div class="bt-divider"></div>
        <div class="bt-pips">${renderPips(t[1])}</div>
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
    perspective = 0;
    renderPerspectiveButtons();
    renderTable();
    renderBoard();
    renderSequence();
    updateTurnInfo();
  }
})();
