import "./style/main.css";
import { LIGHT_THEME, DARK_THEME } from "./core/Types";
import type { Theme } from "./core/Types";
import { LeftPanel } from "./views/LeftPanel";
import { RightPanel } from "./views/RightPanel";

function main(): void {
  const leftEl = document.getElementById("left-panel");
  const rightEl = document.getElementById("right-panel");
  if (!leftEl || !rightEl) throw new Error("Missing #left-panel or #right-panel element");

  // Default to light theme
  let currentTheme: Theme = LIGHT_THEME;
  document.body.classList.remove("dark-theme");

  // Start screen state
  let isGameStarted = false;
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

  const forceCorrectSize = (): void => {
    const lw = leftEl.clientWidth || window.innerWidth * 0.5;
    const rw = rightEl.clientWidth || window.innerWidth * 0.5;
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

  // Start button click
  if (startBtn) startBtn.addEventListener("click", startGame);

  // Allow Space/Enter to start
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    if (!isGameStarted) {
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        startGame();
      }
      return; // Block all other keys before game starts
    }

    // === Game keys (only when isGameStarted) ===
    switch (e.key) {
      // FocusZ cycling (A/D)
      case "a": case "A":
        e.preventDefault();
        focusZ = (focusZ - 1 + 6) % 6;
        leftPanel.highlightFocusLayer(focusZ);
        leftPanel.renderAllPieces(rightPanel.board, focusZ);
        rightPanel.setFocusZ(focusZ);
        break;

      case "d": case "D":
        e.preventDefault();
        focusZ = (focusZ + 1) % 6;
        leftPanel.highlightFocusLayer(focusZ);
        leftPanel.renderAllPieces(rightPanel.board, focusZ);
        rightPanel.setFocusZ(focusZ);
        break;

      // Left panel rotation (Q/E)
      case "q": case "Q":
        e.preventDefault();
        leftPanel.rotateY(-1);
        break;
      case "e": case "E":
        e.preventDefault();
        leftPanel.rotateY(1);
        break;

      // Dolly zoom (W/S)
      case "w": case "W":
        e.preventDefault();
        leftPanel.zoom(1);
        break;
      case "s": case "S":
        e.preventDefault();
        leftPanel.zoom(-1);
        break;

      // Theme toggle (T)
      case "t": case "T":
        e.preventDefault();
        currentTheme = currentTheme.name === "dark" ? LIGHT_THEME : DARK_THEME;
        document.body.classList.toggle("dark-theme", currentTheme.name === "dark");
        leftPanel.updateTheme(currentTheme);
        rightPanel.updateTheme(currentTheme);
        break;

      // Aux mode cycling (H)
      case "h": case "H":
        e.preventDefault();
        {
          const mode = rightPanel.cycleAuxMode();
          leftPanel.setAuxMode(mode);
        }
        break;
    }
  });

  // Left panel wheel -> rotate Y
  leftEl.addEventListener("wheel", (e: WheelEvent) => {
    if (!isGameStarted) return;
    e.preventDefault();
    leftPanel.rotateY(e.deltaY > 0 ? 1 : -1);
  });

  window.addEventListener("resize", () => {
    const lw = leftEl.clientWidth || window.innerWidth * 0.5;
    const rw = rightEl.clientWidth || window.innerWidth * 0.5;
    const h = window.innerHeight;
    leftPanel.resize(lw, h);
    rightPanel.resize(rw, h);
  });
}

main();
