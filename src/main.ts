import { LeftPanel } from "./views/LeftPanel";
import { RightPanel } from "./views/RightPanel";

function main(): void {
  const leftEl = document.getElementById("left-panel");
  const rightEl = document.getElementById("right-panel");

  if (!leftEl || !rightEl) {
    throw new Error("Missing #left-panel or #right-panel element");
  }

  const leftPanel = new LeftPanel(leftEl);
  const rightPanel = new RightPanel(rightEl);

  let focusZ = 0;

  // --- Animation loop ---
  const animate = (): void => {
    leftPanel.render();
    rightPanel.render();
    requestAnimationFrame(animate);
  };
  animate();

  // --- Mouse wheel on right panel -> adjust focusZ ---
  rightEl.addEventListener("wheel", (e: WheelEvent) => {
    e.preventDefault();
    const dir = e.deltaY > 0 ? 1 : -1;
    focusZ = Math.max(0, Math.min(5, focusZ + dir));
    leftPanel.highlightFocusLayer(focusZ);
    rightPanel.setFocusZ(focusZ);
  });

  // --- Q / E keys -> rotate left panel ---
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "q" || e.key === "Q") {
      leftPanel.rotateZ(-1);
    } else if (e.key === "e" || e.key === "E") {
      leftPanel.rotateZ(1);
    }
  });

  // --- Window resize -> sync both panels ---
  window.addEventListener("resize", () => {
    leftPanel.resize();
    rightPanel.resize();
  });
}

main();