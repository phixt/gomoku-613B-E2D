import "./style/main.css";
import { LIGHT_THEME, DARK_THEME } from "./core/Types";
import type { Theme } from "./core/Types";
import { LeftPanel } from "./views/LeftPanel";
import { RightPanel } from "./views/RightPanel";
import { LAYER_COUNT, PANEL_RATIO, SAVE_SLOT_COUNT, QUICK_SAVE_INDEX, BOARD_SIZE } from "./core/Config";
import { eventBus, Events } from "./core/EventBus";
import { gameStore } from "./core/GameStore";
import { SaveManager, type SaveData } from "./core/SaveManager";
import { LocalStorageAdapter } from "./core/LocalStorageAdapter";
import type { IStorageAdapter } from "./core/StorageAdapter";
import { OverlayManager } from "./ui/OverlayManager";
import { audioManager } from "./audio/AudioManager";
import { AIEngine } from "./ai/AIEngine";
import * as THREE from "three";
import { resourceManager } from "./utils/ResourceManager";
import { UI_TEXT } from "./core/TextConstants";

const AppState = {
  TITLE: "TITLE",
  GUIDE_FROM_TITLE: "GUIDE_FROM_TITLE",
  PLAYING: "PLAYING",
  PAUSED: "PAUSED",
  GAME_OVER: "GAME_OVER",
  REPLAY: "REPLAY",
  GUIDE_FROM_GAME: "GUIDE_FROM_GAME"
} as const;
type AppState = typeof AppState[keyof typeof AppState];

