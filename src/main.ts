import "./style/main.css";
import { LIGHT_THEME, DARK_THEME } from "./core/Types";
import type { Theme } from "./core/Types";
import { LeftPanel } from "./views/LeftPanel";
import { RightPanel } from "./views/RightPanel";
import { LAYER_COUNT, PANEL_RATIO, SAVE_SLOT_COUNT, QUICK_SAVE_INDEX } from "./core/Config";
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
    const { TauriStoreAdapter } = await import("./core/TauriStoreAdapter");
    const tauriAdapter = new TauriStoreAdapter();
    await tauriAdapter.init();
    adapter = tauriAdapter;
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
      overlayManager.showToast("已保存到存档 " + (index === 5 ? "快速档" : String(index + 1)));
    },
    onLoad: function (data) {
      loadGameFromData(data);
    },
    onDelete: function (index) {
      saveManager.delete(index);
      overlayManager.showToast("已删除存档 " + (index + 1));
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
    // PvP: both players can click (pass-and-play); PvE: only the human's color can click
    return !isPvEMode || currentPlayer === playerColor;
  });

  rightPanel.onPiecePlaced = (_x: number, _y: number, _z: number, player: number): void => {
    audioManager.playSFX("click");
    currentPlayer = player === 1 ? 2 : 1;
    overlayManager.showToast(currentPlayer === 1 ? "\u9ed1\u65b9\u56de\u5408" : "\u767d\u65b9\u56de\u5408");
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
    overlayManager.showToast("AI \u601d\u8003\u4e2d...");
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
    if (aiEngine) aiEngine.cancel();
    isAIThinking = false;
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
  const renderSaveSlots = (slots: ReadonlyArray<SaveData | null>): void => {
    const list = document.getElementById("save-slots-list");
    if (!list) {
      console.error("[renderSaveSlots] #save-slots-list NOT FOUND in DOM!");
      return;
    }
    console.log("[renderSaveSlots] Called with", slots.length, "slots");
    list.innerHTML = "";
    slots.forEach((data, i) => {
      const isEmpty = data === null;
      const isQuickSave = i === 5;
      const div = document.createElement("div");
      div.className = "save-slot" + (isEmpty ? " empty" : "") + (isQuickSave ? " quick-save" : "");
      div.innerHTML = `<span class="slot-index">0${i + 1}</span> <span class="slot-info">${isEmpty ? "空" : `已存档 (${new Date(data!.timestamp).toLocaleTimeString()})`}</span>`;
      div.addEventListener("click", (e: MouseEvent) => {
        overlayManager.showSlotMenu(i, e);
      });
      list.appendChild(div);
    });
    console.log("[renderSaveSlots] Rendering complete");
  };

  eventBus.on(Events.SAVE_UPDATED, (slots: ReadonlyArray<SaveData | null>) => {
    console.log("[main.ts] SAVE_UPDATED event received, slots:", slots.length, "items");
    renderSaveSlots(slots);
  });
  renderSaveSlots(saveManager.getSlots());

  const returnToTitle = (): void => {
    if (aiEngine) {
      aiEngine.cancel();
      aiEngine = null;
    }
    isAIThinking = false;
    currentPlayer = 1;
    // Preserve playerColor from UI selection
    aiEngine = null;
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
    const moves: Array<{x: number;y: number;z: number;player: number;}> = [];
    for (let z = 0; z < LAYER_COUNT; z++) {
      for (let y = 0; y < 13; y++) {
        for (let x = 0; x < 13; x++) {
          const state = rightPanel.board.get(x, y, z);
          if (state !== 0) {
            moves.push({ x, y, z, player: state });
          }
        }
      }
    }
    return {
      version: "0.4.0",
      timestamp: Date.now(),
      boardSize: 13,
      layers: LAYER_COUNT,
      layerSpacing: leftPanel.layerSpacing,
      moves,
      focusZ: focusZ,
      isDarkTheme: currentTheme.name === "dark",
      currentPlayer: rightPanel.getCurrentPlayer()
    };
  };

  const loadGameFromData = (data: SaveData): void => {
    try {
      if (!data || !data.moves) {overlayManager.showToast("无效的存档数据", true);return;}
      rightPanel.board.reset();
      focusZ = data.focusZ ?? 0;
      for (const move of data.moves) {
        if (move.x >= 0 && move.x < 13 && move.y >= 0 && move.y < 13 && move.z >= 0 && move.z < LAYER_COUNT) {
          rightPanel.board.set(move.x, move.y, move.z, move.player as any);
        }
      }
      if (data.currentPlayer === 1 || data.currentPlayer === 2) {
        rightPanel.setCurrentPlayer(data.currentPlayer);
      }
      if (data.layerSpacing != null && data.layerSpacing >= 2.0 && data.layerSpacing <= 6.0) {
        const delta = data.layerSpacing - leftPanel.layerSpacing;
        leftPanel.adjustLayerSpacing(delta);
      }
      leftPanel.renderAllPieces(rightPanel.board, focusZ);
      rightPanel.refresh();
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
      overlayManager.showToast("已加载存档");
    } catch (err) {
      console.error("[Load] Failed:", err);
      overlayManager.showToast("加载失败", true);
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
    const slotName = targetIndex === QUICK_SAVE_INDEX ? "快速存档" : `存档 ${targetIndex + 1}`;
    overlayManager.showToast(`已保存到${slotName}`);
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
      if (btnP) {btnP.textContent = "开始游戏";btnP.addEventListener("click", () => {hideAllOverlays();startGame();});}
      if (btnS) {btnS.textContent = "返回标题";btnS.addEventListener("click", backToTitle);}
    } else {
      if (btnP) {btnP.textContent = "开始新游戏";btnP.addEventListener("click", () => {hideAllOverlays();gameStore.appState = AppState.PLAYING;confirmRestart();});}
      if (btnP) {btnP.textContent = "开始新游戏";btnP.addEventListener("click", () => {hideAllOverlays();gameStore.appState = AppState.PLAYING;confirmRestart();});}
      if (btnS) {btnS.textContent = "回到游戏";btnS.addEventListener("click", backToGame);}
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
      overlayManager.showToast("没有可读取的存档", true);
    }
  });

  // ===== Slot Action Menu Listeners =====
  window.addEventListener("keydown", (e: KeyboardEvent) => {
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
            overlayManager.showToast("没有可读取的存档", true);
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
                  overlayManager.showToast("没有可读取的存档", true);
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
          case "m":case "M":
            e.preventDefault();
            isPvEMode = !isPvEMode;
            overlayManager.showToast(isPvEMode ? "AI 模式已开启（执白）" : "玩家对战模式");
            const colorGroup = document.getElementById("player-color-group");
            if (colorGroup) {
              if (isPvEMode) colorGroup.classList.remove("hidden");else
              colorGroup.classList.add("hidden");
            }
            if (!isPvEMode) {
              if (aiEngine) {aiEngine.cancel();aiEngine = null;isAIThinking = false;}
            } else {
              const aiCol: 1 | 2 = playerColor === 1 ? 2 : 1;
              if (currentPlayer === aiCol) triggerAIMove();
            }
            break;
          case "v":case "V":
            e.preventDefault();
            isColorblindMode = !isColorblindMode;
            eventBus.emit(Events.COLORBLIND_MODE_TOGGLED, isColorblindMode);
            overlayManager.showToast(isColorblindMode ? "色弱模式已开启 (蓝/黄)" : "色弱模式已关闭 (红/绿)");
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

  if (volumeSlider) {
    volumeSlider.addEventListener("input", () => {
      const val = parseFloat(volumeSlider.value);
      audioManager.setVolume(val, val * 0.5);
    });
  }

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