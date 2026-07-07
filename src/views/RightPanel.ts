import * as THREE from "three";
import { type Theme, type CellState, BLACK, WHITE } from "../core/Types";
import type { Line3DData, HighlightPoint3D, AuxData3D } from "../core/Types";
import { Board } from "../core/Board";
import { checkWinner } from "../core/Rules";

const BOARD_SIZE = 13;
const LAYER_COUNT = 6;
const LAYER_SPACING = 2.5;
const CENTER = (BOARD_SIZE - 1) / 2;
const FRUSTUM_SIZE = 14;
const PIECE_RADIUS = 0.42;
const GHOST_OPACITY = 0.35;

const DIRS_2D: [number, number][] = [[1, 0], [0, 1], [1, 1], [1, -1]];

const DIRS_3D: [number, number, number][] = [
  [1, 0, 0], [0, 1, 0], [0, 0, 1],
  [1, 1, 0], [1, -1, 0], [1, 0, 1], [1, 0, -1], [0, 1, 1], [0, 1, -1],
  [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1],
];

const ALLY_COLOR = 0x00FF00;
const ENEMY_COLOR = 0xFF0000;

// ── Grid geometry ──────────────────────────────

function buildLayerGridGeometry(): THREE.BufferGeometry {
  const p: number[] = [];
  for (let y = 0; y < BOARD_SIZE; y++) p.push(0, y, 0, BOARD_SIZE - 1, y, 0);
  for (let x = 0; x < BOARD_SIZE; x++) p.push(x, 0, 0, x, BOARD_SIZE - 1, 0);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  return g;
}

// ── Piece texture ──────────────────────────────

