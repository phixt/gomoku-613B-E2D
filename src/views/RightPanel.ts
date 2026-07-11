import * as THREE from "three";
import { type Theme, type CellState, BLACK, WHITE, AuxMode, LIGHT_THEME, DARK_THEME } from "../core/Types";
import type { Line3DData, HighlightPoint3D, AuxData3D } from "../core/Types";
import { Board } from "../core/Board";
import { checkWinner } from "../core/Rules";
import { DIRECTIONS_3D } from "../utils/MathUtils";
import { BOARD_SIZE, LAYER_COUNT, DEFAULT_LAYER_SPACING, HOVER_PIECE_OPACITY, COLOR_SELF_NORMAL, COLOR_ENEMY_NORMAL, COLOR_SELF_BLIND, COLOR_ENEMY_BLIND, COLOR_AUX_RED, COLOR_AUX_BLUE } from "../core/Config";
import { eventBus, Events } from "../core/EventBus";
import { resourceManager } from "../utils/ResourceManager";

const LAYER_SPACING = DEFAULT_LAYER_SPACING;
const CENTER = (BOARD_SIZE - 1) / 2;
const GHOST_OPACITY = HOVER_PIECE_OPACITY;

const DIRS_2D: [number, number][] = [[1, 0], [0, 1], [1, 1], [1, -1]];


function buildLayerGridGeometry(): THREE.BufferGeometry {
  const p: number[] = [];
  for (let y = 0; y < BOARD_SIZE; y++) p.push(0, y, 0, BOARD_SIZE - 1, y, 0);
  for (let x = 0; x < BOARD_SIZE; x++) p.push(x, 0, 0, x, BOARD_SIZE - 1, 0);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  return g;
}


