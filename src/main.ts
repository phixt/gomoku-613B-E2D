import "./style/main.css";
import { LIGHT_THEME, DARK_THEME } from "./core/Types";
import type { Theme } from "./core/Types";
import { LeftPanel } from "./views/LeftPanel";
import { RightPanel } from "./views/RightPanel";

const LAYER_COUNT = 6;
const PANEL_RATIO = 0.5;

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
    console.log("[Save] Save feature will be implemented in v0.4.0");
  };



  if (startBtn) startBtn.addEventListener("click", startGame);


  escResume?.addEventListener("click", closeEscMenu);
  escRestart?.addEventListener("click", () => { closeEscMenu(); confirmRestart(); });
  escSave?.addEventListener("click", () => { closeEscMenu(); saveGame(); });
  escTitle?.addEventListener("click", () => { closeEscMenu(); returnToTitle(); });


  window.addEventListener("keydown", (e: KeyboardEvent) => {
    // Theme toggle works regardless of game state
    if (e.key === "t" || e.key === "T") {
      e.preventDefault();
      currentTheme = currentTheme.name === "dark" ? LIGHT_THEME : DARK_THEME;
      document.body.classList.toggle("dark-theme", currentTheme.name === "dark");
      leftPanel.updateTheme(currentTheme);
      rightPanel.updateTheme(currentTheme);
      return;
    }
    if (!isGameStarted) {
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        startGame();
      }
      return; // Block all other keys before game starts
    }

    // Unified modal interceptor �� priority: Esc menu > restart modal
    if (isEscMenuOpen) {
      switch (e.code) {
        case "Escape": e.preventDefault(); closeEscMenu(); break;
        case "KeyR": e.preventDefault(); closeEscMenu(); confirmRestart(); break;
        case "KeyS": e.preventDefault(); closeEscMenu(); saveGame(); break;
        case "KeyB": e.preventDefault(); closeEscMenu(); returnToTitle(); break;
      }
      e.stopPropagation();
      return;
    }

    switch (e.key) {
    
      case "a": case "A":
        e.preventDefault();
        focusZ = (focusZ - 1 + LAYER_COUNT) % LAYER_COUNT;
        leftPanel.highlightFocusLayer(focusZ);
        leftPanel.renderAllPieces(rightPanel.board, focusZ);
        rightPanel.setFocusZ(focusZ);
        break;

      case "d": case "D":
        e.preventDefault();
        focusZ = (focusZ + 1) % LAYER_COUNT;
        leftPanel.highlightFocusLayer(focusZ);
        leftPanel.renderAllPieces(rightPanel.board, focusZ);
        rightPanel.setFocusZ(focusZ);
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
