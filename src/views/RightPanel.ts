import * as THREE from "three";
import { type Theme, type CellState } from "../core/Types";
import { Board } from "../core/Board";
import { checkPatterns, type Pattern } from "../core/Rules";

const BOARD_SIZE = 13;
const LAYER_COUNT = 6;
const LAYER_SPACING = 2.5;
const CENTER = (BOARD_SIZE - 1) / 2;
const FRUSTUM_SIZE = 14;
const PIECE_RADIUS = 0.42;
const GHOST_OPACITY = 0.35;

function buildLayerGridGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  for (let y = 0; y < BOARD_SIZE; y++) {
    positions.push(0, y, 0, BOARD_SIZE - 1, y, 0);
  }
  for (let x = 0; x < BOARD_SIZE; x++) {
    positions.push(x, 0, 0, x, BOARD_SIZE - 1, 0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

function createPieceTexture(isBlack: boolean): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 2;

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();

  if (isBlack) {
    // Dark piece: deep teal-grey with teal highlight
    const g = ctx.createRadialGradient(cx * 0.3 + size * 0.2, cy * 0.3 + size * 0.2, 0, cx, cy, r);
    g.addColorStop(0, "#6A8A8E");
    g.addColorStop(0.5, "#3A4A4E");
    g.addColorStop(1, "#1A2A2E");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = "#1A2A2E";
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    // Light piece: pearl grey with pure-white highlight
    const g = ctx.createRadialGradient(cx * 0.3 + size * 0.2, cy * 0.3 + size * 0.2, 0, cx, cy, r);
    g.addColorStop(0, "#FFFFFF");
    g.addColorStop(0.5, "#C0D0D0");
    g.addColorStop(1, "#90A0A0");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = "#90A0A0";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function safeWidth(el: HTMLElement): number {
  return el.clientWidth || window.innerWidth * 0.5;
}

function safeHeight(el: HTMLElement): number {
  return el.clientHeight || window.innerHeight;
}

export class RightPanel {
  public readonly renderer: THREE.WebGLRenderer;
  public readonly board: Board;
  /** Callback fired after a piece is placed or the board changes */
  public onPieceChanged: ((board: Board, focusZ: number) => void) | null = null;

  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private gridGroup: THREE.Group;
  private gridSegments: THREE.LineSegments;
  private centerMarker: THREE.Mesh;
  private pieceGroup: THREE.Group;
  private warningGroup: THREE.Group;
  private ghostMesh: THREE.Mesh | null;
  private container: HTMLElement;
  private focusZ: number = 0;
  private currentPlayer: CellState = 1;
  private theme: Theme;
  private blackTex: THREE.CanvasTexture;
  private whiteTex: THREE.CanvasTexture;
  private hoverValid: boolean = false;
  private hoverX: number = -1;
  private hoverY: number = -1;
  private boundMouseMove: (e: MouseEvent) => void;
  private boundClick: (e: MouseEvent) => void;

  constructor(container: HTMLElement, theme: Theme) {
    this.container = container;
    this.theme = theme;
    this.board = new Board();
    const w = safeWidth(container);
    const h = safeHeight(container);

    this.blackTex = createPieceTexture(true);
    this.whiteTex = createPieceTexture(false);

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    this.updateCameraFrustum(w, h);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setClearColor(this.theme.bgColor);
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    const gridGeo = buildLayerGridGeometry();
    const gridMat = new THREE.LineBasicMaterial({ color: this.theme.gridColor });
    this.gridSegments = new THREE.LineSegments(gridGeo, gridMat);

    this.gridGroup = new THREE.Group();
    this.gridGroup.add(this.gridSegments);

    const markerGeo = new THREE.CircleGeometry(0.15, 16);
    const markerMat = new THREE.MeshBasicMaterial({ color: 0x8b0000, side: THREE.DoubleSide });
    this.centerMarker = new THREE.Mesh(markerGeo, markerMat);
    this.centerMarker.position.set(CENTER, CENTER, 0.01);
    this.gridGroup.add(this.centerMarker);

    this.pieceGroup = new THREE.Group();
    this.gridGroup.add(this.pieceGroup);

    this.warningGroup = new THREE.Group();
    this.gridGroup.add(this.warningGroup);

    this.ghostMesh = null;

    this.scene.add(this.gridGroup);
    this.applyFocusZ();

    this.boundMouseMove = this.handleMouseMove.bind(this);
    this.boundClick = this.handleClick.bind(this);
    this.renderer.domElement.addEventListener("mousemove", this.boundMouseMove);
    this.renderer.domElement.addEventListener("click", this.boundClick);
  }

  // ──────────────────────────────────────────────
  //  Mouse Interaction
  // ──────────────────────────────────────────────

  private handleMouseMove = (e: MouseEvent): void => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    if (width === 0 || height === 0) return;

    const ndcX = ((e.clientX - rect.left) / width) * 2 - 1;
    const ndcY = -((e.clientY - rect.top) / height) * 2 + 1;

    const vector = new THREE.Vector3(ndcX, ndcY, 0.5);
    vector.unproject(this.camera);

    const gx = Math.round(vector.x);
    const gy = Math.round(vector.y);

    if (gx < 0 || gx >= BOARD_SIZE || gy < 0 || gy >= BOARD_SIZE) {
      this.hideGhostPiece();
      this.hoverValid = false;
      return;
    }

    if (this.board.get(gx, gy, this.focusZ) !== 0) {
      this.hideGhostPiece();
      this.hoverValid = false;
      return;
    }

    this.showGhostPiece(gx, gy);
    this.hoverValid = true;
    this.hoverX = gx;
    this.hoverY = gy;
  };

  private handleClick = (): void => {
    if (!this.hoverValid) return;
    const gx = this.hoverX;
    const gy = this.hoverY;

    if (gx < 0 || gx >= BOARD_SIZE || gy < 0 || gy >= BOARD_SIZE || this.board.get(gx, gy, this.focusZ) !== 0) {
      return;
    }

    this.board.set(gx, gy, this.focusZ, this.currentPlayer);
    this.renderPieces();

    // Notify the left panel (and anyone else listening)
    if (this.onPieceChanged) {
      this.onPieceChanged(this.board, this.focusZ);
    }

    const patterns = checkPatterns(this.board, gx, gy, this.focusZ);
    this.renderWarnings(patterns);

    const win = patterns.some((p) => p.count >= 5);
    if (win) {
      setTimeout(() => {
        alert(`${this.currentPlayer === 1 ? "Black" : "White"} wins!`);
        this.board.reset();
        this.renderPieces();
        if (this.onPieceChanged) {
          this.onPieceChanged(this.board, this.focusZ);
        }
        this.renderWarnings([]);
      }, 50);
    }

    this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;

    const rect = this.renderer.domElement.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    const midY = rect.top + rect.height / 2;
    this.handleMouseMove(new MouseEvent("mousemove", { clientX: midX, clientY: midY }));
  };

  // ──────────────────────────────────────────────
  //  Ghost Piece (hover preview)
  // ──────────────────────────────────────────────

  private hideGhostPiece(): void {
    if (this.ghostMesh) {
      this.ghostMesh.visible = false;
    }
  }

  private showGhostPiece(gx: number, gy: number): void {
    if (!this.ghostMesh) {
      const geo = new THREE.CircleGeometry(PIECE_RADIUS, 24);
      const mat = new THREE.MeshBasicMaterial({
        map: this.currentPlayer === 1 ? this.blackTex : this.whiteTex,
        transparent: true,
        opacity: GHOST_OPACITY,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      this.ghostMesh = new THREE.Mesh(geo, mat);
      this.pieceGroup.add(this.ghostMesh);
    }

    const mat = this.ghostMesh.material as THREE.MeshBasicMaterial;
    const neededTex = this.currentPlayer === 1 ? this.blackTex : this.whiteTex;
    if (mat.map !== neededTex) {
      mat.map = neededTex;
      mat.needsUpdate = true;
    }

    this.ghostMesh.position.set(gx, gy, 0.01);
    this.ghostMesh.visible = true;
  }

  // ──────────────────────────────────────────────
  //  Rendering
  // ──────────────────────────────────────────────

  private renderPieces(): void {
    while (this.pieceGroup.children.length > 0) {
      const c = this.pieceGroup.children[0];
      if (c instanceof THREE.Mesh) {
        c.geometry.dispose();
        if (c.material instanceof THREE.Material) {
          c.material.dispose();
        }
      }
      this.pieceGroup.remove(c);
    }
    this.ghostMesh = null;

    const geo = new THREE.CircleGeometry(PIECE_RADIUS, 24);
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const state = this.board.get(x, y, this.focusZ);
        if (state === 0) continue;
        const mat = new THREE.MeshBasicMaterial({
          map: state === 1 ? this.blackTex : this.whiteTex,
          transparent: true,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, 0.01);
        this.pieceGroup.add(mesh);
      }
    }
  }

  private renderWarnings(patterns: Pattern[]): void {
    while (this.warningGroup.children.length > 0) {
      const c = this.warningGroup.children[0];
      if (c instanceof THREE.Mesh) {
        c.geometry.dispose();
        if (c.material instanceof THREE.Material) {
          c.material.dispose();
        }
      }
      this.warningGroup.remove(c);
    }

    for (const pattern of patterns) {
      if (pattern.count < 3) continue;

      const alive = pattern.openEnds >= 2;
      const color = alive ? 0x66ffaa : 0x666666;
      const radius = alive ? 0.15 : 0.08;
      const opacity = alive ? 0.8 : 0.35;

      for (const cell of pattern.cells) {
        const geo = new THREE.CircleGeometry(radius, 12);
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(cell.x, cell.y, 0.02);
        this.warningGroup.add(mesh);
      }
    }
  }

  // ──────────────────────────────────────────────
  //  Internal
  // ──────────────────────────────────────────────

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

    while (this.warningGroup.children.length > 0) {
      const c = this.warningGroup.children[0];
      if (c instanceof THREE.Mesh) {
        c.geometry.dispose();
        if (c.material instanceof THREE.Material) {
          c.material.dispose();
        }
      }
      this.warningGroup.remove(c);
    }
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

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  resize(width?: number, height?: number): void {
    const w = (width ?? this.container.clientWidth) || window.innerWidth * 0.5;
    const h = (height ?? this.container.clientHeight) || window.innerHeight;
    this.updateCameraFrustum(w, h);
    this.renderer.setSize(w, h);
  }
}