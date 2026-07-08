import * as THREE from "three";
import { type Theme, type CellState, BLACK, WHITE, AuxMode } from "../core/Types";
import type { Line3DData, HighlightPoint3D, AuxData3D } from "../core/Types";
import { Board } from "../core/Board";
import { checkWinner } from "../core/Rules";
import { DIRECTIONS_3D } from "../utils/MathUtils";

const BOARD_SIZE = 13;
const LAYER_COUNT = 6;
const LAYER_SPACING = 3.5; // ???? LeftPanel.LAYER_SPACING
const CENTER = (BOARD_SIZE - 1) / 2;
const FRUSTUM_SIZE = 14;
const PIECE_RADIUS = 0.42;
const GHOST_OPACITY = 0.35;

const DIRS_2D: [number, number][] = [[1, 0], [0, 1], [1, 1], [1, -1]];

const ALLY_COLOR = 0x00FF00;
const ENEMY_COLOR = 0xFF0000;

// 鈹€鈹€ Grid geometry 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

function buildLayerGridGeometry(): THREE.BufferGeometry {
  const p: number[] = [];
  for (let y = 0; y < BOARD_SIZE; y++) p.push(0, y, 0, BOARD_SIZE - 1, y, 0);
  for (let x = 0; x < BOARD_SIZE; x++) p.push(x, 0, 0, x, BOARD_SIZE - 1, 0);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  return g;
}

// 鈹€鈹€ Piece texture 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