function createPieceTexture(isBlack: boolean, isGhost = false): THREE.CanvasTexture {
  const size = 64,canvas = document.createElement("canvas");
  canvas.width = size;canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const cx = size / 2,cy = size / 2,r = size / 2 - 2;
  ctx.beginPath();ctx.arc(cx, cy, r, 0, Math.PI * 2);ctx.closePath();

  if (isGhost) {
    if (isBlack) {
      const g = ctx.createRadialGradient(cx * 0.3 + size * 0.2, cy * 0.3 + size * 0.2, 0, cx, cy, r);
      g.addColorStop(0, "#444444");g.addColorStop(0.5, "#222222");g.addColorStop(1, "#000000");
      ctx.fillStyle = g;ctx.fill();ctx.strokeStyle = "#000000";ctx.lineWidth = 2.5;ctx.stroke();
    } else {
      const g = ctx.createRadialGradient(cx * 0.3 + size * 0.2, cy * 0.3 + size * 0.2, 0, cx, cy, r);
      g.addColorStop(0, "#F0E8E0");g.addColorStop(0.5, "#D0C8C0");g.addColorStop(1, "#A09A95");
      ctx.fillStyle = g;ctx.fill();ctx.strokeStyle = "#555555";ctx.lineWidth = 2.5;ctx.stroke();
    }
  } else {
    if (isBlack) {
      const g = ctx.createRadialGradient(cx * 0.3 + size * 0.2, cy * 0.3 + size * 0.2, 0, cx, cy, r);
      g.addColorStop(0, "#444444");g.addColorStop(0.5, "#000000");g.addColorStop(1, "#000000");
      ctx.fillStyle = g;ctx.fill();ctx.strokeStyle = "#111111";ctx.lineWidth = 2;ctx.stroke();
    } else {
      const g = ctx.createRadialGradient(cx * 0.3 + size * 0.2, cy * 0.3 + size * 0.2, 0, cx, cy, r);
      g.addColorStop(0, "#FFFFFF");g.addColorStop(0.5, "#C0D0D0");g.addColorStop(1, "#90A0A0");
      ctx.fillStyle = g;ctx.fill();ctx.strokeStyle = "#90A0A0";ctx.lineWidth = 2;ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);tex.needsUpdate = true;return tex;
}


export class RightPanel {
  public static readonly BOARD_SIZE = 13;
  public static readonly GRID_PADDING = 0.5;

  public readonly renderer: THREE.WebGLRenderer;
  public readonly board: Board;
  public onPieceChanged: ((board: Board, focusZ: number) => void) | null = null;
  public on3DAuxDataChanged: ((data: AuxData3D) => void) | null = null;
  public onHoverChanged: ((x: number, y: number, z: number) => void) | null = null;
  public onPiecePlaced: ((x: number, y: number, z: number, player: number) => void) | null = null;
  public onGameWonCallback: ((winner: 1 | 2) => void) | null = null;

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
  private _currentPlayer: CellState = BLACK;
  public get currentPlayer(): CellState {return this._currentPlayer;}
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
  private isColorblindMode: boolean = false;
  private starMat!: THREE.MeshBasicMaterial;
  private lastMove: { x: number; y: number; z: number } | null = null;
  private lastMoveRing: THREE.Mesh;
  private _hoverWorldPos: THREE.Vector3 | null = null;
  private isGameActive: () => boolean = () => true;
  private isMyTurn: () => boolean = () => true;
  private isMirrored: boolean = true;
  private boundMouseMove: (e: MouseEvent) => void;
  private boundClick: (e: MouseEvent) => void;
  private boundResize: () => void;

  private getSelfColor(): number {
    return this.isColorblindMode ? COLOR_SELF_BLIND : COLOR_SELF_NORMAL;
  }

  private getEnemyColor(): number {
    return this.isColorblindMode ? COLOR_ENEMY_BLIND : COLOR_ENEMY_NORMAL;
  }

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
    const starOffset = Math.max(1, Math.floor(BOARD_SIZE / 5));
    const starPositions = [
    { x: CENTER, y: CENTER },
    { x: starOffset, y: starOffset },
    { x: starOffset, y: BOARD_SIZE - 1 - starOffset },
    { x: BOARD_SIZE - 1 - starOffset, y: starOffset },
    { x: BOARD_SIZE - 1 - starOffset, y: BOARD_SIZE - 1 - starOffset }];

    const starGeo = new THREE.CircleGeometry(0.12, 32);
    this.starMat = new THREE.MeshBasicMaterial({
      color: COLOR_AUX_RED,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      depthTest: true
    });
    starPositions.forEach((p) => {
      const m = new THREE.Mesh(starGeo, this.starMat);
      m.position.set(p.x, p.y, 0.1);
      m.renderOrder = 999;
      this.gridGroup.add(m);
    });
    // Last-move highlight ring
    const ringGeo = new THREE.RingGeometry(0.45, 0.55, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xFF0000,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false
    });
    this.lastMoveRing = new THREE.Mesh(ringGeo, ringMat);
    this.lastMoveRing.visible = false;
    this.lastMoveRing.renderOrder = 998;
    this.scene.add(this.lastMoveRing);

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

    this.boundResize = (): void => {this.resize();};
    window.addEventListener("resize", this.boundResize);

    this.boundMouseMove = (e: MouseEvent): void => this.handleMouseMove(e);
    this.boundClick = (): void => this.handleClick();
    this.renderer.domElement.addEventListener("mousemove", this.boundMouseMove);
    this.renderer.domElement.addEventListener("click", this.boundClick);

    requestAnimationFrame(() => {requestAnimationFrame(() => {this.resize();});});

    // Subscribe to events
    eventBus.on(Events.THEME_TOGGLED, (isDark: boolean) => this.applyTheme(isDark));
    eventBus.on(Events.LAYER_CHANGED, (z: number) => this.setFocusZ(z));
    eventBus.on(Events.GAME_RESET, () => {this._currentPlayer = 1;this.lastMove = null;this.renderPieces();});
    eventBus.on(Events.COLORBLIND_MODE_TOGGLED, (isBlind: boolean) => {
      this.isColorblindMode = isBlind;
      this.starMat.color.setHex(isBlind ? COLOR_AUX_BLUE : COLOR_AUX_RED);
      (this.lastMoveRing.material as THREE.MeshBasicMaterial).color.setHex(isBlind ? 0xFFCC00 : 0xFF0000);
      if (this.hoverX >= 0) this.computeHoverOverlays(this.hoverX, this.hoverY);
    });
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
    const w = rect.width || 1,h = rect.height || 1;
    const ndcX = (e.clientX - rect.left) / w * 2 - 1;
    const ndcY = -((e.clientY - rect.top) / h) * 2 + 1;
    const vec = new THREE.Vector3(ndcX, ndcY, 0.5);
    vec.unproject(this.camera);
    const gx = Math.round(vec.x),gy = Math.round(vec.y);

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

  resetGame(): void {
    this.board.reset();
    this._currentPlayer = BLACK;
    this.lastMove = null;
    this.setFocusZ(0);
  }

  public updateLastMoveUI(x: number, y: number, z: number): void {
    // Boundary check: reject out-of-range coordinates
    if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE || z < 0 || z >= LAYER_COUNT) return;
    this.lastMove = { x, y, z };
    this.renderPieces();
  }


  /** Place a piece for the AI opponent. */
  public placeAIPiece(x: number, y: number, z: number): void {
    if (this.board.get(x, y, z) !== 0) return;
    this.board.set(x, y, z, this._currentPlayer);
    this.lastMove = { x, y, z };
    this.renderPieces();
    if (this.onPieceChanged) this.onPieceChanged(this.board, this.focusZ);

    const winner = checkWinner(this.board, x, y, z);
    if (winner !== 0) {
      if (this.onGameWonCallback) this.onGameWonCallback(winner as 1 | 2);
      return;
    }

    if (this.onPiecePlaced) this.onPiecePlaced(x, y, z, this._currentPlayer);
    this._currentPlayer = this._currentPlayer === BLACK ? WHITE : BLACK;
    this.clearAllOverlays();
  }
  getCurrentPlayer(): CellState {return this.currentPlayer;}

  setCurrentPlayer(state: CellState): void {
    if (state === 1 || state === 2) {this._currentPlayer = state;}
  }

  /** Capture a full 3D board snapshot for serialization. */
  getBoardSnapshot(): number[][][] {
    const snapshot: number[][][] = [];
    for (let z = 0; z < LAYER_COUNT; z++) {
      const layer: number[][] = [];
      for (let y = 0; y < BOARD_SIZE; y++) {
        const row: number[] = [];
        for (let x = 0; x < BOARD_SIZE; x++) {
          row.push(this.board.get(x, y, z));
        }
        layer.push(row);
      }
      snapshot.push(layer);
    }
    return snapshot;
  }

  /** Instantly load a board snapshot for save-file restoration. */
  loadBoardSnapshot(snapshot: number[][][]): void {
    this.board.reset();
    this.lastMove = null;
    for (let z = 0; z < Math.min(snapshot.length, LAYER_COUNT); z++) {
      for (let y = 0; y < Math.min(snapshot[z]?.length ?? 0, BOARD_SIZE); y++) {
        for (let x = 0; x < Math.min(snapshot[z][y]?.length ?? 0, BOARD_SIZE); x++) {
          const val = snapshot[z][y][x] as 0 | 1 | 2;
          if (val !== 0) this.board.set(x, y, z, val);
        }
      }
    }
    this.renderPieces();
  }


  private clearHighlightMarkers(): void {
    while (this.highlightMarkersGroup.children.length > 0) {
      const c = this.highlightMarkersGroup.children[0];
      if (c instanceof THREE.Mesh) {c.geometry.dispose();if (c.material instanceof THREE.Material) c.material.dispose();}
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








  private scanDirection2D(
  hx: number, hy: number, dx: number, dy: number, z: number,
  pos2D: number[], col2D: number[], pts3D: HighlightPoint3D[])
  : void {

    const maxSteps = 4;
    let firstStep = 1;
    while (true) {
      const px = hx + dx * firstStep,py = hy + dy * firstStep;
      if (px < 0 || px >= BOARD_SIZE || py < 0 || py >= BOARD_SIZE) return;
      if (firstStep > maxSteps) return; // exceeded search range
      const s = this.board.get(px, py, z);
      if (s !== 0) break;
      firstStep++;
    }


    let step = firstStep;
    let prevX = hx,prevY = hy;
    while (true) {
      if (step > maxSteps) break; // exceeded search range
      const px = hx + dx * step,py = hy + dy * step;
      if (px < 0 || px >= BOARD_SIZE || py < 0 || py >= BOARD_SIZE) break;
      const s = this.board.get(px, py, z);

      const isAlly = s === this.currentPlayer;
      const color = s === 0 ? this.getSelfColor() : isAlly ? this.getSelfColor() : this.getEnemyColor();


      if (s !== 0) {
        // Enemy lines at Z=0.03 (top), ally lines at Z=0.02
        const lineZ = z * LAYER_SPACING + (isAlly ? 0.02 : 0.03);
        pos2D.push(prevX, prevY, lineZ, px, py, lineZ);
        for (let i = 0; i < 2; i++) {
          const r = (color >> 16 & 0xff) / 255;
          const g = (color >> 8 & 0xff) / 255;
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


      prevX = px;prevY = py;
      step++;
    }
    // Marker at last valid piece when maxSteps terminated the loop
    if (prevX !== hx || prevY !== hy) {
      this.addHighlightMarker(prevX, prevY, this.getSelfColor());
      pts3D.push({ x: prevX, y: prevY, z: z, color: this.getSelfColor() }); // logical Z index;
    }
  }






  private scanDirection3D(
  hx: number, hy: number, hz: number,
  dx: number, dy: number, dz: number,
  lines3D: Line3DData[], pts3D: HighlightPoint3D[])
  : void {

    const maxSteps = 4;
    let firstStep = 1;
    while (true) {
      const px = hx + dx * firstStep,py = hy + dy * firstStep,pz = hz + dz * firstStep;
      if (px < 0 || px >= BOARD_SIZE || py < 0 || py >= BOARD_SIZE || pz < 0 || pz >= LAYER_COUNT) return;
      if (firstStep > maxSteps) return; // exceeded search range
      const s = this.board.get(px, py, pz);
      if (s !== 0) break;
      firstStep++;
    }


    let step = firstStep;
    let prevX = hx,prevY = hy,prevZ = hz;
    while (true) {
      if (step > maxSteps) break; // exceeded search range
      const px = hx + dx * step,py = hy + dy * step,pz = hz + dz * step;
      if (px < 0 || px >= BOARD_SIZE || py < 0 || py >= BOARD_SIZE || pz < 0 || pz >= LAYER_COUNT) break;
      const s = this.board.get(px, py, pz);

      const isAlly = s === this.currentPlayer;
      const color = s === 0 ? this.getSelfColor() : isAlly ? this.getSelfColor() : this.getEnemyColor();

      if (s !== 0) {
        lines3D.push({
          startX: prevX, startY: prevY, startZ: prevZ, // logical Z index
          endX: px, endY: py, endZ: pz, // logical Z index
          color
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

      prevX = px;prevY = py;prevZ = pz;
      step++;
    }
    // Green marker at last valid piece when maxSteps terminated the loop
    if (prevX !== hx || prevY !== hy || prevZ !== hz) {
      pts3D.push({ x: prevX, y: prevY, z: prevZ, color: this.getSelfColor() }); // logical Z index
    }
  }



  private hideGhostPiece(): void {if (this.ghostMesh) this.ghostMesh.visible = false;}

  private showGhostPiece(gx: number, gy: number): void {
    const isBlack = this.currentPlayer === BLACK;
    if (!this.ghostMesh) {
      const geo = resourceManager.getGeometry("piece");
      const mat = new THREE.MeshBasicMaterial({
        map: isBlack ? this.blackGhostTex : this.whiteGhostTex,
        transparent: true, opacity: GHOST_OPACITY, side: THREE.DoubleSide, depthWrite: false
      });
      this.ghostMesh = new THREE.Mesh(geo, mat);
      this.pieceGroup.add(this.ghostMesh);
    }
    const mat = this.ghostMesh.material as THREE.MeshBasicMaterial;
    const neededTex = isBlack ? this.blackGhostTex : this.whiteGhostTex;
    if (mat.map !== neededTex) {mat.map = neededTex;mat.needsUpdate = true;}
    this.ghostMesh.position.set(gx, gy, 0.01);
    this.ghostMesh.visible = true;
  }



  private handleClick = (): void => {
    if (!this.isGameActive()) return;
    if (!this.isMyTurn()) return;
    if (!this.hoverValid) return;
    const gx = this.hoverX,gy = this.hoverY;
    if (gx < 0 || gx >= BOARD_SIZE || gy < 0 || gy >= BOARD_SIZE || this.board.get(gx, gy, this.focusZ) !== 0) return;
    this.board.set(gx, gy, this.focusZ, this._currentPlayer);
    this.lastMove = { x: gx, y: gy, z: this.focusZ };
    const actualState = this.board.get(gx, gy, this.focusZ);
    console.log(`[Board] State at (${gx},${gy},${this.focusZ}) is now: ${actualState} (${actualState === BLACK ? "BLACK" : actualState === WHITE ? "WHITE" : "EMPTY"})`);

    this.renderPieces();
    if (this.onPieceChanged) this.onPieceChanged(this.board, this.focusZ);

    const winner = checkWinner(this.board, gx, gy, this.focusZ);
    console.log(`[Rules] checkWinner returned: ${winner} (${winner === BLACK ? "BLACK" : winner === WHITE ? "WHITE" : "NONE"})`);

    if (winner !== 0) {
      if (this.onGameWonCallback) this.onGameWonCallback(winner as 1 | 2);
      return;
    }

    if (this.onPiecePlaced) this.onPiecePlaced(gx, gy, this.focusZ, this._currentPlayer);
    this._currentPlayer = this._currentPlayer === BLACK ? WHITE : BLACK;
    this.clearAllOverlays();

    const rect = this.renderer.domElement.getBoundingClientRect();
    const midX = rect.left + rect.width / 2,midY = rect.top + rect.height / 2;
    this.handleMouseMove(new MouseEvent("mousemove", { clientX: midX, clientY: midY }));
  };



  private renderPieces(): void {
    this.pieceGroup.clear();
    this.ghostMesh = null;

    const geo = resourceManager.getGeometry("piece");
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

    // Show last-move highlight if on the current layer (bounds-safe)
    if (this.lastMove && this.lastMove.z === this.focusZ
        && this.lastMove.x >= 0 && this.lastMove.x < BOARD_SIZE
        && this.lastMove.y >= 0 && this.lastMove.y < BOARD_SIZE) {
      this.lastMoveRing.position.set(this.lastMove.x, this.lastMove.y, 0.02);
      this.lastMoveRing.visible = true;
    } else {
      this.lastMoveRing.visible = false;
    }
  }

  /** Public refresh - re-renders pieces without exposing renderPieces directly */
  public refresh(): void {
    this.renderPieces();
  }private applyFocusZ(): void {
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

  public setGameActiveCallback(cb: () => boolean): void {
    this.isGameActive = cb;
  }

  public setTurnCallback(cb: () => boolean): void {
    this.isMyTurn = cb;
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

  applyTheme(isDark: boolean): void {
    const theme = isDark ? DARK_THEME : LIGHT_THEME;
    this.updateTheme(theme);
  }

  render(): void {this.renderer.render(this.scene, this.camera);}

  resize(width?: number, height?: number): void {
    const containerWidth = width ?? this.container.clientWidth;
    const containerHeight = height ?? this.container.clientHeight;

    this.renderer.setSize(containerWidth, containerHeight);


    const boardWorldSize = RightPanel.BOARD_SIZE - 1; // 12


    const totalSize = boardWorldSize + RightPanel.GRID_PADDING * 2;

    const aspect = containerWidth / containerHeight;

    let frustumHalfWidth: number;
    let frustumHalfHeight: number;

    if (aspect > 1) {

      frustumHalfHeight = totalSize / 2;
      frustumHalfWidth = frustumHalfHeight * aspect;
    } else {

      frustumHalfWidth = totalSize / 2;
      frustumHalfHeight = frustumHalfWidth / aspect;
    }


    if (this.isMirrored) {
      this.camera.left = frustumHalfWidth;
      this.camera.right = -frustumHalfWidth;
    } else {
      this.camera.left = -frustumHalfWidth;
      this.camera.right = frustumHalfWidth;
    }

    this.camera.top = frustumHalfHeight;
    this.camera.bottom = -frustumHalfHeight;

    this.camera.updateProjectionMatrix();
  }
}