async function main(): Promise<void> {
  const leftEl = document.getElementById("left-panel");
  const rightEl = document.getElementById("right-panel");
  if (!leftEl || !rightEl) throw new Error("Missing #left-panel or #right-panel element");


  // Initialize storage adapter based on environment
  let adapter: IStorageAdapter;
  if (import.meta.env.VITE_IS_TAURI) {
    console.log("[Init] Running in Tauri environment, loading TauriStoreAdapter...");
    try {
      const { TauriStoreAdapter } = await import("./core/TauriStoreAdapter");
      const tauriAdapter = new TauriStoreAdapter();
      await tauriAdapter.init();
      adapter = tauriAdapter;
    } catch (e) {
      console.error("[Init] Failed to load TauriStoreAdapter, falling back to LocalStorageAdapter:", e);
      adapter = new LocalStorageAdapter();
    }
  } else {
    console.log("[Init] Running in Web environment, using LocalStorageAdapter...");
    adapter = new LocalStorageAdapter();
  }
  const saveManager = new SaveManager(adapter);

  gameStore.appState = AppState.TITLE;
  let currentTheme: Theme = LIGHT_THEME;
  document.body.classList.remove("dark-theme");

  const escMenu = document.getElementById("esc-menu");
  const escResume = document.getElementById("esc-resume");
  const escRestart = document.getElementById("esc-restart");
  const escSave = document.getElementById("esc-save");
  const escTitle = document.getElementById("esc-title");
  const startScreen = document.getElementById("start-screen");
  const startBtn = document.getElementById("start-btn");
  const guideBtn = document.getElementById("guide-btn");
  const guideScreen = document.getElementById("guide-screen");

  const leftPanel = new LeftPanel(leftEl, currentTheme);
  const rightPanel = new RightPanel(rightEl, currentTheme);
  rightPanel.setGameActiveCallback(() => gameStore.appState === AppState.PLAYING);
  var overlayManager = new OverlayManager({
    onSave: function (index, data) {
      saveManager.save(index, data);
      overlayManager.showToast(UI_TEXT.SAVE_SUCCESS(index === QUICK_SAVE_INDEX ? UI_TEXT.QUICK_SAVE_LABEL : String(index + 1)));
    },
    onLoad: function (data) {
      loadGameFromData(data);
    },
    onDelete: function (index) {
      saveManager.delete(index);
      overlayManager.showToast(UI_TEXT.DELETE_SUCCESS(index + 1));
    },
    serializeState: function () {return serializeBoardState();},
    onGetSlots: function () {return saveManager.getSlots();},
    onLoadByIndex: function (index) {return saveManager.load(index);}
  });

  rightPanel.onPieceChanged = (board: import("./core/Board").Board, z: number): void => {
    leftPanel.renderAllPieces(board, z);
  };

  rightPanel.on3DAuxDataChanged = (data): void => {
    leftPanel.update3DAuxData(data);
  };

  rightPanel.onHoverChanged = (x, y, z): void => {
    if (x >= 0) leftPanel.updateHoverMarker(x, y, z);else
    leftPanel.clearHoverMarker();
  };

  // Turn control and placement callback
  rightPanel.setTurnCallback(() => {
    // Block clicks when not actively PLAYING (includes GAME_OVER, PAUSED, etc.)
    if (gameStore.appState !== AppState.PLAYING) return false;
    // PvP: both players can click; PvE: only the human's color can click
    return !isPvEMode || currentPlayer === playerColor;
  });

  rightPanel.onGameWonCallback = (winner: 1 | 2): void => {
    console.log("[Game] Player", winner, "won!");
    if (aiEngine) { aiEngine.cancel(); }
    isAIThinking = false;
    gameStore.appState = AppState.GAME_OVER;
    audioManager.playSFX("win");
    const modal = document.getElementById("victory-modal");
    const title = document.getElementById("victory-title");
    const subtitle = document.getElementById("victory-subtitle");
    if (modal && title && subtitle) {
      title.textContent = winner === 1 ? UI_TEXT.BLACK_WIN : UI_TEXT.WHITE_WIN;
      subtitle.textContent = UI_TEXT.GAME_OVER_SUBTITLE(moveCount);
      modal.classList.remove("hidden");
    }
  };

  rightPanel.onPiecePlaced = (_x: number, _y: number, _z: number, player: number): void => {
    moveCount++;
    moveHistory.push({ x: _x, y: _y, z: _z, player: player as 1 | 2 });
    audioManager.playSFX("click");
    rightPanel.updateLastMoveUI(_x, _y, _z);
    leftPanel.updateLastMoveUI(_x, _y, _z);
    currentPlayer = player === 1 ? 2 : 1;
    overlayManager.showToast(currentPlayer === 1 ? UI_TEXT.BLACK_TURN : UI_TEXT.WHITE_TURN);
    updateTurnIndicator(currentPlayer);
    const aiColor: 1 | 2 = playerColor === 1 ? 2 : 1;
    if (isPvEMode && currentPlayer === aiColor) {
      triggerAIMove();
    }
  };

  const forceCorrectSize = (): void => {
    const lw = leftEl.clientWidth || window.innerWidth * PANEL_RATIO;
    const rw = rightEl.clientWidth || window.innerWidth * PANEL_RATIO;
    const h = window.innerHeight;
    leftPanel.resize(lw, h);
    rightPanel.resize(rw, h);
  };
  requestAnimationFrame(() => {requestAnimationFrame(forceCorrectSize);});

  let focusZ = 0;
  let isColorblindMode = false;
  let isPvEMode = false;
  let currentPlayer: 1 | 2 = 1;
  let playerColor: 1 | 2 = 1; // 1=Black, 2=White
  let aiEngine: AIEngine | null = null;
  let isAIThinking = false;
  let moveCount = 0;
  let moveHistory: Array<{x: number; y: number; z: number; player: 1 | 2;}> = [];

  // ── 3D Turn Indicator (isolated scene) ─────────────────
  const indicatorCanvas = document.getElementById("turn-indicator-canvas") as HTMLCanvasElement;
  let indicatorScene: THREE.Scene | null = null;
  let indicatorCamera: THREE.PerspectiveCamera | null = null;
  let indicatorRenderer: THREE.WebGLRenderer | null = null;
  let indicatorMesh: THREE.Mesh | null = null;
  let indicatorBlackMat: THREE.Material | null = null;
  let indicatorWhiteMat: THREE.Material | null = null;

  if (indicatorCanvas) {
    indicatorScene = new THREE.Scene();
    indicatorCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 10);
    indicatorCamera.position.set(0, 0, 3);

    indicatorRenderer = new THREE.WebGLRenderer({
      canvas: indicatorCanvas,
      alpha: true,
      antialias: true
    });
    indicatorRenderer.setSize(64, 64);
    indicatorRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(1, 1, 1);
    indicatorScene.add(light);
    indicatorScene.add(new THREE.AmbientLight(0xffffff, 0.5));

    // Use same geometry as board pieces
    const geo = resourceManager.getGeometry("piece");
    indicatorBlackMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6, metalness: 0.1 });
    indicatorWhiteMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.4, metalness: 0.1 });

    indicatorMesh = new THREE.Mesh(geo, indicatorBlackMat);
    indicatorScene.add(indicatorMesh);
  }

    const updateTurnIndicator = (player: 1 | 2, isThinking: boolean = false): void => {
    const textEl = document.getElementById("turn-indicator-text");
    const containerEl = document.getElementById("turn-indicator-container");
    if (textEl) {
      if (isThinking) {
        textEl.textContent = UI_TEXT.AI_THINKING;
        textEl.classList.add("thinking");
        if (containerEl) containerEl.classList.add("thinking");
      } else {
        textEl.textContent = player === 1 ? UI_TEXT.BLACK_TURN : UI_TEXT.WHITE_TURN;
        textEl.classList.remove("thinking");
        if (containerEl) containerEl.classList.remove("thinking");
      }
    }
    if (indicatorMesh && !isThinking && indicatorBlackMat && indicatorWhiteMat) {
      indicatorMesh.material = player === 1 ? indicatorBlackMat : indicatorWhiteMat;
    }
  };
  // Fulfill HTML contract: Inject initial turn text (Black always starts)
  updateTurnIndicator(1);
  console.log("[Init] Turn indicator text initialized.");
  leftPanel.renderAllPieces(rightPanel.board, focusZ);

  const animate = (): void => {
    leftPanel.render();
    rightPanel.render();
    if (indicatorRenderer && indicatorScene && indicatorCamera) {
      if (gameStore.appState === AppState.PLAYING) {
        indicatorRenderer.render(indicatorScene, indicatorCamera);
        document.body.classList.add("in-game");
      } else {
        document.body.classList.remove("in-game");
      }
    }
    requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);

  /**
   * Start the game: hide start screen, enable keyboard input.
   */
  const startGame = (): void => {
    if (gameStore.appState === AppState.PLAYING) return;
    hideAllOverlays();
        currentPlayer = 1;
    moveCount = 0;
    moveHistory = [];
    // CRITICAL: Read player color from UI, DO NOT hardcode to 1
    const cw = document.getElementById("color-white") as HTMLInputElement;
    playerColor = (cw && cw.checked) ? 2 : 1;
    console.log("[Game] startGame() Player color:", playerColor === 1 ? "Black" : "White");
    if (isPvEMode) {
      const diffSelect = document.getElementById("ai-difficulty") as HTMLSelectElement;
      aiEngine = new AIEngine(diffSelect?.value as "Easy" | "Medium" | "Hard" || "Easy");
      isAIThinking = false;
      const aiColor: 1 | 2 = playerColor === 1 ? 2 : 1;
      console.log("[Game] AI initialized. AI color:", aiColor === 1 ? "Black" : "White");
    } else {
      if (aiEngine) { aiEngine.cancel(); aiEngine = null; }
    }
    gameStore.appState = AppState.PLAYING;
    rightPanel.setGameActiveCallback(() => gameStore.appState === AppState.PLAYING);
    audioManager.playBGM("game");

    updateTurnIndicator(currentPlayer);

    // If AI plays Black (player chose White), AI must move first
    if (isPvEMode) {
      const aiColor: 1 | 2 = playerColor === 1 ? 2 : 1;
      if (currentPlayer === aiColor) {
        setTimeout(() => triggerAIMove(), 200);
      }
    }

    if (startScreen) {
      startScreen.classList.add("fade-out");
      setTimeout(() => {startScreen.style.display = "none";}, 500);
    }
    setTimeout(forceCorrectSize, 550);
  };



  const triggerAIMove = async (): Promise<void> => {
    if (!aiEngine || isAIThinking) return;
    isAIThinking = true;
    overlayManager.showToast(UI_TEXT.AI_THINKING);
    eventBus.emit(Events.AI_MOVE_REQUEST);
    try {
      const move = await aiEngine.think(rightPanel.board);
      if (move && rightPanel.board.get(move.x, move.y, move.z) === 0) {
        rightPanel.placeAIPiece(move.x, move.y, move.z);
      }
    } catch (_err) {

      // cancelled or no valid moves
    } finally {isAIThinking = false;
    }
  };

  const confirmRestart = (): void => {
    document.getElementById("victory-modal")?.classList.add("hidden");
    if (aiEngine) aiEngine.cancel();
    isAIThinking = false;
    moveCount = 0;
    currentPlayer = 1;
    // Re-read player color from UI on restart
    const cw2 = document.getElementById("color-white") as HTMLInputElement;
    playerColor = (cw2 && cw2.checked) ? 2 : 1;
    rightPanel.board.reset();
    gameStore.setFocusZ(0);
    rightPanel.resetGame();
    leftPanel.renderAllPieces(rightPanel.board, gameStore.focusZ);
    closeEscMenu();
    eventBus.emit(Events.GAME_RESET);
  };

  const openEscMenu = (): void => {
    gameStore.appState = AppState.PAUSED;
    if (escMenu) escMenu.classList.remove("hidden");
  };

  const closeEscMenu = (): void => {
    gameStore.appState = AppState.PLAYING;
    if (escMenu) escMenu.classList.add("hidden");
  };

  // ===== OverlayManager handles Toast & Save Slots =====Save Slots List (EventBus-driven) =====
  const renderSaveSlots = (): void => {
    const list = document.getElementById("save-slots-list");
    if (!list) {
      console.error("[renderSaveSlots] #save-slots-list NOT FOUND in DOM!");
      return;
    }
    list.innerHTML = "";

    // === Quick Save Slot (always first) ===
    const quickData = saveManager.getSlots()[QUICK_SAVE_INDEX];
    const quickDiv = document.createElement("div");
    quickDiv.className = "save-slot quick-save";

    if (quickData) {
      const date = new Date(quickData.timestamp);
      const mm = String(date.getMonth() + 1).padStart(2, "0");
      const dd = String(date.getDate()).padStart(2, "0");
      const hh = String(date.getHours()).padStart(2, "0");
      const min = String(date.getMinutes()).padStart(2, "0");
      const timeStr = mm + "/" + dd + " " + hh + ":" + min;
      const modeStr = quickData.gameMode === "pve" ? "PvE" : "PvP";
      const movesCount = quickData.moves ? quickData.moves.length : 0;
      const aiDiff = quickData.aiDifficulty ? " (" + quickData.aiDifficulty + ")" : "";
      quickDiv.innerHTML =
        '<span class="slot-index">' + UI_TEXT.QUICK_SAVE_LABEL + '</span>' +
        '<span class="slot-meta">' + modeStr + aiDiff + " | " + movesCount + " moves | " + timeStr + '</span>' +
        '<span class="slot-actions">' +
          '<button data-action="quick-load">' + UI_TEXT.SLOT_READ + '</button>' +
          '<button data-action="quick-save">' + UI_TEXT.SLOT_OVERWRITE + '</button>' +
        '</span>';
    } else {
      quickDiv.innerHTML =
        '<span class="slot-index">' + UI_TEXT.QUICK_SAVE_LABEL + '</span>' +
        '<span class="slot-info">' + UI_TEXT.EMPTY_SLOT + '</span>' +
        '<span class="slot-actions">' +
          '<button data-action="quick-save">' + UI_TEXT.SLOT_QUICK + '</button>' +
        '</span>';
    }
    list.appendChild(quickDiv);

    // === Regular Slots ===
    const slots = saveManager.getSlots();
    slots.forEach((data, i) => {
      if (i === QUICK_SAVE_INDEX) return; // already rendered above
      const isEmpty = data === null;
      const div = document.createElement("div");
      div.className = "save-slot" + (isEmpty ? " empty" : "");

      if (!data) {
        div.innerHTML =
          '<span class="slot-index">' + UI_TEXT.SAVE_SLOT_LABEL(i + 1) + '</span>' +
          '<span class="slot-info">' + UI_TEXT.EMPTY_SLOT + '</span>' +
          '<span class="slot-actions">' +
            '<button data-action="overwrite" data-index="' + i + '">' + UI_TEXT.SLOT_FILL + '</button>' +
          '</span>';
      } else {
        const date = new Date(data.timestamp);
        const mm = String(date.getMonth() + 1).padStart(2, "0");
        const dd = String(date.getDate()).padStart(2, "0");
        const hh = String(date.getHours()).padStart(2, "0");
        const min = String(date.getMinutes()).padStart(2, "0");
        const timeStr = mm + "/" + dd + " " + hh + ":" + min;
        const modeStr = data.gameMode === "pve" ? "PvE" : "PvP";
        const movesCount = data.moves ? data.moves.length : 0;
        const aiDiff = data.aiDifficulty ? " (" + data.aiDifficulty + ")" : "";
        div.innerHTML =
          '<span class="slot-index">' + UI_TEXT.SAVE_SLOT_LABEL(i + 1) + '</span>' +
          '<span class="slot-meta">' + modeStr + aiDiff + " | " + movesCount + " moves | " + timeStr + '</span>' +
          '<span class="slot-actions">' +
            '<button data-action="load" data-index="' + i + '">' + UI_TEXT.SLOT_READ + '</button>' +
            '<button data-action="replay" data-index="' + i + '">' + UI_TEXT.BTN_REPLAY + '</button>' +
            '<button data-action="overwrite" data-index="' + i + '">' + UI_TEXT.SLOT_OVERWRITE + '</button>' +
            '<button data-action="delete" data-index="' + i + '">' + UI_TEXT.SLOT_DELETE + '</button>' +
          '</span>';
      }
      list.appendChild(div);
    });

    // Event delegation: single listener for all slot buttons
    list.onclick = (e) => {
      const target = e.target as HTMLElement;
      const action = target.getAttribute("data-action");
      const indexStr = target.getAttribute("data-index");
      if (!action) return;
      const index = indexStr !== null ? parseInt(indexStr, 10) : -1;

      switch (action) {
        case "load":
          const loadData = saveManager.load(index);
          if (loadData) loadGameFromData(loadData);
          break;
        case "overwrite":
          const saveData = serializeBoardState();
          saveManager.save(index, saveData);
          overlayManager.showToast(UI_TEXT.SAVE_SUCCESS(UI_TEXT.SAVE_SLOT_LABEL(index + 1)));
          renderSaveSlots();
          break;
        case "replay":
          const replayData = saveManager.load(index);
          if (replayData) startReplay(replayData);
          break;
        case "delete":
          if (confirm(UI_TEXT.CONFIRM_DELETE(index + 1))) {
            saveManager.delete(index);
            renderSaveSlots();
          }
          break;
        case "quick-load":
          const quickLoadData = saveManager.quickLoad();
          if (quickLoadData) loadGameFromData(quickLoadData);
          break;
        case "quick-save":
          const qsData = serializeBoardState();
          saveManager.quickSave(qsData);
          overlayManager.showToast(UI_TEXT.SAVE_SUCCESS(UI_TEXT.QUICK_SAVE_LABEL));
          renderSaveSlots();
          break;
      }
    };
  };

  eventBus.on(Events.SAVE_UPDATED, () => {
    renderSaveSlots();
  });
  renderSaveSlots();

  const startReplay = (data: SaveData): void => {
    console.log("[Replay] Starting replay for save:", data.id);

    // 1. Cancel any running AI and clear timers
    if (aiEngine) { aiEngine.cancel(); }
    isAIThinking = false;

    // 2. Load board snapshot instantly (DO NOT use loadGameFromData)
    rightPanel.loadBoardSnapshot(data.boardState);

    // 3. Set strict REPLAY state
    gameStore.appState = AppState.REPLAY;

    // 4. Initialize replay data (start at move 0 = empty board)
    replayState = {
        moves: [...data.moves],
        currentIndex: 0
    };

    // 5. Inject Replay Controls UI
    let controls = document.getElementById("replay-controls");
    if (!controls) {
        controls = document.createElement("div");
        controls.id = "replay-controls";
        controls.innerHTML =
            '<button id="btn-replay-prev">上一步</button>' +
            '<span id="replay-step-info">0 / ' + data.moves.length + '</span>' +
            '<button id="btn-replay-next">下一步</button>' +
            '<button id="btn-replay-exit">退出</button>';
        document.body.appendChild(controls);

        document.getElementById("btn-replay-prev")?.addEventListener("click", () => replayStep(-1));
        document.getElementById("btn-replay-next")?.addEventListener("click", () => replayStep(1));
        document.getElementById("btn-replay-exit")?.addEventListener("click", exitReplay);
    }

    // 6. Initial render
    updateReplayUI();
    overlayManager.showToast("进入复盘模式 - 共 " + data.moves.length + " 步");
};