function createPieceTexture(isBlack: boolean, isGhost = false): THREE.CanvasTexture {
  const size = 64, canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const cx = size / 2, cy = size / 2, r = size / 2 - 2;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath();

  if (isGhost) {
    if (isBlack) {
      const g = ctx.createRadialGradient(cx * 0.3 + size * 0.2, cy * 0.3 + size * 0.2, 0, cx, cy, r);
      g.addColorStop(0, "#6699AA"); g.addColorStop(0.5, "#2A3A4A"); g.addColorStop(1, "#1A2A3A");
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = "#88AACC"; ctx.lineWidth = 2.5; ctx.stroke();
    } else {
      const g = ctx.createRadialGradient(cx * 0.3 + size * 0.2, cy * 0.3 + size * 0.2, 0, cx, cy, r);
      g.addColorStop(0, "#F0E8E0"); g.addColorStop(0.5, "#D0C8C0"); g.addColorStop(1, "#A09A95");
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = "#555555"; ctx.lineWidth = 2.5; ctx.stroke();
    }
  } else {
    if (isBlack) {
      const g = ctx.createRadialGradient(cx * 0.3 + size * 0.2, cy * 0.3 + size * 0.2, 0, cx, cy, r);
      g.addColorStop(0, "#6A8A8E"); g.addColorStop(0.5, "#3A4A4E"); g.addColorStop(1, "#1A2A2E");
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = "#1A2A2E"; ctx.lineWidth = 2; ctx.stroke();
    } else {
      const g = ctx.createRadialGradient(cx * 0.3 + size * 0.2, cy * 0.3 + size * 0.2, 0, cx, cy, r);
      g.addColorStop(0, "#FFFFFF"); g.addColorStop(0.5, "#C0D0D0"); g.addColorStop(1, "#90A0A0");
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = "#90A0A0"; ctx.lineWidth = 2; ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas); tex.needsUpdate = true; return tex;
}

function safeWidth(el: HTMLElement): number { return el.clientWidth || window.innerWidth * 0.5; }
function safeHeight(el: HTMLElement): number { return el.clientHeight || window.innerHeight; }

// ── RightPanel ─────────────────────────────────

export class RightPanel {
  public readonly renderer: THREE.WebGLRenderer;
  public readonly board: Board;
  public onPieceChanged: ((board: Board, focusZ: number) => void) | null = null;
  public on3DAuxDataChanged: ((data: AuxData3D) => void) | null = null;

  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private gridGroup: THREE.Group;
  private gridSegments: THREE.LineSegments;
  private centerMarker: THREE.Mesh;
  private pieceGroup: THREE.Group;
  private ghostMesh: THREE.Mesh | null;

  // 2D hover aux lines (single merged geometry with vertexColors)
  private hoverAuxLines2D: THREE.LineSegments;
  // 2D highlight markers (dots at key cells)
  private highlightMarkersGroup: THREE.Group;

  private container: HTMLElement;
  private focusZ: number = 0;
  private currentPlayer: CellState = BLACK;
  private theme: Theme;
  private blackTex: THREE.CanvasTexture;
  private whiteTex: THREE.CanvasTexture;
  private blackGhostTex: THREE.CanvasTexture;
  private whiteGhostTex: THREE.CanvasTexture;
  private hoverValid: boolean = false;
  private hoverX: number = -1;
  private hoverY: number = -1;
  private boundMouseMove: (e: MouseEvent) => void;
  private boundClick: (e: MouseEvent) => void;

  constructor(container: HTMLElement, theme: Theme) {
    this.container = container;
    this.theme = theme;
    this.board = new Board();
    const w = safeWidth(container), h = safeHeight(container);

    this.blackTex = createPieceTexture(true, false);
    this.whiteTex = createPieceTexture(false, false);
    this.blackGhostTex = createPieceTexture(true, true);
    this.whiteGhostTex = createPieceTexture(false, true);

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    this.updateCameraFrustum(w, h);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setClearColor(this.theme.bgColor);
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    const gridGeo = buildLayerGridGeometry();
    this.gridSegments = new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: this.theme.gridColor }));
    this.gridGroup = new THREE.Group();
    this.gridGroup.add(this.gridSegments);

    const markerGeo = new THREE.CircleGeometry(0.15, 16);
    const markerMat = new THREE.MeshBasicMaterial({ color: 0x8b0000, side: THREE.DoubleSide });
    this.centerMarker = new THREE.Mesh(markerGeo, markerMat);
    this.centerMarker.position.set(CENTER, CENTER, 0.01);
    this.gridGroup.add(this.centerMarker);

    this.pieceGroup = new THREE.Group();
    this.gridGroup.add(this.pieceGroup);
    this.ghostMesh = null;

    // 2D hover aux lines (initially empty)
    this.hoverAuxLines2D = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.9,
    }));
    this.gridGroup.add(this.hoverAuxLines2D);

    // 2D highlight markers
    this.highlightMarkersGroup = new THREE.Group();
    this.gridGroup.add(this.highlightMarkersGroup);

    this.scene.add(this.gridGroup);
    this.applyFocusZ();

    this.boundMouseMove = this.handleMouseMove.bind(this);
    this.boundClick = this.handleClick.bind(this);
    this.renderer.domElement.addEventListener("mousemove", this.boundMouseMove);
    this.renderer.domElement.addEventListener("click", this.boundClick);
  }

  // ── Mouse Interaction ────────────────────────

  private handleMouseMove = (e: MouseEvent): void => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    if (w === 0 || h === 0) return;

    const ndcX = ((e.clientX - rect.left) / w) * 2 - 1;
    const ndcY = -((e.clientY - rect.top) / h) * 2 + 1;
    const vec = new THREE.Vector3(ndcX, ndcY, 0.5);
    vec.unproject(this.camera);
    const gx = Math.round(vec.x), gy = Math.round(vec.y);

    if (gx < 0 || gx >= BOARD_SIZE || gy < 0 || gy >= BOARD_SIZE || this.board.get(gx, gy, this.focusZ) !== 0) {
      this.hideGhostPiece();
      this.hoverValid = false;
      this.clearAllOverlays();
      return;
    }

    this.showGhostPiece(gx, gy);
    this.hoverValid = true;
    this.hoverX = gx;
    this.hoverY = gy;
    this.computeHoverOverlays(gx, gy);
  };

  private clearAllOverlays(): void {
    // 2D lines
    this.hoverAuxLines2D.geometry.dispose();
    this.hoverAuxLines2D.geometry = new THREE.BufferGeometry();
    // 2D markers
    this.clearHighlightMarkers();
    // 3D data
    if (this.on3DAuxDataChanged) this.on3DAuxDataChanged({ lines: [], points: [] });
  }

  // ── Highlight markers (2D) ───────────────────

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
    mesh.position.set(x, y, 0.04);
    this.highlightMarkersGroup.add(mesh);
  }

  // ── Core overlay computation ────────────────

  private computeHoverOverlays(hx: number, hy: number): void {
    const z = this.focusZ;
    const pos2D: number[] = [];
    const col2D: number[] = [];
    const lines3D: Line3DData[] = [];
    const pts3D: HighlightPoint3D[] = [];

    this.clearHighlightMarkers();

    // ── 4 2D directions ───────────────────────────
    for (const [dx, dy] of DIRS_2D) {
      // Positive side
      this.scanDirection2D(hx, hy, dx, dy, z, pos2D, col2D, pts3D);
      // Negative side
      this.scanDirection2D(hx, hy, -dx, -dy, z, pos2D, col2D, pts3D);
    }

    // ── 13 3D directions ─────────────────────────
    for (const [dx, dy, dz] of DIRS_3D) {
      this.scanDirection3D(hx, hy, z, dx, dy, dz, lines3D, pts3D);
      this.scanDirection3D(hx, hy, z, -dx, -dy, -dz, lines3D, pts3D);
    }

    // ── Update 2D LineSegments (vertexColors) ────
    this.hoverAuxLines2D.geometry.dispose();
    if (pos2D.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos2D, 3));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(col2D, 3));
      this.hoverAuxLines2D.geometry = geo;
    } else {
      this.hoverAuxLines2D.geometry = new THREE.BufferGeometry();
    }

    // ── Send 3D data to LeftPanel ─────────────────
    if (this.on3DAuxDataChanged) {
      this.on3DAuxDataChanged({ lines: lines3D, points: pts3D });
    }
  }

  /** Scan a single 2D direction and append vertex & colour data. */
  private scanDirection2D(
    hx: number, hy: number, dx: number, dy: number, z: number,
    pos2D: number[], col2D: number[], pts3D: HighlightPoint3D[],
  ): void {
    let step = 1;
    while (true) {
      const px = hx + dx * step, py = hy + dy * step;
      if (px < 0 || px >= BOARD_SIZE || py < 0 || py >= BOARD_SIZE) break;
      const s = this.board.get(px, py, z);
      if (s === 0) {
        // Empty: draw green segment and stop
        pos2D.push(hx, hy, 0.03, px, py, 0.03);
        for (let i = 0; i < 2; i++) {
          const r = ((ALLY_COLOR >> 16) & 0xff) / 255;
          const g = ((ALLY_COLOR >> 8) & 0xff) / 255;
          const b = (ALLY_COLOR & 0xff) / 255;
          col2D.push(r, g, b);
        }
        this.addHighlightMarker(px, py, ALLY_COLOR);
        pts3D.push({ x: px, y: py, z: z * LAYER_SPACING, color: ALLY_COLOR });
        break;
      }
      const color = s === this.currentPlayer ? ALLY_COLOR : ENEMY_COLOR;
      pos2D.push(hx, hy, 0.03, px, py, 0.03);
      for (let i = 0; i < 2; i++) {
        const r = ((color >> 16) & 0xff) / 255;
        const g = ((color >> 8) & 0xff) / 255;
        const b = (color & 0xff) / 255;
        col2D.push(r, g, b);
      }
      if (s !== this.currentPlayer) {
        // Enemy: add marker and stop
        this.addHighlightMarker(px, py, color);
        pts3D.push({ x: px, y: py, z: z * LAYER_SPACING, color });
        break;
      }
      // Ally: continue scanning
      step++;
    }
  }

  /** Scan a single 3D direction and append line & point data. */
  private scanDirection3D(
    hx: number, hy: number, hz: number,
    dx: number, dy: number, dz: number,
    lines3D: Line3DData[], pts3D: HighlightPoint3D[],
  ): void {
    let step = 1;
    while (true) {
      const px = hx + dx * step, py = hy + dy * step, pz = hz + dz * step;
      if (px < 0 || px >= BOARD_SIZE || py < 0 || py >= BOARD_SIZE || pz < 0 || pz >= LAYER_COUNT) break;
      const s = this.board.get(px, py, pz);
      if (s === 0) {
        const color = ALLY_COLOR;
        lines3D.push({
          startX: hx, startY: hy, startZ: hz * LAYER_SPACING,
          endX: px, endY: py, endZ: pz * LAYER_SPACING,
          color,
        });
        pts3D.push({ x: px, y: py, z: pz * LAYER_SPACING, color });
        break;
      }
      const color = s === this.currentPlayer ? ALLY_COLOR : ENEMY_COLOR;
      lines3D.push({
        startX: hx, startY: hy, startZ: hz * LAYER_SPACING,
        endX: px, endY: py, endZ: pz * LAYER_SPACING,
        color,
      });
      if (s !== this.currentPlayer) {
        pts3D.push({ x: px, y: py, z: pz * LAYER_SPACING, color });
        break;
      }
      step++;
    }
  }

  // ── Ghost piece ──────────────────────────────

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

  // ── Click ────────────────────────────────────

  private handleClick = (): void => {
    if (!this.hoverValid) return;
    const gx = this.hoverX, gy = this.hoverY;
    if (gx < 0 || gx >= BOARD_SIZE || gy < 0 || gy >= BOARD_SIZE || this.board.get(gx, gy, this.focusZ) !== 0) return;

    console.log(`[Click] Current player before move: ${this.currentPlayer === BLACK ? "BLACK" : "WHITE"}`);
    this.board.set(gx, gy, this.focusZ, this.currentPlayer);
    const actualState = this.board.get(gx, gy, this.focusZ);
    console.log(`[Board] State at (${gx},${gy},${this.focusZ}) is now: ${actualState} (${actualState === BLACK ? "BLACK" : actualState === WHITE ? "WHITE" : "EMPTY"})`);

    this.renderPieces();
    if (this.onPieceChanged) this.onPieceChanged(this.board, this.focusZ);

    const winner = checkWinner(this.board, gx, gy, this.focusZ);
    console.log(`[Rules] checkWinner returned: ${winner} (${winner === BLACK ? "BLACK" : winner === WHITE ? "WHITE" : "NONE"})`);

    if (winner !== 0) {
      console.log(`[Win] ${winner === BLACK ? "BLACK" : "WHITE"} wins!`);
      setTimeout(() => {
        alert(winner === BLACK ? "黑方胜利" : "白方胜利");
        this.board.reset();
        this.renderPieces();
        if (this.onPieceChanged) this.onPieceChanged(this.board, this.focusZ);
        if (this.on3DAuxDataChanged) this.on3DAuxDataChanged({ lines: [], points: [] });
      }, 50);
    }

    this.currentPlayer = this.currentPlayer === BLACK ? WHITE : BLACK;
    console.log(`[Click] Player switched to: ${this.currentPlayer === BLACK ? "BLACK" : "WHITE"}`);
    this.clearAllOverlays();

    const rect = this.renderer.domElement.getBoundingClientRect();
    const midX = rect.left + rect.width / 2, midY = rect.top + rect.height / 2;
    this.handleMouseMove(new MouseEvent("mousemove", { clientX: midX, clientY: midY }));
  };

  // ── Render pieces ────────────────────────────

  private renderPieces(): void {
    while (this.pieceGroup.children.length > 0) {
      const c = this.pieceGroup.children[0];
      if (c instanceof THREE.Mesh) { c.geometry.dispose(); if (c.material instanceof THREE.Material) c.material.dispose(); }
      this.pieceGroup.remove(c);
    }
    this.ghostMesh = null;

    const geo = new THREE.CircleGeometry(PIECE_RADIUS, 24);
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const state = this.board.get(x, y, this.focusZ);
        if (state === 0) continue;
        const mat = new THREE.MeshBasicMaterial({
          map: state === BLACK ? this.blackTex : this.whiteTex,
          transparent: true, side: THREE.DoubleSide, depthWrite: false, depthTest: true,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, 0.01);
        this.pieceGroup.add(mesh);
      }
    }
  }

  // ── Internal ─────────────────────────────────

  private updateCameraFrustum(width: number, height: number): void {
    const aspect = width / height;
    const half = FRUSTUM_SIZE / 2;
    this.camera.left = -half * aspect;
    this.camera.right = half * aspect;
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