import "./style/main.css";
import { LIGHT_THEME, DARK_THEME } from "./core/Types";
import type { Theme } from "./core/Types";
import { LeftPanel } from "./views/LeftPanel";
import { RightPanel } from "./views/RightPanel";
import { LAYER_COUNT, PANEL_RATIO, SAVE_SLOT_COUNT, QUICK_SAVE_INDEX, WIN_LENGTH, setWinLength } from "./core/Config";
import { eventBus, Events } from "./core/EventBus";
import { gameStore } from "./core/GameStore";
import { SaveManager, type SaveData } from "./core/SaveManager";
import { LocalStorageAdapter } from "./core/LocalStorageAdapter";
import { isTauri } from "@tauri-apps/api/core";
import type { IStorageAdapter } from "./core/StorageAdapter";
import { OverlayManager } from "./ui/OverlayManager";
import { LevelManager } from "./core/LevelManager";
import { Board } from "./core/Board";
import { audioManager } from "./audio/AudioManager";
import { AIEngine } from "./ai/AIEngine";
import * as THREE from "three";
import { resourceManager } from "./utils/ResourceManager";
import { i18n } from "./core/I18n";
import { StandardEngine } from "./core/rules/StandardEngine";
import { SwapEngine } from "./core/rules/SwapEngine";
import type { IRuleEngine } from "./core/rules/IRuleEngine";

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
  if (isTauri()) {
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
  await saveManager.init();

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

  let leftPanel = new LeftPanel(leftEl, currentTheme);
  let rightPanel = new RightPanel(rightEl, currentTheme);
  rightPanel.setGameActiveCallback(() => gameStore.appState === AppState.PLAYING);
  var overlayManager = new OverlayManager({
    onSave: async function (index, data) {
      await saveManager.save(index, data);
      overlayManager.showToast(i18n.t("SAVE_SUCCESS", index === QUICK_SAVE_INDEX ? i18n.t("QUICK_SAVE_LABEL") : String(index + 1)));
    },
    onLoad: function (data) {
      loadGameFromData(data);
    },
    onDelete: async function (index) {
      await saveManager.delete(index);
      overlayManager.showToast(i18n.t("DELETE_SUCCESS", index + 1));
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
    // CRITICAL: Block mouse clicks during Replay mode
    if (isReplayMode) return false;
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
      title.textContent = winner === 1 ? i18n.t("BLACK_WIN") : i18n.t("WHITE_WIN");
      subtitle.textContent = i18n.t("GAME_OVER_SUBTITLE", moveCount);
      modal.classList.remove("hidden");
    }
  };

  rightPanel.onPiecePlaced = (_x: number, _y: number, _z: number, player: number): void => {
    moveCount++;
    moveHistory.push({ x: _x, y: _y, z: _z, player: player as 1 | 2 });
    audioManager.playSFX("click");
    rightPanel.updateLastMoveUI(_x, _y, _z);
    leftPanel.updateLastMoveUI(_x, _y, _z);
    // Use rule engine for turn state
    if (currentEngine) {
      const ts = currentEngine.getNextTurnState(moveHistory, currentPlayer);
      if (!ts.isSwapPhase) {
        currentPlayer = ts.nextPlayer;
      }
    } else {
      currentPlayer = player === 1 ? 2 : 1;
    }
    overlayManager.showToast(currentPlayer === 1 ? i18n.t("BLACK_TURN") : i18n.t("WHITE_TURN"));
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
  let isReplayMode = false;
  let currentEngine: IRuleEngine | null = null;
  const STANDARD_LEVEL = {
    id: "standard", name: "Standard 13x13x6", boardSize: 13, layers: 6, initialMoves: [] as Array<{x: number; y: number; z: number; player: 1 | 2}>
  };

  // == 3D Turn Indicator (isolated scene) =================
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
    indicatorBlackMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide });
    indicatorWhiteMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.4, metalness: 0.1, side: THREE.DoubleSide });

    indicatorMesh = new THREE.Mesh(geo, indicatorBlackMat);
    indicatorScene.add(indicatorMesh);
  }

    const updateTurnIndicator = (player: 1 | 2, isThinking: boolean = false): void => {
    const textEl = document.getElementById("turn-indicator-text");
    const containerEl = document.getElementById("turn-indicator-container");
    if (textEl) {
      if (isThinking) {
        textEl.textContent = i18n.t("AI_THINKING");
        textEl.classList.add("thinking");
        if (containerEl) containerEl.classList.add("thinking");
      } else {
        textEl.textContent = player === 1 ? i18n.t("BLACK_TURN") : i18n.t("WHITE_TURN");
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
    initGameContext(STANDARD_LEVEL);
  };



  const initGameContext = (levelConfig: { id: string; name: string; boardSize: number; layers: number; winLength?: number; rules?: string; initialMoves: Array<{x: number; y: number; z: number; player: 1 | 2}> }): void => {
    console.log("[Context] Initializing with size: " + levelConfig.boardSize + "x" + levelConfig.layers);

    // Apply win length from config (default 5)
    setWinLength(levelConfig.winLength ?? 5);
    console.log("[Context] Win length set to: " + WIN_LENGTH);

    if (aiEngine) { aiEngine.cancel(); aiEngine = null; }
    isAIThinking = false;

    if (leftPanel) {
      const oldCanvas = leftPanel.renderer.domElement;
      if (oldCanvas.parentNode) oldCanvas.parentNode.removeChild(oldCanvas);
    }
    if (rightPanel) {
      const oldCanvas = rightPanel.renderer.domElement;
      if (oldCanvas.parentNode) oldCanvas.parentNode.removeChild(oldCanvas);
    }

    leftPanel = new LeftPanel(leftEl, currentTheme, levelConfig.boardSize, levelConfig.layers);
    rightPanel = new RightPanel(rightEl, currentTheme, levelConfig.boardSize, levelConfig.layers);
    const board = new Board(levelConfig.boardSize, levelConfig.layers);

    // Create rule engine based on level config
    currentEngine = levelConfig.rules === "swap2"
      ? new SwapEngine()
      : new StandardEngine();
    rightPanel.ruleEngine = currentEngine;

    rightPanel.setGameActiveCallback(() => gameStore.appState === AppState.PLAYING);
    rightPanel.onPieceChanged = (b: Board, z: number): void => {
      leftPanel.renderAllPieces(b, z);
    };
    rightPanel.on3DAuxDataChanged = (data): void => {
      leftPanel.update3DAuxData(data);
    };
    rightPanel.onHoverChanged = (x, y, z): void => {
      if (x >= 0) leftPanel.updateHoverMarker(x, y, z);
      else leftPanel.clearHoverMarker();
    };
    rightPanel.setTurnCallback(() => {
      if (isReplayMode) return false;
      if (gameStore.appState !== AppState.PLAYING) return false;
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
        title.textContent = winner === 1 ? i18n.t("BLACK_WIN") : i18n.t("WHITE_WIN");
        subtitle.textContent = i18n.t("GAME_OVER_SUBTITLE", moveCount);
        modal.classList.remove("hidden");
      }
    };
    rightPanel.onPiecePlaced = (_x: number, _y: number, _z: number, player: number): void => {
      moveCount++;
      moveHistory.push({ x: _x, y: _y, z: _z, player: player as 1 | 2 });
      audioManager.playSFX("click");
      rightPanel.updateLastMoveUI(_x, _y, _z);
      leftPanel.updateLastMoveUI(_x, _y, _z);
      // Use rule engine for turn state (handles swap phases)
      if (currentEngine) {
        const ts = currentEngine.getNextTurnState(moveHistory, currentPlayer);
        if (ts.isSwapPhase) {
          showSwapBar();
          // Keep currentPlayer unchanged during swap phase; wait for user decision
        } else {
          currentPlayer = ts.nextPlayer;
        }
      } else {
        currentPlayer = player === 1 ? 2 : 1;
      }
      overlayManager.showToast(currentPlayer === 1 ? i18n.t("BLACK_TURN") : i18n.t("WHITE_TURN"));
      updateTurnIndicator(currentPlayer);
      const aiColor: 1 | 2 = playerColor === 1 ? 2 : 1;
      if (isPvEMode && currentPlayer === aiColor) {
        triggerAIMove();
      }
    };

    moveCount = 0;
    moveHistory = [];
    currentPlayer = 1;
    focusZ = 0;
    gameStore.setFocusZ(0);

    levelConfig.initialMoves.forEach((move) => {
      board.set(move.x, move.y, move.z, move.player);
      moveHistory.push(move);
    });

    rightPanel.board = board;
    rightPanel.refresh();
    leftPanel.renderAllPieces(board, focusZ);

    hideAllOverlays();
    if (startScreen) {
      startScreen.classList.add("hidden");
      startScreen.style.display = "none";
    }
    guideScreen?.classList.add("hidden");
    gameStore.appState = AppState.PLAYING;
    hideSwapBar();
    audioManager.playBGM("game");
    updateTurnIndicator(currentPlayer);
    forceCorrectSize();

    if (isPvEMode) {
      const aiColor: 1 | 2 = playerColor === 1 ? 2 : 1;
      if (currentPlayer === aiColor) {
        setTimeout(() => triggerAIMove(), 300);
      }
    }
  };

  const loadLevel = (id: string): void => {
    const config = LevelManager.getLevel(id);
    if (!config) {
      console.warn("[Level] Unknown level ID:", id);
      return;
    }
    overlayManager.showToast("Loading: " + config.name);
    initGameContext(config);
  };


  const setupCustomSandbox = (): void => {
    const modal = document.getElementById("custom-sandbox-modal");
    const sizeSlider = document.getElementById("custom-board-size") as HTMLInputElement | null;
    const sizeVal = document.getElementById("custom-board-size-val");
    const layerSlider = document.getElementById("custom-layers") as HTMLInputElement | null;
    const layerVal = document.getElementById("custom-layers-val");
    const startBtn = document.getElementById("btn-start-custom");
    const cancelBtn = document.getElementById("btn-cancel-custom");
    const customBtn = document.getElementById("custom-btn");

    const winSlider = document.getElementById("custom-win-length") as HTMLInputElement | null;
    const winVal = document.getElementById("custom-win-length-val");

    if (!modal || !sizeSlider || !layerSlider || !startBtn || !cancelBtn) return;

    sizeSlider.addEventListener("input", () => {
      if (sizeVal) sizeVal.textContent = sizeSlider.value;
    });
    layerSlider.addEventListener("input", () => {
      if (layerVal) layerVal.textContent = layerSlider.value;
    });
    winSlider?.addEventListener("input", () => {
      if (winVal) winVal.textContent = winSlider.value;
    });

    startBtn.addEventListener("click", () => {
      const size = parseInt(sizeSlider.value, 10);
      const layers = parseInt(layerSlider.value, 10);
      const winLen = winSlider ? parseInt(winSlider.value, 10) : 5;
      const customConfig = {
        id: "custom_sandbox",
        name: "Custom " + size + "x" + size + "x" + layers,
        boardSize: size,
        layers: layers,
        winLength: winLen,
        initialMoves: [] as Array<{x: number; y: number; z: number; player: 1 | 2}>
      };
      modal.classList.add("hidden");
      overlayManager.showToast("Starting: " + customConfig.name);
      initGameContext(customConfig);
    });

    cancelBtn.addEventListener("click", () => {
      modal.classList.add("hidden");
    });

    customBtn?.addEventListener("click", () => {
      modal.classList.remove("hidden");
    });
  };

  const triggerAIMove = async (): Promise<void> => {
    if (!aiEngine || isAIThinking) return;
    isAIThinking = true;
    overlayManager.showToast(i18n.t("AI_THINKING"));
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
    audioManager.playBGM("game");
    eventBus.emit(Events.GAME_RESET);
  };

  const openEscMenu = (): void => {
    gameStore.appState = AppState.PAUSED;
    audioManager.playBGM("pause");
    if (escMenu) escMenu.classList.remove("hidden");
  };

  const closeEscMenu = (): void => {
    gameStore.appState = AppState.PLAYING;
    if (escMenu) escMenu.classList.add("hidden");
  };

  // ===== Swap2 Decision Bar =====
  const showSwapBar = (): void => {
    const bar = document.getElementById("swap-decision-bar");
    if (bar) bar.classList.remove("hidden");
  };

  const hideSwapBar = (): void => {
    const bar = document.getElementById("swap-decision-bar");
    if (bar) bar.classList.add("hidden");
  };

  // Bind swap decision buttons
  const btnSwapConfirm = document.getElementById("btn-swap-confirm");
  const btnSwapPass = document.getElementById("btn-swap-pass");

  btnSwapConfirm?.addEventListener("click", () => {
    if (currentEngine instanceof SwapEngine) {
      currentEngine.applySwap(moveHistory, rightPanel.board);
      rightPanel.refresh();
      leftPanel.renderAllPieces(rightPanel.board, focusZ);
      updateTurnIndicator(currentPlayer);
      overlayManager.showToast(i18n.t("SWAP_DONE"));
    }
    hideSwapBar();
  });

  btnSwapPass?.addEventListener("click", () => {
    hideSwapBar();
    updateTurnIndicator(currentPlayer);
    overlayManager.showToast(i18n.t("PASS_DONE"));
    const aiColor: 1 | 2 = playerColor === 1 ? 2 : 1;
    if (isPvEMode && currentPlayer === aiColor) {
      triggerAIMove();
    }
  });

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
      const dims = quickData.boardSize + "×" + quickData.boardSize + "×" + quickData.layers;
      quickDiv.innerHTML =
        '<span class="slot-index">' + i18n.t("QUICK_SAVE_LABEL") + '</span>' +
        '<span class="slot-meta">' + modeStr + aiDiff + " | " + dims + " | " + i18n.t("SLOT_MOVES", movesCount) + " | " + timeStr + '</span>' +
        '<span class="slot-actions">' +
          '<button data-action="quick-load">' + i18n.t("SLOT_READ") + '</button>' +
          '<button data-action="quick-save">' + i18n.t("SLOT_OVERWRITE") + '</button>' +
        '</span>';
    } else {
      quickDiv.innerHTML =
        '<span class="slot-index">' + i18n.t("QUICK_SAVE_LABEL") + '</span>' +
        '<span class="slot-info">' + i18n.t("EMPTY_SLOT") + '</span>' +
        '<span class="slot-actions">' +
          '<button data-action="quick-save">' + i18n.t("SLOT_QUICK") + '</button>' +
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
          '<span class="slot-index">' + i18n.t("SAVE_SLOT_LABEL", i + 1) + '</span>' +
          '<span class="slot-info">' + i18n.t("EMPTY_SLOT") + '</span>' +
          '<span class="slot-actions">' +
            '<button data-action="fill" data-index="' + i + '">' + i18n.t("SLOT_FILL") + '</button>' +
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
        const dims2 = data.boardSize + "×" + data.boardSize + "×" + data.layers;
        div.innerHTML =
          '<span class="slot-index">' + i18n.t("SAVE_SLOT_LABEL", i + 1) + '</span>' +
          '<span class="slot-meta">' + modeStr + aiDiff + " | " + dims2 + " | " + i18n.t("SLOT_MOVES", movesCount) + " | " + timeStr + '</span>' +
          '<span class="slot-actions">' +
            '<button data-action="load" data-index="' + i + '">' + i18n.t("SLOT_READ") + '</button>' +
            '<button data-action="replay" data-index="' + i + '">' + i18n.t("BTN_REPLAY") + '</button>' +
            '<button data-action="overwrite" data-index="' + i + '">' + i18n.t("SLOT_OVERWRITE") + '</button>' +
            '<button data-action="delete" data-index="' + i + '">' + i18n.t("SLOT_DELETE") + '</button>' +
          '</span>';
      }
      list.appendChild(div);
    });

    // Event delegation: single listener for all slot buttons
    list.onclick = async (e) => {
      const target = e.target as HTMLElement;
      const action = target.getAttribute("data-action");
      const indexStr = target.getAttribute("data-index");
      if (!action) return;
      const index = indexStr !== null ? parseInt(indexStr, 10) : -1;

      switch (action) {
        case "fill":
          console.log("[Main] Fill button clicked, calling overlayManager.tryFillSlot, index:", index);
          await overlayManager.tryFillSlot(index);
          renderSaveSlots();
          break;
        case "load":
          const loadData = saveManager.load(index);
          if (loadData) loadGameFromData(loadData);
          break;
        case "overwrite":
          const targetSlotData = saveManager.load(index);
          if (!targetSlotData) {
            overlayManager.showToast(i18n.t("SAVE_INVALID_STRUCTURE"), true);
            break;
          }
          showConfirmDialog(i18n.t("CONFIRM_OVERWRITE", index + 1), async () => {
            const currentSaveData = serializeBoardState();
            await saveManager.save(index, currentSaveData);
            overlayManager.showToast(i18n.t("SAVE_SUCCESS", i18n.t("SAVE_SLOT_LABEL", index + 1)));
            renderSaveSlots();
          });
          break;
        case "replay":
          const replayData = saveManager.load(index);
          if (replayData) startReplay(replayData);
          break;
        case "delete":
          showConfirmDialog(i18n.t("CONFIRM_DELETE", index + 1), async () => {
            await saveManager.delete(index);
            renderSaveSlots();
          });
          break;
        case "quick-load":
          const quickLoadData = saveManager.quickLoad();
          if (quickLoadData) loadGameFromData(quickLoadData);
          break;
        case "quick-save":
          const qsData = serializeBoardState();
          await saveManager.quickSave(qsData);
          overlayManager.showToast(i18n.t("SAVE_SUCCESS", i18n.t("QUICK_SAVE_LABEL")));
          renderSaveSlots();
          break;
      }
    };
  };

  eventBus.on(Events.SAVE_UPDATED, () => {
    renderSaveSlots();
  });
  renderSaveSlots();

  let confirmCallback: (() => void) | null = null;

