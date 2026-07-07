import "./style/main.css";
import { DARK_THEME, LIGHT_THEME } from "./core/Types";
import type { Theme } from "./core/Types";
import { LeftPanel } from "./views/LeftPanel";
import { RightPanel } from "./views/RightPanel";

function main(): void {
  const leftEl = document.getElementById("left-panel");
  const rightEl = document.getElementById("right-panel");

  if (!leftEl || !rightEl) {
    throw new Error("Missing #left-panel or #right-panel element");
  }

  let currentTheme: Theme = DARK_THEME;

  const leftPanel = new LeftPanel(leftEl, currentTheme);
  const rightPanel = new RightPanel(rightEl, currentTheme);

  // ── Piece change synchronisation ─────────────────────────
  rightPanel.onPieceChanged = (board: import("./core/Board").Board, z: number): void => {
    leftPanel.renderAllPieces(board, z);
  };

  // Force a correct resize after the first layout frame so CSS has taken effect.
  const forceCorrectSize = (): void => {
    const lw = leftEl.clientWidth || window.innerWidth * 0.5;
    const rw = rightEl.clientWidth || window.innerWidth * 0.5;
    const h = window.innerHeight;
    leftPanel.resize(lw, h);
    rightPanel.resize(rw, h);
  };

  requestAnimationFrame(() => {
    requestAnimationFrame(forceCorrectSize);
  });

  let focusZ = 0;

  // Initial piece render (board is empty, so this is a no-op for now)
  leftPanel.renderAllPieces(rightPanel.board, focusZ);

  // ── Animation loop ──────────────────────────────────────
  const animate = (): void => {
    leftPanel.render();
    rightPanel.render();
    requestAnimationFrame(animate);
  };
  animate();

  // ──────────────────────────────────────────────
  //  Left-panel wheel → Y-axis rotation (like Q/E)
  // ──────────────────────────────────────────────
  leftEl.addEventListener("wheel", (e: WheelEvent) => {
    e.preventDefault();
    const dir = e.deltaY > 0 ? 1 : -1;
    leftPanel.rotateY(dir);
  });

  // ──────────────────────────────────────────────
  //  Keyboard
  // ──────────────────────────────────────────────
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    switch (e.key) {
      // ---- FocusZ: previous layer ----
      case "a":
      case "A":
      case "ArrowLeft":
        e.preventDefault();
        focusZ = Math.max(0, focusZ - 1);
        leftPanel.highlightFocusLayer(focusZ);
        leftPanel.renderAllPieces(rightPanel.board, focusZ);
        rightPanel.setFocusZ(focusZ);
        break;

      // ---- FocusZ: next layer ----
      case "d":
      case "D":
      case "ArrowRight":
        e.preventDefault();
        focusZ = Math.min(5, focusZ + 1);
        leftPanel.highlightFocusLayer(focusZ);
        leftPanel.renderAllPieces(rightPanel.board, focusZ);
        rightPanel.setFocusZ(focusZ);
        break;

      // ---- Rotate left panel CCW ----
      case "q":
      case "Q":
        leftPanel.rotateY(-1);
        break;

      // ---- Rotate left panel CW ----
      case "e":
      case "E":
        leftPanel.rotateY(1);
        break;

      // ---- Zoom in (FOV decreases) ----
      case "w":
      case "W":
        e.preventDefault();
        leftPanel.zoom(1);
        break;

      // ---- Zoom out (FOV increases) ----
      case "s":
      case "S":
        e.preventDefault();
        leftPanel.zoom(-1);
        break;

      // ---- Toggle theme ----
      case "t":
      case "T":
        currentTheme = currentTheme.name === "dark" ? LIGHT_THEME : DARK_THEME;
        document.body.classList.toggle("light-theme", currentTheme.name === "light");
        leftPanel.updateTheme(currentTheme);
        rightPanel.updateTheme(currentTheme);
        break;
    }
  });

  // ──────────────────────────────────────────────
  //  Window resize
  // ──────────────────────────────────────────────
  window.addEventListener("resize", () => {
    const lw = leftEl.clientWidth || window.innerWidth * 0.5;
    const rw = rightEl.clientWidth || window.innerWidth * 0.5;
    const h = window.innerHeight;
    leftPanel.resize(lw, h);
    rightPanel.resize(rw, h);
  });
}

main();