let replayState: {
    moves: Array<{x: number; y: number; z: number; player: 1 | 2}>;
    currentIndex: number;
} | null = null;

const replayStep = (direction: number): void => {
    if (!replayState) return;
    const newIndex = replayState.currentIndex + direction;
    if (newIndex < 0 || newIndex > replayState.moves.length) return;
    replayState.currentIndex = newIndex;
    updateReplayUI();
};

const updateReplayUI = (): void => {
    if (!replayState) return;
    // Clear board
    rightPanel.board.reset();
    // Replay moves up to currentIndex
    for (let i = 0; i < replayState.currentIndex; i++) {
        const m = replayState.moves[i];
        rightPanel.board.set(m.x, m.y, m.z, m.player);
    }
    rightPanel.refresh();
    // Sync 3D view
    leftPanel.renderAllPieces(rightPanel.board, focusZ);
    // Update step info text
    const info = document.getElementById("replay-step-info");
    if (info) {
        info.textContent = replayState.currentIndex + " / " + replayState.moves.length;
    }
};

const exitReplay = (): void => {
    console.log("[Replay] Exiting replay mode");
    const controls = document.getElementById("replay-controls");
    if (controls) controls.remove();
    replayState = null;
    returnToTitle();
};

  const returnToTitle = (): void => {
    document.getElementById("victory-modal")?.classList.add("hidden");
    if (aiEngine) {
      aiEngine.cancel();
      aiEngine = null;
    }
    isAIThinking = false;
    currentPlayer = 1;
    rightPanel.board.reset();
    focusZ = 0;
    rightPanel.resetGame();
    leftPanel.renderAllPieces(rightPanel.board, focusZ);
    gameStore.appState = AppState.TITLE;
    hideAllOverlays();
    startScreen?.classList.remove("hidden");
    startScreen?.classList.remove("fade-out");
    if (startScreen) {
      startScreen.style.display = "";
    }
    audioManager.playBGM("menu");
  };

  const serializeBoardState = (): SaveData => {
    const boardState = rightPanel.getBoardSnapshot();
    const moves = [...moveHistory];
    const gameStatus: "playing" | "finished" = gameStore.appState === AppState.GAME_OVER ? "finished" : "playing";
    const lastMove = moves.length > 0 ? moves[moves.length - 1] : null;
    const gameWinner: 0 | 1 | 2 = gameStore.appState === AppState.GAME_OVER && lastMove
      ? (rightPanel.board.get(lastMove.x, lastMove.y, lastMove.z) as 0 | 1 | 2)
      : 0;
    return {
      id: crypto.randomUUID(),
      version: "2.0.0",
      timestamp: Date.now(),
      boardState,
      moves,
      rules: "gomoku" as const,
      gameMode: isPvEMode ? "pve" as const : "pvp" as const,
      aiDifficulty: aiEngine?.getDifficulty()?.toLowerCase() as "easy" | "medium" | "hard" | undefined,
      status: gameStatus,
      winner: gameWinner,
      currentPlayer: currentPlayer,
      focusZ: focusZ,
      isDarkTheme: currentTheme.name === "dark",
      playerColor: playerColor,
      boardSize: 13,
      layers: LAYER_COUNT,
      layerSpacing: leftPanel.layerSpacing
    };
  };

  const loadGameFromData = (data: SaveData): void => {
    try {
      if (!data) {overlayManager.showToast(UI_TEXT.INVALID_SAVE, true);return;}
      console.log("[Load] Restoring from save:", data.id || "unknown");

      // Restore theme first
      if (data.isDarkTheme != null) {
        currentTheme = data.isDarkTheme ? DARK_THEME : LIGHT_THEME;
        document.body.classList.toggle("dark-theme", data.isDarkTheme);
        eventBus.emit(Events.THEME_TOGGLED, data.isDarkTheme);
      }

      // Restore camera and layer spacing
      focusZ = data.focusZ ?? 0;
      if (data.layerSpacing != null && data.layerSpacing >= 2.0 && data.layerSpacing <= 6.0) {
        leftPanel.restoreCameraState(focusZ, data.layerSpacing);
      }

      // Instant-load board snapshot
      if (data.boardState && Array.isArray(data.boardState)) {
        rightPanel.loadBoardSnapshot(data.boardState);
      } else if (data.moves) {
        // Fallback: replay moves for legacy saves
        rightPanel.board.reset();
        for (const move of data.moves) {
          if (move.x >= 0 && move.x < BOARD_SIZE && move.y >= 0 && move.y < BOARD_SIZE && move.z >= 0 && move.z < LAYER_COUNT) {
            rightPanel.board.set(move.x, move.y, move.z, move.player as any);
          }
        }
        rightPanel.refresh();
      } else {
        overlayManager.showToast(UI_TEXT.INVALID_SAVE, true);
        return;
      }

      // Restore move history
      moveHistory = data.moves ? [...data.moves] : [];

      // Restore turn state
      if (data.currentPlayer === 1 || data.currentPlayer === 2) {
        rightPanel.setCurrentPlayer(data.currentPlayer);
        currentPlayer = data.currentPlayer;
      }
      playerColor = (data.playerColor === 1 || data.playerColor === 2) ? data.playerColor : 1;
      // Sync UI radio buttons with loaded playerColor
      const cwRadio = document.getElementById("color-white") as HTMLInputElement;
      const cbRadio = document.getElementById("color-black") as HTMLInputElement;
      if (cwRadio && cbRadio) {
        cwRadio.checked = playerColor === 2;
        cbRadio.checked = playerColor === 1;
      }

      // Restore game mode and AI
      if (data.gameMode === "pve") {
        isPvEMode = true;
        aiEngine = new AIEngine(data.aiDifficulty as "Easy" | "Medium" | "Hard" || "Easy");
        isAIThinking = false;
      } else {
        isPvEMode = false;
        if (aiEngine) { aiEngine.cancel(); aiEngine = null; }
      }

      // Sync 3D view
      leftPanel.renderAllPieces(rightPanel.board, focusZ);

      // State-aware transition
      if (gameStore.appState === AppState.TITLE || gameStore.appState === AppState.GUIDE_FROM_TITLE) {
        const ss = document.getElementById("start-screen");
        const gs = document.getElementById("guide-screen");
        if (ss) {
          ss.style.display = "";
          ss.classList.add("hidden");
        }
        gs?.classList.add("hidden");
        gameStore.appState = AppState.PLAYING;
        updateTurnIndicator(currentPlayer);
        forceCorrectSize();
      } else if (gameStore.appState === AppState.PAUSED || gameStore.appState === AppState.GUIDE_FROM_GAME) {
        closeEscMenu();
      }
      overlayManager.showToast(UI_TEXT.SAVE_LOADED);

      // Handle AI turn edge case after loading
      if (isPvEMode) {
        const aiColor: 1 | 2 = playerColor === 1 ? 2 : 1;
        if (currentPlayer === aiColor) {
          console.log("[Load] AI turn after loading, triggering...");
          setTimeout(() => triggerAIMove(), 500);
        }
      }
    } catch (err) {
      console.error("[Load] Failed:", err);
      overlayManager.showToast(UI_TEXT.SAVE_FAILED, true);
    }
  };

  const saveGame = (): void => {
    const data = serializeBoardState();
    // Find first empty slot, or overwrite quick save slot if all full
    let targetIndex = -1;
    for (let i = 0; i < SAVE_SLOT_COUNT; i++) {
      if (saveManager.getSlots()[i] === null) {targetIndex = i;break;}
    }
    if (targetIndex === -1) targetIndex = QUICK_SAVE_INDEX;
    saveManager.save(targetIndex, data);
    const slotName = targetIndex === QUICK_SAVE_INDEX ? UI_TEXT.QUICK_SAVE_LABEL : String(targetIndex + 1);
    overlayManager.showToast(UI_TEXT.SAVE_SUCCESS(slotName));
    const base64 = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
    navigator.clipboard.writeText(base64).then(() => {
      console.log("[Save] Copied to clipboard");
    }).catch(() => {
      console.log("[Save] Clipboard unavailable");
    });
  };




  if (startBtn) startBtn.addEventListener("click", startGame);

  // ===== Guide Screen State Machine =====
  const guideBtnPrimary = document.getElementById("guide-btn-primary");
  const guideBtnSecondary = document.getElementById("guide-btn-secondary");
  const escGuideBtn = document.getElementById("esc-guide");

  const hideAllOverlays = (): void => {
    startScreen?.classList.add("hidden");
    guideScreen?.classList.add("hidden");
    escMenu?.classList.add("hidden");
    overlayManager.closeAll();
  };

  const backToTitle = (): void => {
    rightPanel.board.reset();
    focusZ = 0;
    hideAllOverlays();
    startScreen?.classList.remove("hidden");
    gameStore.appState = AppState.TITLE;
    rightPanel.refresh();
    leftPanel.renderAllPieces(rightPanel.board, focusZ);
    rightPanel.setGameActiveCallback(() => gameStore.appState === AppState.PLAYING);
  };

  const backToGame = (): void => {
    hideAllOverlays();
    gameStore.appState = AppState.PLAYING;
    gameStore.appState = AppState.PLAYING;
  };

  const updateGuideButtons = (): void => {
    if (!guideBtnPrimary || !guideBtnSecondary) return;
    const oldP = guideBtnPrimary;
    const oldS = guideBtnSecondary;
    const newP = oldP.cloneNode(true) as HTMLElement;
    const newS = oldS.cloneNode(true) as HTMLElement;
    oldP.replaceWith(newP);
    oldS.replaceWith(newS);
    const btnP = document.getElementById("guide-btn-primary");
    const btnS = document.getElementById("guide-btn-secondary");
    if (gameStore.appState === AppState.GUIDE_FROM_TITLE) {
      if (btnP) {btnP.textContent = UI_TEXT.BTN_START_GAME;btnP.addEventListener("click", () => {hideAllOverlays();startGame();});}
      if (btnS) {btnS.textContent = UI_TEXT.BTN_BACK;btnS.addEventListener("click", backToTitle);}
    } else {
      if (btnP) {btnP.textContent = UI_TEXT.BTN_NEW_GAME;btnP.addEventListener("click", () => {hideAllOverlays();gameStore.appState = AppState.PLAYING;confirmRestart();});}
      if (btnP) {btnP.textContent = UI_TEXT.BTN_NEW_GAME;btnP.addEventListener("click", () => {hideAllOverlays();gameStore.appState = AppState.PLAYING;confirmRestart();});}
      if (btnS) {btnS.textContent = UI_TEXT.BTN_RESUME;btnS.addEventListener("click", backToGame);}
    }
  };

  guideBtn?.addEventListener("click", () => {
    gameStore.appState = AppState.GUIDE_FROM_TITLE;
    hideAllOverlays();
    guideScreen?.classList.remove("hidden");
    updateGuideButtons();
  });

  escGuideBtn?.addEventListener("click", () => {
    closeEscMenu();
    gameStore.appState = AppState.GUIDE_FROM_GAME;
    guideScreen?.classList.remove("hidden");
    updateGuideButtons();
  });

  escResume?.addEventListener("click", closeEscMenu);
  escRestart?.addEventListener("click", () => {closeEscMenu();confirmRestart();});
  document.getElementById("btn-victory-restart")?.addEventListener("click", () => {
    document.getElementById("victory-modal")?.classList.add("hidden");
    confirmRestart();
  });
  document.getElementById("btn-victory-title")?.addEventListener("click", () => {
    document.getElementById("victory-modal")?.classList.add("hidden");
    returnToTitle();
  });
  escSave?.addEventListener("click", () => {closeEscMenu();saveGame();});
  escTitle?.addEventListener("click", () => {closeEscMenu();returnToTitle();});
  const escLoad = document.getElementById("esc-load");
  escLoad?.addEventListener("click", () => {
    closeEscMenu();
    const idx = saveManager.getLatestIndex();
    if (idx >= 0) {
      const data = saveManager.load(idx);
      if (data) {loadGameFromData(data);}
    } else {
      overlayManager.showToast(UI_TEXT.NO_SAVE, true);
    }
  });

  // ===== Slot Action Menu Listeners =====
  window.addEventListener("keydown", (e: KeyboardEvent) => {
  // Global mute toggle (M) - works in ALL states
  if (e.code === "KeyM") {
    e.preventDefault();
    const wasMuted = audioManager.muted;
    audioManager.mute();
    overlayManager.showToast(wasMuted ? UI_TEXT.MUTE_OFF : UI_TEXT.MUTE_ON);
    // Sync the volume-value text with mute state
    if (volumeValueText) {
      volumeValueText.textContent = wasMuted ? (parseInt(volumeSlider?.value ?? "70") + "%") : UI_TEXT.MUTE_ON;
    }
    return;
  }

    // Theme toggle works regardless of game state
    if (e.key === "t" || e.key === "T") {
      e.preventDefault();
      currentTheme = currentTheme.name === "dark" ? LIGHT_THEME : DARK_THEME;
      const isDark = currentTheme.name === "dark";
      document.body.classList.toggle("dark-theme", isDark);
      eventBus.emit(Events.THEME_TOGGLED, isDark);
      return;
    }

    switch (gameStore.appState) {
      case AppState.TITLE:
      case AppState.GUIDE_FROM_TITLE:
        if (e.code === "Space" || e.code === "Enter") {
          e.preventDefault();
          startGame();
          return;
        }
        if (e.code === "KeyL") {
          e.preventDefault();
          const idx = saveManager.getLatestIndex();
          if (idx >= 0) {
            const data = saveManager.load(idx);
            if (data) {loadGameFromData(data);}
          } else {
            overlayManager.showToast(UI_TEXT.NO_SAVE, true);
          }
          return;
        }
        break;

      case AppState.GUIDE_FROM_GAME:
      case AppState.PAUSED:{
          e.preventDefault();
          e.stopPropagation();
          switch (e.code) {
            case "Escape":
              if (gameStore.appState === AppState.GUIDE_FROM_GAME) {
                gameStore.appState = AppState.PLAYING;
                guideScreen?.classList.add("hidden");
              } else {
                closeEscMenu();
              }
              break;
            case "KeyR":closeEscMenu();confirmRestart();break;
            case "KeyS":closeEscMenu();saveGame();break;
            case "KeyL":{
                closeEscMenu();
                const idx = saveManager.getLatestIndex();
                if (idx >= 0) {
                  const data = saveManager.load(idx);
                  if (data) {loadGameFromData(data);}
                } else {
                  overlayManager.showToast(UI_TEXT.NO_SAVE, true);
                }
                break;
              }
            case "KeyG":
              closeEscMenu();
              gameStore.appState = AppState.GUIDE_FROM_GAME;
              guideScreen?.classList.remove("hidden");
              updateGuideButtons();
              break;
            case "KeyB":closeEscMenu();returnToTitle();break;
          }
          return;
        }

      case AppState.PLAYING:
        switch (e.key) {
          case "a":case "A":
            e.preventDefault();
            focusZ = (focusZ - 1 + LAYER_COUNT) % LAYER_COUNT;
            eventBus.emit(Events.LAYER_CHANGED, focusZ);
            leftPanel.renderAllPieces(rightPanel.board, focusZ);
            break;
          case "d":case "D":
            e.preventDefault();
            focusZ = (focusZ + 1) % LAYER_COUNT;
            eventBus.emit(Events.LAYER_CHANGED, focusZ);
            leftPanel.renderAllPieces(rightPanel.board, focusZ);
            break;
          case "q":case "Q":e.preventDefault();leftPanel.rotateY(1);break;
          case "e":case "E":e.preventDefault();leftPanel.rotateY(-1);break;
          case "f":case "F":e.preventDefault();rightPanel.toggleMirror();break;
          case "w":case "W":e.preventDefault();leftPanel.zoom(1);break;
          case "s":case "S":e.preventDefault();leftPanel.zoom(-1);break;
          case "z":case "Z":
            e.preventDefault();
            console.log("KeyZ pressed");
            leftPanel.adjustLayerSpacing(-0.5);
            break;
          case "c":case "C":
            e.preventDefault();
            console.log("KeyC pressed");
            leftPanel.adjustLayerSpacing(0.5);
            break;
          case "r":case "R":e.preventDefault();openEscMenu();break;
          case "Escape":e.preventDefault();openEscMenu();break;
          case "x":case "X":e.preventDefault();leftPanel.toggleLayerSpacing();break;
          case "h":case "H":
            e.preventDefault();
            {const mode = rightPanel.cycleAuxMode();leftPanel.setAuxMode(mode);}
            break;

          case "v":case "V":
            e.preventDefault();
            isColorblindMode = !isColorblindMode;
            eventBus.emit(Events.COLORBLIND_MODE_TOGGLED, isColorblindMode);
            overlayManager.showToast(isColorblindMode ? UI_TEXT.COLORBLIND_ON : UI_TEXT.COLORBLIND_OFF);
            break;
        }
        break;
    }
  });


  leftEl.addEventListener("wheel", (e: WheelEvent) => {
    if (gameStore.appState !== AppState.PLAYING) return;
    e.preventDefault();
    leftPanel.rotateY(e.deltaY > 0 ? 1 : -1);
  });

  window.addEventListener("resize", () => {
    const lw = leftEl.clientWidth || window.innerWidth * PANEL_RATIO;
    const rw = rightEl.clientWidth || window.innerWidth * PANEL_RATIO;
    const h = window.innerHeight;
    leftPanel.resize(lw, h);
    rightPanel.resize(rw, h);
  });

  // Audio init (first user gesture for browser autoplay policy)
  const initAudio = (): void => {
    audioManager.init();
    audioManager.playBGM("menu");
    document.removeEventListener("click", initAudio);
    document.removeEventListener("keydown", initAudio);
  };
  document.addEventListener("click", initAudio);
  document.addEventListener("keydown", initAudio);

  // Wire up start-screen controls
  const pvpRadio = document.getElementById("mode-pvp") as HTMLInputElement;
  const pveRadio = document.getElementById("mode-pve") as HTMLInputElement;
  const difficultySelect = document.getElementById("ai-difficulty") as HTMLSelectElement;
  const volumeSlider = document.getElementById("volume-slider") as HTMLInputElement;
  const volumeValueText = document.getElementById("volume-value");

  const updateModeUI = (): void => {
    isPvEMode = pveRadio?.checked ?? false;
    const colorGroup = document.getElementById("player-color-group");
    if (colorGroup) {
      if (isPvEMode) {
        colorGroup.classList.remove("hidden");
      } else {
        colorGroup.classList.add("hidden");
      }
    }
    if (!isPvEMode && aiEngine) {
      aiEngine.cancel();
      aiEngine = null;
    }
    if (isPvEMode && gameStore.appState === AppState.PLAYING) {
      const aiColor: 1 | 2 = playerColor === 1 ? 2 : 1;
      if (currentPlayer === aiColor) {
        triggerAIMove();
      }
    }
  };

  if (pvpRadio && pveRadio) {
    pvpRadio.addEventListener("change", updateModeUI);
    pveRadio.addEventListener("change", updateModeUI);
  }

  // Set initial state
  updateModeUI();

  if (difficultySelect) {
    difficultySelect.addEventListener("change", () => {
      if (aiEngine) {
        aiEngine.setDifficulty(difficultySelect.value as "Easy" | "Medium" | "Hard");
      }
    });
  }

  // 1. Define the core volume update function
  const updateVolume = (): void => {
    if (!volumeSlider) return;

    // Get current slider value (0-100)
    const val = parseInt(volumeSlider.value, 10);

    // Update the text display next to the slider in real time
    if (volumeValueText) {
      volumeValueText.textContent = `${val}%`;
    }

    // Convert to 0.0-1.0 and sync to AudioManager (both SFX and BGM)
    const volumeRatio = val / 100;
    audioManager.setVolume(volumeRatio, volumeRatio);

    console.log("[Audio] Volume updated to " + val + "%");
  };

  // 2. Bind real-time drag event (use 'input', not 'change')
  volumeSlider?.addEventListener("input", updateVolume);

  // 3. Run once on init so volume and text are in sync on page load
  updateVolume();

  // Wire player color radios
  const blackRadio = document.getElementById("color-black") as HTMLInputElement;
  const whiteRadio = document.getElementById("color-white") as HTMLInputElement;

  const onPlayerColorChange = (): void => {
    if (blackRadio && blackRadio.checked) playerColor = 1; else
    if (whiteRadio && whiteRadio.checked) playerColor = 2;
    console.log("[UI] Player color changed to:", playerColor === 1 ? "Black" : "White");
    // If game is running and it is now the AI's turn, trigger immediately
    if (gameStore.appState === AppState.PLAYING && isPvEMode) {
      const aiColor: 1 | 2 = playerColor === 1 ? 2 : 1;
      if (currentPlayer === aiColor) {
        triggerAIMove();
      }
    }
  };

  if (blackRadio) blackRadio.addEventListener("change", onPlayerColorChange);
  if (whiteRadio) whiteRadio.addEventListener("change", onPlayerColorChange);
}

main();