const showConfirmDialog = (message: string, onConfirm: () => void): void => {
    const dialog = document.getElementById("confirm-dialog");
    const msgEl = document.getElementById("confirm-message");
    const yesBtn = document.getElementById("confirm-yes");
    const noBtn = document.getElementById("confirm-no");

    if (!dialog || !msgEl || !yesBtn || !noBtn) return;

    msgEl.textContent = message;
    confirmCallback = onConfirm;
    dialog.classList.remove("hidden");

    // Re-bind Yes button
    const newYesBtn = yesBtn.cloneNode(true) as HTMLButtonElement;
    const newNoBtn = noBtn.cloneNode(true) as HTMLButtonElement;
    yesBtn.parentNode?.replaceChild(newYesBtn, yesBtn);
    noBtn.parentNode?.replaceChild(newNoBtn, noBtn);

    newYesBtn.addEventListener("click", () => {
        dialog.classList.add("hidden");
        if (confirmCallback) confirmCallback();
    });

    newNoBtn.addEventListener("click", () => {
        dialog.classList.add("hidden");
        confirmCallback = null;
    });
};
const startReplay = (data: SaveData): void => {
    console.log("[Replay] Starting replay for save:", data.id);

    // 0. Ensure board context matches save dimensions
    ensureContextMatches(data);

    // 1. Cancel any running AI and clear timers
    if (aiEngine) { aiEngine.cancel(); }
    isAIThinking = false;

    // 2. Load board snapshot instantly (DO NOT use loadGameFromData)
    // (loadBoardSnapshot handled by updateReplayUI)


    // 2.5 Hide start-screen and guide-screen overlays
    const replaySS = document.getElementById("start-screen");
    const replayGS = document.getElementById("guide-screen");
    if (replaySS) {
      replaySS.style.display = "";
      replaySS.classList.add("hidden");
    }
    replayGS?.classList.add("hidden");
    forceCorrectSize();
    // Clear any residual lastMove ring from previous game
    rightPanel.resetGame();
    eventBus.emit(Events.GAME_RESET);
    
    // 3. Set strict REPLAY state
    isReplayMode = true;
    gameStore.appState = AppState.PLAYING;

    // 4. Initialize replay data (start at move 0 = empty board)
    focusZ = data.focusZ ?? 0;
    gameStore.setFocusZ(focusZ);
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
            '<button id="btn-replay-prev">' + i18n.t("BTN_REPLAY_PREV") + '</button>' +
            '<span id="replay-step-info">0 / ' + data.moves.length + '</span>' +
            '<button id="btn-replay-next">' + i18n.t("BTN_REPLAY_NEXT") + '</button>' +
            '<button id="btn-replay-exit">' + i18n.t("BTN_REPLAY_EXIT") + '</button>';
        document.body.appendChild(controls);

        document.getElementById("btn-replay-prev")?.addEventListener("click", () => replayStep(-1));
        document.getElementById("btn-replay-next")?.addEventListener("click", () => replayStep(1));
        document.getElementById("btn-replay-exit")?.addEventListener("click", exitReplay);
    }

    // 6. Initial render
    updateReplayUI();
    overlayManager.showToast(i18n.t("REPLAY_ENTER").replace("{0}", String(data.moves.length)));
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
    // Clear board for replay (board data only; lastMove already cleared in startReplay)
    rightPanel.board.reset();
    const bs = rightPanel.board.size;
    const lc = rightPanel.board.layers;
    // Replay moves up to currentIndex
    for (let i = 0; i < replayState.currentIndex; i++) {
        const m = replayState.moves[i];
        if (m.x >= 0 && m.x < bs && m.y >= 0 && m.y < bs && m.z >= 0 && m.z < lc) {
          rightPanel.board.set(m.x, m.y, m.z, m.player);
        }
    }
    rightPanel.refresh();
    // Show last move ring for current replay step (skip step 0 = empty board, bounds-safe)
    if (replayState.currentIndex > 0) {
      const prevMv = replayState.moves[replayState.currentIndex - 1];
      if (prevMv.x >= 0 && prevMv.x < rightPanel.board.size && prevMv.y >= 0 && prevMv.y < rightPanel.board.size && prevMv.z >= 0 && prevMv.z < rightPanel.board.layers) {
        rightPanel.updateLastMoveUI(prevMv.x, prevMv.y, prevMv.z);
        leftPanel.updateLastMoveUI(prevMv.x, prevMv.y, prevMv.z);
      }
    }
    // Sync 3D view with current focus layer
    leftPanel.renderAllPieces(rightPanel.board, focusZ);
    // Also update RightPanel focus layer to match
    rightPanel.setFocusZ(focusZ);
    // Update step info text
    const info = document.getElementById("replay-step-info");
    if (info) {
        info.textContent = replayState.currentIndex + " / " + replayState.moves.length;
    }
};

