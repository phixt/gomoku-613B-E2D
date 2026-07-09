import "./style/main.css";
import { LIGHT_THEME, DARK_THEME } from "./core/Types";
import type { Theme } from "./core/Types";
import { LeftPanel } from "./views/LeftPanel";
import { RightPanel } from "./views/RightPanel";
import { LAYER_COUNT, PANEL_RATIO } from "./core/Config";
import { eventBus, Events } from "./core/EventBus";

function main(): void {
  const leftEl = document.getElementById("left-panel");
  const rightEl = document.getElementById("right-panel");
  if (!leftEl || !rightEl) throw new Error("Missing #left-panel or #right-panel element");


  let currentTheme: Theme = LIGHT_THEME;
  document.body.classList.remove("dark-theme");


  let isGameStarted = false;
  const escMenu = document.getElementById("esc-menu");
  const escResume = document.getElementById("esc-resume");
  const escRestart = document.getElementById("esc-restart");
  const escSave = document.getElementById("esc-save");
  const escTitle = document.getElementById("esc-title");
  let isEscMenuOpen = false;
  const startScreen = document.getElementById("start-screen");
  const startBtn = document.getElementById("start-btn");
  const guideBtn = document.getElementById("guide-btn");
  const guideScreen = document.getElementById("guide-screen");
  const guideBackBtn = document.getElementById("guide-back-btn");
  const guideStartBtn = document.getElementById("guide-start-btn");

  const leftPanel = new LeftPanel(leftEl, currentTheme);
  const rightPanel = new RightPanel(rightEl, currentTheme);

  rightPanel.onPieceChanged = (board: import("./core/Board").Board, z: number): void => {
    leftPanel.renderAllPieces(board, z);
  };

  rightPanel.on3DAuxDataChanged = (data): void => {
    leftPanel.update3DAuxData(data);
  };

  rightPanel.onHoverChanged = (x, y, z): void => {
    if (x >= 0) leftPanel.updateHoverMarker(x, y, z);
    else leftPanel.clearHoverMarker();
  };

  const forceCorrectSize = (): void => {
    const lw = leftEl.clientWidth || window.innerWidth * PANEL_RATIO;
    const rw = rightEl.clientWidth || window.innerWidth * PANEL_RATIO;
    const h = window.innerHeight;
    leftPanel.resize(lw, h);
    rightPanel.resize(rw, h);
  };
  requestAnimationFrame(() => { requestAnimationFrame(forceCorrectSize); });

  let focusZ = 0;
  leftPanel.renderAllPieces(rightPanel.board, focusZ);

  const animate = (): void => { leftPanel.render(); rightPanel.render(); requestAnimationFrame(animate); };
  requestAnimationFrame(animate);

  /**
   * Start the game: hide start screen, enable keyboard input.
   */
  const startGame = (): void => {
    if (isGameStarted) return;
    isGameStarted = true;
    if (startScreen) {
      startScreen.classList.add("fade-out");
      setTimeout(() => { startScreen.style.display = "none"; }, 500);
    }
    setTimeout(forceCorrectSize, 550);
  };



  const confirmRestart = (): void => {
    rightPanel.board.reset();
    focusZ = 0;
    rightPanel.resetGame();
    leftPanel.renderAllPieces(rightPanel.board, focusZ);
    closeEscMenu();
  };

  const openEscMenu = (): void => {
    isEscMenuOpen = true;
    if (escMenu) escMenu.classList.remove("hidden");
  };

  const closeEscMenu = (): void => {
    isEscMenuOpen = false;
    if (escMenu) escMenu.classList.add("hidden");
  };

    // ===== Toast System =====
  const showToast = (message: string, isError: boolean = false): void => {
    const container = document.getElementById("toast-container");
    if (!container) return;
    container.classList.remove("hidden");
    const toast = document.createElement("div");
    toast.className = isError ? "toast error" : "toast";
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      if (container.contains(toast)) {
        container.removeChild(toast);
      }
      if (container.children.length === 0) {
        container.classList.add("hidden");
      }
    }, 1000);
  };

    // ===== Save Slots Management =====
  let saveSlots: (string | null)[] = JSON.parse(
    localStorage.getItem("gomoku_saves") || "[null,null,null,null,null]"
  );
  let currentSlotIndex: number = -1;

  const renderSaveSlots = (): void => {
    const list = document.getElementById("save-slots-list");
    if (!list) return;
    list.innerHTML = "";
    for (let i = 0; i < 5; i++) {
      const slot = document.createElement("div");
      slot.className = "save-slot" + (saveSlots[i] === null ? " empty" : "");
      slot.innerHTML = `<span class="slot-index">0${i + 1}</span> <span class="slot-info">${
        saveSlots[i] ? "已存档" : "空"
      }</span>`;
      slot.addEventListener("click", (e: MouseEvent) => showSlotActionMenu(i, e));
      list.appendChild(slot);
    }
  };

  const showSlotActionMenu = (index: number, event: MouseEvent): void => {
    const menu = document.getElementById("slot-action-menu");
    if (!menu) return;
    // Close any existing menu
    menu.classList.add("hidden");
    // Position near the clicked slot
    const target = event.currentTarget as HTMLElement;
    if (target) {
      const rect = target.getBoundingClientRect();
      menu.style.left = rect.right + "px";
      menu.style.top = rect.top + "px";
    } else {
      menu.style.left = event.clientX + "px";
      menu.style.top = event.clientY + "px";
    }
    // Show/hide Enter button based on state
    const btnEnter = document.getElementById("slot-btn-enter");
    if (btnEnter) {
      btnEnter.style.display = saveSlots[index] !== null ? "" : "none";
    }
    currentSlotIndex = index;
    menu.classList.remove("hidden");
  };
  renderSaveSlots();

  const returnToTitle = (): void => {
    rightPanel.board.reset();
    focusZ = 0;
    rightPanel.resetGame();
    leftPanel.renderAllPieces(rightPanel.board, focusZ);
    isGameStarted = false;
    closeEscMenu();
    if (startScreen) {
      startScreen.style.display = "";
      startScreen.classList.remove("fade-out");
    }
  };

  const saveGame = (): void => {
    // Serialize current game state to Base64
    const moves: Array<{ x: number; y: number; z: number; player: number }> = [];
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
    const saveData = {
      version: "0.4.0",
      timestamp: Date.now(),
      boardSize: 13,
      layers: LAYER_COUNT,
      layerSpacing: leftPanel.layerSpacing,
      moves,
      focusZ,
      isDarkTheme: currentTheme.name === "dark",
      currentPlayer: rightPanel.getCurrentPlayer(),
    };
    const base64 = btoa(unescape(encodeURIComponent(JSON.stringify(saveData))));

    // Find first empty slot, or overwrite last one if all full
    let targetIndex = saveSlots.indexOf(null);
    if (targetIndex === -1) {
      targetIndex = 4;
    }
    saveSlots[targetIndex] = base64;
    localStorage.setItem("gomoku_saves", JSON.stringify(saveSlots));
    renderSaveSlots();
    showToast("已保存到存档 " + (targetIndex + 1));

    // Also copy to clipboard as fallback
    navigator.clipboard.writeText(base64).then(() => {
      console.log("[Save] Copied to clipboard");
    }).catch(() => {
      console.log("[Save] Clipboard unavailable, save string is in console log above");
    });
  };

  const loadGameFromClipboard = async (): Promise<void> => {
    try {
      const text = await navigator.clipboard.readText();
      loadGame(text);
    } catch (err) {
      console.error("[Load] Clipboard read failed:", err);
      // Fallback: prompt user to paste
      const text = prompt("[Load] Clipboard unavailable. Please copy the save data, then paste it below and press OK:");
      if (text && text.trim()) {
        loadGame(text.trim());
      } else {
        alert("[Load] Load cancelled: no data provided.");
      }
    }
  };

  const loadGame = (base64String: string): void => {
    try {
      const json = decodeURIComponent(escape(atob(base64String)));
      const data = JSON.parse(json);

      // Validate version and boardSize
      if (data.version !== "0.4.0") {
        alert("[Load] Incompatible save version: " + (data.version ?? "unknown") + ". Expected: 0.4.0");
        return;
      }
      if (data.boardSize !== 13) {
        alert("[Load] Incompatible board size: " + data.boardSize + ". Expected: 13");
        return;
      }
      if (!Array.isArray(data.moves)) {
        alert("[Load] Invalid save data: missing moves array.");
        return;
      }

      // Clear board before restoring
      rightPanel.board.reset();

      // Restore board state from sparse moves
      for (const move of data.moves) {
        if (move.x >= 0 && move.x < 13 && move.y >= 0 && move.y < 13 && move.z >= 0 && move.z < LAYER_COUNT) {
          rightPanel.board.set(move.x, move.y, move.z, move.player);
        }
      }

      // Restore focusZ
      focusZ = data.focusZ ?? 0;
      rightPanel.setFocusZ(focusZ);

      // Restore theme
      if (data.isDarkTheme) {
        currentTheme = DARK_THEME;
        document.body.classList.add("dark-theme");
      } else {
        currentTheme = LIGHT_THEME;
        document.body.classList.remove("dark-theme");
      }
      leftPanel.updateTheme(currentTheme);
      rightPanel.updateTheme(currentTheme);

      // Restore layer spacing ? triggers internal geometry rebuild
      if (data.layerSpacing != null && data.layerSpacing >= 2.0 && data.layerSpacing <= 6.0) {
        const delta = data.layerSpacing - leftPanel.layerSpacing;
        leftPanel.adjustLayerSpacing(delta);
      }

      // Restore current player
      if (data.currentPlayer === 1 || data.currentPlayer === 2) {
        rightPanel.setCurrentPlayer(data.currentPlayer);
      }

      // Update panels
      leftPanel.renderAllPieces(rightPanel.board, focusZ);
      rightPanel.refresh();

      // Close esc menu on success
      closeEscMenu();

      console.log("[Load] Game loaded successfully (%d moves)", data.moves.length);
    } catch (err) {
      console.error("[Load] Failed to load game:", err);
      alert("[Load] Failed to load game. See console for details.");
    }
  };
  void loadGameFromClipboard;


  if (startBtn) startBtn.addEventListener("click", startGame);

  const showGuide = () => {
    startScreen?.classList.add("hidden");
    guideScreen?.classList.remove("hidden");
  };
  const backToStart = () => {
    guideScreen?.classList.add("hidden");
    startScreen?.classList.remove("hidden");
  };

  guideBtn?.addEventListener("click", showGuide);
  guideBackBtn?.addEventListener("click", backToStart);
  if (guideStartBtn) {
    guideStartBtn.addEventListener("click", startGame);
  }

  escResume?.addEventListener("click", closeEscMenu);
  escRestart?.addEventListener("click", () => { closeEscMenu(); confirmRestart(); });
  escSave?.addEventListener("click", () => { closeEscMenu(); saveGame(); });
  escTitle?.addEventListener("click", () => { closeEscMenu(); returnToTitle(); });

    // ===== Slot Action Menu Listeners =====
  document.getElementById("slot-btn-enter")?.addEventListener("click", () => {
    if (currentSlotIndex < 0 || !saveSlots[currentSlotIndex]) return;
    loadGame(saveSlots[currentSlotIndex]!);
    document.getElementById("slot-action-menu")?.classList.add("hidden");
    showToast("已读取存档");
    currentSlotIndex = -1;
  });

  document.getElementById("slot-btn-overwrite")?.addEventListener("click", () => {
    if (currentSlotIndex < 0) return;
    // Serialize current game state to Base64
    const moves: Array<{ x: number; y: number; z: number; player: number }> = [];
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
    const saveData = {
      version: "0.4.0",
      timestamp: Date.now(),
      boardSize: 13,
      layers: LAYER_COUNT,
      layerSpacing: leftPanel.layerSpacing,
      moves,
      focusZ,
      isDarkTheme: currentTheme.name === "dark",
      currentPlayer: rightPanel.getCurrentPlayer(),
    };
    const base64 = btoa(unescape(encodeURIComponent(JSON.stringify(saveData))));
    saveSlots[currentSlotIndex] = base64;
    localStorage.setItem("gomoku_saves", JSON.stringify(saveSlots));
    renderSaveSlots();
    document.getElementById("slot-action-menu")?.classList.add("hidden");
    showToast("已保存到存档 " + (currentSlotIndex + 1));
    currentSlotIndex = -1;
  });

  document.getElementById("slot-btn-paste")?.addEventListener("click", () => {
    if (currentSlotIndex < 0) {
      document.getElementById("slot-action-menu")?.classList.add("hidden");
      return;
    }
    const input = prompt("粘贴 Base64 存档数据：");
    if (!input) {
      document.getElementById("slot-action-menu")?.classList.add("hidden");
      currentSlotIndex = -1;
      return;
    }
    saveSlots[currentSlotIndex] = input;
    localStorage.setItem("gomoku_saves", JSON.stringify(saveSlots));
    renderSaveSlots();
    document.getElementById("slot-action-menu")?.classList.add("hidden");
    showToast("已粘贴到存档 " + (currentSlotIndex + 1));
    currentSlotIndex = -1;
  });

  window.addEventListener("keydown", (e: KeyboardEvent) => {
    // Theme toggle works regardless of game state
    if (e.key === "t" || e.key === "T") {
      e.preventDefault();
      currentTheme = currentTheme.name === "dark" ? LIGHT_THEME : DARK_THEME;
      const isDark = currentTheme.name === "dark";
      document.body.classList.toggle("dark-theme", isDark);
      eventBus.emit(Events.THEME_CHANGED, isDark);
      return;
    }
    if (!isGameStarted) {
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        startGame();
      }
      return; // Block all other keys before game starts
    }

    // Unified modal interceptor 锟斤拷 priority: Esc menu > restart modal
    if (isEscMenuOpen) {
      switch (e.code) {
        case "Escape": e.preventDefault(); closeEscMenu(); break;
        case "KeyR": e.preventDefault(); closeEscMenu(); confirmRestart(); break;
        case "KeyS": e.preventDefault(); closeEscMenu(); saveGame(); break;
        case "KeyL": {
          e.preventDefault();
          closeEscMenu();
          // Find last non-null index
          let lastIndex = -1;
          for (let i = saveSlots.length - 1; i >= 0; i--) {
            if (saveSlots[i] !== null) { lastIndex = i; break; }
          }
          if (lastIndex >= 0 && saveSlots[lastIndex]) {
            loadGame(saveSlots[lastIndex]!);
            showToast("已读取存档 " + (lastIndex + 1));
          } else {
            showToast("没有可读取的存档", true);
          }
          break;
        }
        case "KeyB": e.preventDefault(); closeEscMenu(); returnToTitle(); break;
      }
      e.stopPropagation();
      return;
    }

    switch (e.key) {
    
      case "a": case "A":
        e.preventDefault();
        focusZ = (focusZ - 1 + LAYER_COUNT) % LAYER_COUNT;
        eventBus.emit(Events.LAYER_CHANGED, focusZ);
        leftPanel.renderAllPieces(rightPanel.board, focusZ);
        break;

      case "d": case "D":
        e.preventDefault();
        focusZ = (focusZ + 1) % LAYER_COUNT;
        eventBus.emit(Events.LAYER_CHANGED, focusZ);
        leftPanel.renderAllPieces(rightPanel.board, focusZ);
        break;

    
      case "q": case "Q":
        e.preventDefault();
        leftPanel.rotateY(1);
        break;
      case "e": case "E":
        e.preventDefault();
        leftPanel.rotateY(-1);
        break;

      case "f": case "F":
        e.preventDefault();
        rightPanel.toggleMirror();
        break;

    
      case "w": case "W":
        e.preventDefault();
        leftPanel.zoom(1);
        break;
      case "s": case "S":
        e.preventDefault();
        leftPanel.zoom(-1);
        break;


      case "z": case "Z":
        e.preventDefault();
        console.log("KeyZ pressed");
        leftPanel.adjustLayerSpacing(-0.5);
        break;
      case "c": case "C":
        e.preventDefault();
        console.log("KeyC pressed");
        leftPanel.adjustLayerSpacing(0.5);
        break;



    
      case "r": case "R":
        if (!isGameStarted) return;
        e.preventDefault();
        openEscMenu();
        break;

      case "Escape":
        if (!isGameStarted) return;
        e.preventDefault();
        openEscMenu();
        break;

      case "x": case "X":
        if (!isGameStarted) return;
        e.preventDefault();
        leftPanel.toggleLayerSpacing();
        break;

      case "h": case "H":
        e.preventDefault();
        {
          const mode = rightPanel.cycleAuxMode();
          leftPanel.setAuxMode(mode);
        }
        break;
    }
  });


  leftEl.addEventListener("wheel", (e: WheelEvent) => {
    if (!isGameStarted) return;
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
}

main();