function createPieceTexture(isBlack: boolean, isGhost = false): THREE.CanvasTexture {
  const size = 64, canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const cx = size / 2, cy = size / 2, r = size / 2 - 2;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath();

  if (isGhost) {
    if (isBlack) {
      const g = ctx.createRadialGradient(cx * 0.3 + size * 0.2, cy * 0.3 + size * 0.2, 0, cx, cy, r);
      g.addColorStop(0, "#444444"); g.addColorStop(0.5, "#222222"); g.addColorStop(1, "#000000");
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = "#000000"; ctx.lineWidth = 2.5; ctx.stroke();
    } else {
      const g = ctx.createRadialGradient(cx * 0.3 + size * 0.2, cy * 0.3 + size * 0.2, 0, cx, cy, r);
      g.addColorStop(0, "#F0E8E0"); g.addColorStop(0.5, "#D0C8C0"); g.addColorStop(1, "#A09A95");
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = "#555555"; ctx.lineWidth = 2.5; ctx.stroke();
    }
  } else {
    if (isBlack) {
      const g = ctx.createRadialGradient(cx * 0.3 + size * 0.2, cy * 0.3 + size * 0.2, 0, cx, cy, r);
      g.addColorStop(0, "#444444"); g.addColorStop(0.5, "#000000"); g.addColorStop(1, "#000000");
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = "#111111"; ctx.lineWidth = 2; ctx.stroke();
    } else {
      const g = ctx.createRadialGradient(cx * 0.3 + size * 0.2, cy * 0.3 + size * 0.2, 0, cx, cy, r);
      g.addColorStop(0, "#FFFFFF"); g.addColorStop(0.5, "#C0D0D0"); g.addColorStop(1, "#90A0A0");
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = "#90A0A0"; ctx.lineWidth = 2; ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas); tex.needsUpdate = true; return tex;
}


// 鈹€鈹€ RightPanel 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

export class RightPanel {
  public readonly renderer: THREE.WebGLRenderer;
  public readonly board: Board;
  public onPieceChanged: ((board: Board, focusZ: number) => void) | null = null;
  public on3DAuxDataChanged: ((data: AuxData3D) => void) | null = null;
  public onHoverChanged: ((x: number, y: number, z: number) => void) | null = null;

  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private gridGroup: THREE.Group;
  private gridSegments: THREE.LineSegments;
  private pieceGroup: THREE.Group;
  private ghostMesh: THREE.Mesh | null;


  private hoverAuxLines2D: THREE.LineSegments;

  private highlightMarkersGroup: THREE.Group;

  private container: HTMLElement;
  private focusZ: number = 0;
  private currentPlayer: CellState = BLACK;
  private theme: Theme;
  private auxMode: AuxMode = AuxMode.ALL;
  private blackTex: THREE.CanvasTexture;
  private whiteTex: THREE.CanvasTexture;
  private blackGhostTex: THREE.CanvasTexture;
  private whiteGhostTex: THREE.CanvasTexture;
  private blackMat!: THREE.MeshBasicMaterial;
  private whiteMat!: THREE.MeshBasicMaterial;
  private hoverValid: boolean = false;
  private hoverX: number = -1;
  private hoverY: number = -1;
  private _hoverWorldPos: THREE.Vector3 | null = null;
  private isMirrored: boolean = true;
  private boundMouseMove: (e: MouseEvent) => void;
  private boundClick: (e: MouseEvent) => void;
  private boundResize: () => void;

  constructor(container: HTMLElement, theme: Theme) {
    this.container = container;
    this.theme = theme;
    this.board = new Board();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setClearColor(theme.bgColor);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-7, 7, 7, -7, 0.1, 1000);
    this.camera.position.set(CENTER, CENTER, 50);
    this.camera.lookAt(CENTER, CENTER, 0);

    this.blackTex = createPieceTexture(true);
    this.whiteTex = createPieceTexture(false);
    this.blackGhostTex = createPieceTexture(true, true);
    this.whiteGhostTex = createPieceTexture(false, true);

    this.blackMat = new THREE.MeshBasicMaterial({ map: this.blackTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, depthTest: true });
    this.whiteMat = new THREE.MeshBasicMaterial({ map: this.whiteTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, depthTest: true });
    this.gridGroup = new THREE.Group();
    const gridGeo = buildLayerGridGeometry();
    const gridMat = new THREE.LineBasicMaterial({ color: theme.gridColor, transparent: true, opacity: 1 });
    this.gridSegments = new THREE.LineSegments(gridGeo, gridMat);
    this.gridGroup.add(this.gridSegments);

    // --- Star points for board navigation ---
    const starPositions = [
        { x: 6, y: 6 },
        { x: 1, y: 1 }, { x: 1, y: 11 },
        { x: 11, y: 1 }, { x: 11, y: 11 }
    ];
    const starGeo = new THREE.CircleGeometry(0.12, 32);
    const starMat = new THREE.MeshBasicMaterial({
        color: 0xCC0000,
        side: THREE.DoubleSide,
        depthWrite: true,
        depthTest: true,
    });
    starPositions.forEach(p => {
        const m = new THREE.Mesh(starGeo, starMat);
        m.position.set(p.x, p.y, 0.005);
        this.gridGroup.add(m);
    });


    this.scene.add(this.gridGroup);
    this.pieceGroup = new THREE.Group();
    this.scene.add(this.pieceGroup);
    this.ghostMesh = null;

    const auxGeo = new THREE.BufferGeometry();
    auxGeo.setAttribute("position", new THREE.Float32BufferAttribute([], 3));
    auxGeo.setAttribute("color", new THREE.Float32BufferAttribute([], 3));
    const auxMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false });
    this.hoverAuxLines2D = new THREE.LineSegments(auxGeo, auxMat);
    this.hoverAuxLines2D.renderOrder = 1;
    this.scene.add(this.hoverAuxLines2D);
    this.highlightMarkersGroup = new THREE.Group();
    this.highlightMarkersGroup.renderOrder = 1;
    this.scene.add(this.highlightMarkersGroup);

    container.appendChild(this.renderer.domElement);

    this.boundResize = (): void => { this.resize(); };
    window.addEventListener("resize", this.boundResize);

    this.boundMouseMove = (e: MouseEvent): void => this.handleMouseMove(e);
    this.boundClick = (): void => this.handleClick();
    this.renderer.domElement.addEventListener("mousemove", this.boundMouseMove);
    this.renderer.domElement.addEventListener("click", this.boundClick);

    requestAnimationFrame(() => { requestAnimationFrame(() => { this.resize(); }); });
  }
  dispose(): void {
    window.removeEventListener("resize", this.boundResize);
    this.renderer.domElement.removeEventListener("mousemove", this.boundMouseMove);
    this.renderer.domElement.removeEventListener("click", this.boundClick);
    this.renderer.dispose();
  }

  /** Returns the 3D world-space hover position (Z pre-multiplied) or null. */
  getHoverWorldPos(): THREE.Vector3 | null {
    return this._hoverWorldPos;
  }



  private handleMouseMove = (e: MouseEvent): void => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const w = rect.width || 1, h = rect.height || 1;
    const ndcX = ((e.clientX - rect.left) / w) * 2 - 1;
    const ndcY = -((e.clientY - rect.top) / h) * 2 + 1;
    const vec = new THREE.Vector3(ndcX, ndcY, 0.5);
    vec.unproject(this.camera);
    const gx = Math.round(vec.x), gy = Math.round(vec.y);

    if (gx < 0 || gx >= BOARD_SIZE || gy < 0 || gy >= BOARD_SIZE || this.board.get(gx, gy, this.focusZ) !== 0) {
      this.hideGhostPiece();
      this.hoverValid = false;
      this._hoverWorldPos = null;
      this.clearAllOverlays();
      return;
    }

    this.showGhostPiece(gx, gy);
    this.hoverValid = true;
    this.hoverX = gx;
    this.hoverY = gy;
    this._hoverWorldPos = new THREE.Vector3(gx, gy, this.focusZ * LAYER_SPACING);
    this.computeHoverOverlays(gx, gy);
    if (this.onHoverChanged) this.onHoverChanged(gx, gy, this.focusZ);
  };

  private clearAllOverlays(): void {
    this.scene.remove(this.hoverAuxLines2D);
    this.hoverAuxLines2D.geometry.dispose();
    (this.hoverAuxLines2D.material as THREE.Material).dispose();

    const geo = new THREE.BufferGeometry();
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false });
    this.hoverAuxLines2D = new THREE.LineSegments(geo, mat);
    this.hoverAuxLines2D.renderOrder = 1;
    this.scene.add(this.hoverAuxLines2D);

    this.clearHighlightMarkers();

    if (this.on3DAuxDataChanged) this.on3DAuxDataChanged({ lines: [], points: [] });
    if (this.onHoverChanged) this.onHoverChanged(-1, -1, -1);
  }



  private clearHighlightMarkers(): void {
    while (this.highlightMarkersGroup.children.length > 0) {
      const c = this.highlightMarkersGroup.children[0];
      if (c instanceof THREE.Mesh) { c.geometry.dispose(); if (c.material instanceof THREE.Material) c.material.dispose(); }
      this.highlightMarkersGroup.remove(c);
    }
  }

  private addHighlightMarker(x: number, y: number, color: number): void {
    const geo = new THREE.CircleGeometry(0.10, 12);
    const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.8, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, this.focusZ * LAYER_SPACING + 0.04);
    this.highlightMarkersGroup.add(mesh);
  }



  private computeHoverOverlays(hx: number, hy: number): void {
  
    if (!(this.auxMode & 0b10)) {
      this.clearAllOverlays();
      if (this.on3DAuxDataChanged) this.on3DAuxDataChanged({ lines: [], points: [] });
      return;
    }
    const z = this.focusZ;
    const pos2D: number[] = [];
    const col2D: number[] = [];
    const lines3D: Line3DData[] = [];
    const pts3D: HighlightPoint3D[] = [];

    this.clearHighlightMarkers();

  
    for (const [dx, dy] of DIRS_2D) {
      this.scanDirection2D(hx, hy, dx, dy, z, pos2D, col2D, pts3D);
      this.scanDirection2D(hx, hy, -dx, -dy, z, pos2D, col2D, pts3D);
    }

  
    const include3D = !!(this.auxMode & 0b01);
    if (include3D) {
      for (const [dx, dy, dz] of DIRECTIONS_3D.map((d) => [d.x, d.y, d.z])) {
        this.scanDirection3D(hx, hy, z, dx, dy, dz, lines3D, pts3D);
        this.scanDirection3D(hx, hy, z, -dx, -dy, -dz, lines3D, pts3D);
      }
    }

  
    // Fully recreate LineSegments to avoid WebGL buffer state issues
    this.scene.remove(this.hoverAuxLines2D);
    this.hoverAuxLines2D.geometry.dispose();
    (this.hoverAuxLines2D.material as THREE.Material).dispose();

    if (pos2D.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos2D, 3));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(col2D, 3));
      const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false });
      this.hoverAuxLines2D = new THREE.LineSegments(geo, mat);
      this.hoverAuxLines2D.renderOrder = 1;
      this.scene.add(this.hoverAuxLines2D);
    } else {
      const geo = new THREE.BufferGeometry();
      const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false });
      this.hoverAuxLines2D = new THREE.LineSegments(geo, mat);
      this.hoverAuxLines2D.renderOrder = 1;
      this.scene.add(this.hoverAuxLines2D);
    }

  
    if (this.on3DAuxDataChanged) {
      this.on3DAuxDataChanged({ lines: lines3D, points: pts3D });
    }
  }

  /**
   * Scan a single 2D direction with noise reduction:
   * Skip empty cells until the FIRST non-empty cell is found.
   * If board edge is reached without finding a stone �?draw nothing (noise cancelled).
   * If first non-empty is ally �?green from hover to that stone, continue forward.
   * If first non-empty is enemy �?red from hover to that stone, stop.
   */
  private scanDirection2D(
    hx: number, hy: number, dx: number, dy: number, z: number,
    pos2D: number[], col2D: number[], pts3D: HighlightPoint3D[],
  ): void {
  
    const maxSteps = 4;
    let firstStep = 1;
    while (true) {
      const px = hx + dx * firstStep, py = hy + dy * firstStep;
      if (px < 0 || px >= BOARD_SIZE || py < 0 || py >= BOARD_SIZE) return; // no stone �?draw nothing
      if (firstStep > maxSteps) return; // exceeded search range
            const s = this.board.get(px, py, z);
      if (s !== 0) break;
      firstStep++;
    }

  
    let step = firstStep;
    let prevX = hx, prevY = hy;
    while (true) {
      if (step > maxSteps) break; // exceeded search range
            const px = hx + dx * step, py = hy + dy * step;
      if (px < 0 || px >= BOARD_SIZE || py < 0 || py >= BOARD_SIZE) break;
      const s = this.board.get(px, py, z);

      const isAlly = s === this.currentPlayer;
      const color = s === 0 ? ALLY_COLOR : (isAlly ? ALLY_COLOR : ENEMY_COLOR);

    
      if (s !== 0) {
        // Enemy lines at Z=0.03 (top), ally lines at Z=0.02
        const lineZ = z * LAYER_SPACING + (isAlly ? 0.02 : 0.03);
        pos2D.push(prevX, prevY, lineZ, px, py, lineZ);
        for (let i = 0; i < 2; i++) {
          const r = ((color >> 16) & 0xff) / 255;
          const g = ((color >> 8) & 0xff) / 255;
          const b = (color & 0xff) / 255;
          col2D.push(r, g, b);
        }
      }

      if (s === 0) {
        this.addHighlightMarker(prevX, prevY, color);
        pts3D.push({ x: prevX, y: prevY, z: z, color }); // logical Z index
        break;
      }

      if (!isAlly) {
      
        this.addHighlightMarker(px, py, color);
        pts3D.push({ x: px, y: py, z: z, color }); // logical Z index
        break;
      }

    
      prevX = px; prevY = py;
      step++;
    }
    // Marker at last valid piece when maxSteps terminated the loop
    if (prevX !== hx || prevY !== hy) {
      this.addHighlightMarker(prevX, prevY, ALLY_COLOR);
      pts3D.push({ x: prevX, y: prevY, z: z, color: ALLY_COLOR }) // logical Z index;
    }
  }

  /**
   * Scan a single 3D direction with noise reduction.
   * Skip empty cells until the FIRST non-empty cell is found.
   * If board edge reached without finding a stone �?draw nothing.
   */
  private scanDirection3D(
    hx: number, hy: number, hz: number,
    dx: number, dy: number, dz: number,
    lines3D: Line3DData[], pts3D: HighlightPoint3D[],
  ): void {

    const maxSteps = 4;
    let firstStep = 1;
    while (true) {
      const px = hx + dx * firstStep, py = hy + dy * firstStep, pz = hz + dz * firstStep;
      if (px < 0 || px >= BOARD_SIZE || py < 0 || py >= BOARD_SIZE || pz < 0 || pz >= LAYER_COUNT) return;
      if (firstStep > maxSteps) return; // exceeded search range
            const s = this.board.get(px, py, pz);
      if (s !== 0) break;
      firstStep++;
    }


    let step = firstStep;
    let prevX = hx, prevY = hy, prevZ = hz;
    while (true) {
      if (step > maxSteps) break; // exceeded search range
            const px = hx + dx * step, py = hy + dy * step, pz = hz + dz * step;
      if (px < 0 || px >= BOARD_SIZE || py < 0 || py >= BOARD_SIZE || pz < 0 || pz >= LAYER_COUNT) break;
      const s = this.board.get(px, py, pz);

      const isAlly = s === this.currentPlayer;
      const color = s === 0 ? ALLY_COLOR : (isAlly ? ALLY_COLOR : ENEMY_COLOR);

      if (s !== 0) {
      lines3D.push({
        startX: prevX, startY: prevY, startZ: prevZ, // logical Z index
        endX: px, endY: py, endZ: pz, // logical Z index
        color,
      });
      }

      if (s === 0) {
        // Green marker at last valid piece, not at empty cell beyond
        pts3D.push({ x: prevX, y: prevY, z: prevZ, color }); // logical Z index
        break;
      }

      if (!isAlly) {
        pts3D.push({ x: px, y: py, z: pz, color }); // logical Z index
        break;
      }

      prevX = px; prevY = py; prevZ = pz;
      step++;
    }
    // Green marker at last valid piece when maxSteps terminated the loop
    if (prevX !== hx || prevY !== hy || prevZ !== hz) {
      pts3D.push({ x: prevX, y: prevY, z: prevZ, color: ALLY_COLOR }); // logical Z index
    }
  }



  private hideGhostPiece(): void { if (this.ghostMesh) this.ghostMesh.visible = false; }

  private showGhostPiece(gx: number, gy: number): void {
    const isBlack = this.currentPlayer === BLACK;
    if (!this.ghostMesh) {
      const geo = new THREE.CircleGeometry(PIECE_RADIUS, 24);
      const mat = new THREE.MeshBasicMaterial({
        map: isBlack ? this.blackGhostTex : this.whiteGhostTex,
        transparent: true, opacity: GHOST_OPACITY, side: THREE.DoubleSide, depthWrite: false,
      });
      this.ghostMesh = new THREE.Mesh(geo, mat);
      this.pieceGroup.add(this.ghostMesh);
    }
    const mat = this.ghostMesh.material as THREE.MeshBasicMaterial;
    const neededTex = isBlack ? this.blackGhostTex : this.whiteGhostTex;
    if (mat.map !== neededTex) { mat.map = neededTex; mat.needsUpdate = true; }
    this.ghostMesh.position.set(gx, gy, 0.01);
    this.ghostMesh.visible = true;
  }



  private handleClick = (): void => {
    if (!this.hoverValid) return;
    const gx = this.hoverX, gy = this.hoverY;
    if (gx < 0 || gx >= BOARD_SIZE || gy < 0 || gy >= BOARD_SIZE || this.board.get(gx, gy, this.focusZ) !== 0) return;
    this.board.set(gx, gy, this.focusZ, this.currentPlayer);
    const actualState = this.board.get(gx, gy, this.focusZ);
    console.log(`[Board] State at (${gx},${gy},${this.focusZ}) is now: ${actualState} (${actualState === BLACK ? "BLACK" : actualState === WHITE ? "WHITE" : "EMPTY"})`);

    this.renderPieces();
    if (this.onPieceChanged) this.onPieceChanged(this.board, this.focusZ);

    const winner = checkWinner(this.board, gx, gy, this.focusZ);
    console.log(`[Rules] checkWinner returned: ${winner} (${winner === BLACK ? "BLACK" : winner === WHITE ? "WHITE" : "NONE"})`);

    if (winner !== 0) {
      setTimeout(() => {
        alert(winner === BLACK ? "黑方胜利" : "白方胜利");
        this.board.reset();
        this.renderPieces();
        if (this.onPieceChanged) this.onPieceChanged(this.board, this.focusZ);
        if (this.on3DAuxDataChanged) this.on3DAuxDataChanged({ lines: [], points: [] });
      }, 50);
    }

    this.currentPlayer = this.currentPlayer === BLACK ? WHITE : BLACK;
    this.clearAllOverlays();

    const rect = this.renderer.domElement.getBoundingClientRect();
    const midX = rect.left + rect.width / 2, midY = rect.top + rect.height / 2;
    this.handleMouseMove(new MouseEvent("mousemove", { clientX: midX, clientY: midY }));
  };



  private renderPieces(): void {
    this.pieceGroup.clear();
    this.ghostMesh = null;

    const geo = new THREE.CircleGeometry(PIECE_RADIUS, 24);
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const state = this.board.get(x, y, this.focusZ);
        if (state === 0) continue;
        const mat = state === BLACK ? this.blackMat : this.whiteMat;
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, 0.01);
        this.pieceGroup.add(mesh);
      }
    }
  }



  private updateCameraFrustum(width: number, height: number): void {
    const aspect = width / height;
    const half = FRUSTUM_SIZE / 2;
    if (this.isMirrored) {
      this.camera.left = half * aspect;
      this.camera.right = -half * aspect;
    } else {
      this.camera.left = -half * aspect;
      this.camera.right = half * aspect;
    }
        this.camera.top = half;
    this.camera.bottom = -half;
    this.camera.updateProjectionMatrix();
  }

  private applyFocusZ(): void {
    const zPos = this.focusZ * LAYER_SPACING;
    this.camera.position.set(CENTER, CENTER, zPos + 50);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(CENTER, CENTER, zPos);
    this.gridGroup.position.z = zPos;
    this.renderPieces();
    this.clearAllOverlays();
  }

  setFocusZ(z: number): void {
    this.focusZ = Math.max(0, Math.min(LAYER_COUNT - 1, z));
    this.applyFocusZ();
  }

  cycleAuxMode(): AuxMode {
    this.auxMode = this.auxMode === AuxMode.ALL ? AuxMode.NONE : AuxMode.ALL;
    return this.auxMode;
  }

  setAuxMode(mode: AuxMode): void {
    this.auxMode = mode;
  }

  public toggleMirror(): void {
    this.isMirrored = !this.isMirrored;
    this.resize();
  }

  updateTheme(theme: Theme): void {
    this.theme = theme;
    this.renderer.setClearColor(this.theme.bgColor);
    (this.gridSegments.material as THREE.LineBasicMaterial).color.setHex(this.theme.gridColor);
  }

  render(): void { this.renderer.render(this.scene, this.camera); }

  resize(width?: number, height?: number): void {
    const w = (width ?? this.container.clientWidth) || window.innerWidth * 0.5;
    const h = (height ?? this.container.clientHeight) || window.innerHeight;
    this.updateCameraFrustum(w, h);
    this.renderer.setSize(w, h);
  }
}