const exitReplay = (): void => {
    console.log("[Replay] Exiting replay mode");
    isReplayMode = false;
    const controls = document.getElementById("replay-controls");
    if (controls) controls.remove();
    replayState = null;
    overlayManager.showToast(i18n.t("REPLAY_EXIT"));
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
    focusZ = 0;
    rightPanel.resetGame();
    leftPanel.renderAllPieces(rightPanel.board, focusZ);
      eventBus.emit(Events.GAME_RESET);
    gameStore.appState = AppState.TITLE;
    hideSwapBar();
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
      boardSize: rightPanel.board.size,
      layers: rightPanel.board.layers,
      layerSpacing: leftPanel.layerSpacing
    };
  };

  /** Ensure the current game context matches the saved board dimensions.
   *  If not, rebuild panels with the correct size before loading. */
  const ensureContextMatches = (data: SaveData): void => {
    if (data.boardSize !== rightPanel.board.size || data.layers !== rightPanel.board.layers) {
      console.log("[Context] Switching to " + data.boardSize + "x" + data.layers + " for save/replay.");
      initGameContext({
        id: "loaded_save",
        name: "Loaded Save",
        boardSize: data.boardSize,
        layers: data.layers,
        initialMoves: []
      });
    }
  };

  const loadGameFromData = (data: SaveData): void => {
    try {
      if (!data) {overlayManager.showToast(i18n.t("INVALID_SAVE"), true);return;}

      // Ensure board dimensions match before validating/loading
      ensureContextMatches(data);
      
      // === Deep validation pipeline ===
      const saveError = SaveManager.validateSaveData(data);
      if (saveError) {
        const errorMsgs: Record<string, string> = {
          "SAVE_INVALID_STRUCTURE": i18n.t("SAVE_INVALID_STRUCTURE"),
        };
        overlayManager.showToast(errorMsgs[saveError] || saveError, true);
        console.error("[Load] Validation failed:", saveError);
        return;
      }
      console.log("[Load] Restoring from save:", data.id || "unknown");

      // Restore theme first
      if (data.isDarkTheme != null) {
        currentTheme = data.isDarkTheme ? DARK_THEME : LIGHT_THEME;
        document.body.classList.toggle("dark-theme", data.isDarkTheme);
        eventBus.emit(Events.THEME_TOGGLED, data.isDarkTheme);
      }

      // Restore camera and layer spacing
      focusZ = data.focusZ ?? 0;
      gameStore.setFocusZ(focusZ);
      if (data.layerSpacing != null && data.layerSpacing >= 2.0 && data.layerSpacing <= 6.0) {
        leftPanel.restoreCameraState(focusZ, data.layerSpacing);
      }
      // Sync RightPanel focus layer
      rightPanel.setFocusZ(focusZ);

      // Instant-load board snapshot
      if (data.boardState && Array.isArray(data.boardState)) {
        rightPanel.loadBoardSnapshot(data.boardState);
        // Safety net: if snapshot is all zeros but moves exist, reconstruct from moves
        let boardEmpty = true;
        rightPanel.board.forEach((_x: number, _y: number, _z: number, state: number) => {
          if (state !== 0) boardEmpty = false;
        });
        if (boardEmpty && data.moves && data.moves.length > 0) {
          console.warn("[Load] boardState was empty; replaying from moves");
          for (const move of data.moves) {
            if (move.x >= 0 && move.x < rightPanel.board.size && move.y >= 0 && move.y < rightPanel.board.size && move.z >= 0 && move.z < rightPanel.board.layers) {
              rightPanel.board.set(move.x, move.y, move.z, move.player as any);
            }
          }
          rightPanel.refresh();
        }
      } else if (data.moves) {
        // Fallback: replay moves for legacy saves
        rightPanel.board.reset();
        for (const move of data.moves) {
          if (move.x >= 0 && move.x < rightPanel.board.size && move.y >= 0 && move.y < rightPanel.board.size && move.z >= 0 && move.z < rightPanel.board.layers) {
            rightPanel.board.set(move.x, move.y, move.z, move.player as any);
          }
        }
        rightPanel.refresh();
      } else {
        overlayManager.showToast(i18n.t("INVALID_SAVE"), true);
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
      eventBus.emit(Events.GAME_RESET);
      
      // Restore last move ring from save data (bounds-safe)
      if (data.moves && data.moves.length > 0) {
        const lastMv = data.moves[data.moves.length - 1];
        if (lastMv.x >= 0 && lastMv.x < rightPanel.board.size && lastMv.y >= 0 && lastMv.y < rightPanel.board.size && lastMv.z >= 0 && lastMv.z < rightPanel.board.layers) {
          rightPanel.updateLastMoveUI(lastMv.x, lastMv.y, lastMv.z);
          leftPanel.updateLastMoveUI(lastMv.x, lastMv.y, lastMv.z);
        }
      }

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
        audioManager.playBGM("game");

        forceCorrectSize();
        isReplayMode = false;
      } else if (gameStore.appState === AppState.PAUSED || gameStore.appState === AppState.GUIDE_FROM_GAME) {
        closeEscMenu();
      }
      overlayManager.showToast(i18n.t("SAVE_LOADED"));

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
      overlayManager.showToast(i18n.t("SAVE_FAILED"), true);
    }
  };

  const saveGame = async (): Promise<void> => {
    const data = serializeBoardState();
    // Find first empty slot, or overwrite quick save slot if all full
    let targetIndex = -1;
    for (let i = 0; i < SAVE_SLOT_COUNT; i++) {
      if (saveManager.getSlots()[i] === null) {targetIndex = i;break;}
    }
    if (targetIndex === -1) targetIndex = QUICK_SAVE_INDEX;
    await saveManager.save(targetIndex, data);
    const slotName = targetIndex === QUICK_SAVE_INDEX ? i18n.t("QUICK_SAVE_LABEL") : String(targetIndex + 1);
    overlayManager.showToast(i18n.t("SAVE_SUCCESS", slotName));
    const base64 = btoa(JSON.stringify(data));
    navigator.clipboard.writeText(base64).then(() => {
      console.log("[Save] Copied to clipboard");
    }).catch(() => {
      console.log("[Save] Clipboard unavailable");
    });
  };




  if (startBtn) startBtn.addEventListener("click", startGame);

  // ===== Guide Screen State Machine =====
  const escGuideBtn = document.getElementById("esc-guide");

  const hideAllOverlays = (): void => {
    startScreen?.classList.add("hidden");
    guideScreen?.classList.add("hidden");
    escMenu?.classList.add("hidden");
    overlayManager.closeAll();
  };

  const backToTitle = (): void => {
    rightPanel.resetGame();
    eventBus.emit(Events.GAME_RESET);
    focusZ = 0;
    hideAllOverlays();
    startScreen?.classList.remove("hidden");
    gameStore.appState = AppState.TITLE;
    audioManager.playBGM("menu");
    rightPanel.refresh();
    leftPanel.renderAllPieces(rightPanel.board, focusZ);
    rightPanel.setGameActiveCallback(() => gameStore.appState === AppState.PLAYING);
  };

  const backToGame = (): void => {
    hideAllOverlays();
    // Refresh board to ensure pieces render after returning from guide screen
    rightPanel.refresh();
    leftPanel.renderAllPieces(rightPanel.board, focusZ);
    gameStore.appState = AppState.PLAYING;
    hideSwapBar();
    audioManager.playBGM("game");
  };

  const updateGuideButtons = (): void => {
    // Re-query buttons from DOM each call (stale refs after cloneNode+replaceWith)
    const oldP = document.getElementById("guide-btn-primary");
    const oldS = document.getElementById("guide-btn-secondary");
    if (!oldP || !oldS) return;
    const newP = oldP.cloneNode(true) as HTMLElement;
    const newS = oldS.cloneNode(true) as HTMLElement;
    oldP.replaceWith(newP);
    oldS.replaceWith(newS);
    const btnP = document.getElementById("guide-btn-primary");
    const btnS = document.getElementById("guide-btn-secondary");
    if (gameStore.appState === AppState.GUIDE_FROM_TITLE) {
      if (btnP) {btnP.textContent = i18n.t("BTN_START_GAME");btnP.addEventListener("click", () => {hideAllOverlays();startGame();});}
      if (btnS) {btnS.textContent = i18n.t("BTN_BACK");btnS.addEventListener("click", backToTitle);}
    } else {
      if (btnP) {btnP.textContent = i18n.t("BTN_NEW_GAME");btnP.addEventListener("click", () => {hideAllOverlays();gameStore.appState = AppState.PLAYING;confirmRestart();});}
      if (btnS) {btnS.textContent = i18n.t("BTN_RESUME");btnS.addEventListener("click", backToGame);}
    }
  };

  // Level Select modal
  const levelBtn = document.getElementById("level-btn");
  const levelSelectModal = document.getElementById("level-select-modal");
  const levelList = document.getElementById("level-list");
  const levelCancel = document.getElementById("level-select-cancel");

  if (levelBtn) levelBtn.addEventListener("click", () => {
    if (!levelSelectModal || !levelList) return;
    levelList.innerHTML = "";
    const levels = LevelManager.getAllIds();
    levels.forEach((id) => {
      const config = LevelManager.getLevel(id);
      if (!config) return;
      const item = document.createElement("div");
      item.className = "level-item";
      item.innerHTML = '<div class="level-name">' + config.name + '</div>' +
        '<div class="level-dims">' + config.boardSize + '×' + config.boardSize + '×' + config.layers + '</div>';
      item.addEventListener("click", () => {
        levelSelectModal.classList.add("hidden");
        loadLevel(id);
      });
      levelList.appendChild(item);
    });
    levelSelectModal.classList.remove("hidden");
  });

  if (levelCancel) levelCancel.addEventListener("click", () => {
    levelSelectModal?.classList.add("hidden");
  });


  guideBtn?.addEventListener("click", () => {
    gameStore.appState = AppState.GUIDE_FROM_TITLE;
    hideAllOverlays();
    guideScreen?.classList.remove("hidden");
    audioManager.playBGM("guide");
    updateGuideButtons();
  });

  escGuideBtn?.addEventListener("click", () => {
    closeEscMenu();
    gameStore.appState = AppState.GUIDE_FROM_GAME;
    guideScreen?.classList.remove("hidden");
    audioManager.playBGM("guide");
    updateGuideButtons();
  });

  escResume?.addEventListener("click", () => { closeEscMenu(); audioManager.playBGM("game"); });
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
      overlayManager.showToast(i18n.t("NO_SAVE"), true);
    }
  });

  // ===== Slot Action Menu Listeners =====
  window.addEventListener("keydown", (e: KeyboardEvent) => {
  // Global mute toggle (M) - works in ALL states
  if (e.code === "KeyM") {
    e.preventDefault();
    const wasMuted = audioManager.muted;
    audioManager.mute();
    overlayManager.showToast(wasMuted ? i18n.t("MUTE_OFF") : i18n.t("MUTE_ON"));
    // Visual: toggle volume slider between blue (active) and gray (muted)
    if (volumeSlider) {
      volumeSlider.classList.toggle("muted", !wasMuted);
    }
    // Sync the volume-value text with mute state
    if (volumeValueText) {
      volumeValueText.textContent = wasMuted ? (parseInt(volumeSlider?.value ?? "70") + "%") : i18n.t("MUTE_ON");
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

    // Replay mode key handling - intercept BEFORE main switch
    // Only step keys (Arrows) are intercepted; camera keys (A/D, Q/E, W/S) are intentionally passed through
    if (isReplayMode) {
      if (e.code === "Escape" || e.code === "KeyR") {
        e.preventDefault();
        exitReplay();
        return;
      }
      if (e.code === "ArrowLeft") {
        e.preventDefault();
        replayStep(-1);
        return;
      }
      if (e.code === "ArrowRight") {
        e.preventDefault();
        replayStep(1);
        return;
      }
      // Allow A/D/Q/E/W/S/F/H/V/X/Z/C camera and aux keys to fall through to PLAYING case below
    }
    switch (gameStore.appState) {
      case AppState.TITLE:
      case AppState.GUIDE_FROM_TITLE:
        // Prevent arrow keys from scrolling the page
        if (e.code.startsWith("Arrow")) {
          e.preventDefault();
        }
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
            overlayManager.showToast(i18n.t("NO_SAVE"), true);
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
                backToGame();
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
                  overlayManager.showToast(i18n.t("NO_SAVE"), true);
                }
                break;
              }
            case "KeyG":
              closeEscMenu();
              gameStore.appState = AppState.GUIDE_FROM_GAME;
              guideScreen?.classList.remove("hidden");
              audioManager.playBGM("guide");
              updateGuideButtons();
              break;
            case "KeyB":closeEscMenu();returnToTitle();break;
          }
          return;
        }

      case AppState.PLAYING:
        // Prevent arrow keys from scrolling the page
        if (e.code.startsWith("Arrow")) {
          e.preventDefault();
        }
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
            overlayManager.showToast(isColorblindMode ? i18n.t("COLORBLIND_ON") : i18n.t("COLORBLIND_OFF"));
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

  // I18n: inject all data-i18n text into DOM
  const injectUITexts = (): void => {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (key) el.textContent = i18n.t(key as any);
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      if (key) (el as HTMLInputElement).placeholder = i18n.t(key as any);
    });
  };

  // Bind language switcher
  const langSelect = document.getElementById("lang-select") as HTMLSelectElement;
  if (langSelect) {
    langSelect.value = i18n.getLang();
    langSelect.addEventListener("change", () => {
      i18n.setLang(langSelect.value);
      injectUITexts();
      updateTurnIndicator(currentPlayer);
      renderSaveSlots();
    });
  }

  // Initial injection
  injectUITexts();
  setupCustomSandbox();
}

main();
