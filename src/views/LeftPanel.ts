import * as THREE from "three";
import { type Theme } from "../core/Types";
import type { Board } from "../core/Board";

const BOARD_SIZE = 13;
const LAYER_COUNT = 6;
const LAYER_SPACING = 2.5;
const MAX_Z = (LAYER_COUNT - 1) * LAYER_SPACING; // 12.5
const Z_CENTER = 7.5; // visual centre of gravity (lookAt target Z)

/** Number of vertices per layer (26 lines × 2 verts) */
const VERTS_PER_LAYER = 26 * 2;

// ---- Key XY points for auxiliary / connector lines ----
const AUX_PTS: [number, number][] = [
  [0, 0],
  [BOARD_SIZE - 1, 0],
  [0, BOARD_SIZE - 1],
  [BOARD_SIZE - 1, BOARD_SIZE - 1],
  [6, 6],
];

// ──────────────────────────────────────────────
//  Canvas piece texture (shared with RightPanel)
// ──────────────────────────────────────────────

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

// ──────────────────────────────────────────────
//  Geometry builders
// ──────────────────────────────────────────────

function buildGridGeometry(focusZ: number): THREE.BufferGeometry {
  const positions: number[] = [];

  const ordered: number[] = [];
  for (let z = 0; z < LAYER_COUNT; z++) {
    if (z !== focusZ) ordered.push(z);
  }
  ordered.push(focusZ);

  for (const layer of ordered) {
    const zPos = layer * LAYER_SPACING;

    for (let y = 0; y < BOARD_SIZE; y++) {
      positions.push(0, y, zPos, BOARD_SIZE - 1, y, zPos);
    }
    for (let x = 0; x < BOARD_SIZE; x++) {
      positions.push(x, 0, zPos, x, BOARD_SIZE - 1, zPos);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));

  const nonFocusVerts = VERTS_PER_LAYER * (LAYER_COUNT - 1);
  geometry.addGroup(0, nonFocusVerts, 0);
  geometry.addGroup(nonFocusVerts, VERTS_PER_LAYER, 1);

  return geometry;
}

function buildAuxLinesGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  for (const [x, y] of AUX_PTS) {
    positions.push(x, y, 0, x, y, MAX_Z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

function buildConnectorGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  for (let z = 0; z < LAYER_COUNT - 1; z++) {
    const z0 = z * LAYER_SPACING;
    const z1 = (z + 1) * LAYER_SPACING;
    for (const [x, y] of AUX_PTS) {
      positions.push(x, y, z0, x, y, z1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

function safeWidth(el: HTMLElement): number {
  return el.clientWidth || window.innerWidth * 0.5;
}

function safeHeight(el: HTMLElement): number {
  return el.clientHeight || window.innerHeight;
}

// ──────────────────────────────────────────────
//  LeftPanel
// ──────────────────────────────────────────────

export class LeftPanel {
  public readonly renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private gridSegments: THREE.LineSegments;
  private auxSegments: THREE.LineSegments;
  private connectorSegments: THREE.LineSegments;
  private markerGroup: THREE.Group;
  private piecesGroup: THREE.Group;
  private container: HTMLElement;
  private focusZ: number = 0;
  private theme: Theme;
  private blackTex: THREE.CanvasTexture;
  private whiteTex: THREE.CanvasTexture;

  constructor(container: HTMLElement, theme: Theme) {
    this.container = container;
    this.theme = theme;
    const w = safeWidth(container);
    const h = safeHeight(container);

    this.blackTex = createPieceTexture(true);
    this.whiteTex = createPieceTexture(false);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(theme.bgColor);

    this.camera = new THREE.PerspectiveCamera(20, w / h, 0.1, 200);
    this.camera.up.set(0, 1, 0);
    this.camera.position.set(16, 6, 32);
    this.camera.lookAt(6, 6, Z_CENTER);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    // --- Grid ---
    const { gridSegments } = this.buildGrid();
    this.gridSegments = gridSegments;
    this.scene.add(this.gridSegments);

    // --- Auxiliary lines ---
    const auxGeo = buildAuxLinesGeometry();
    const auxMat = new THREE.LineBasicMaterial({ color: theme.auxLineColor });
    this.auxSegments = new THREE.LineSegments(auxGeo, auxMat);
    this.scene.add(this.auxSegments);

    // --- Connector lines ---
    const connGeo = buildConnectorGeometry();
    const connMat = new THREE.LineBasicMaterial({
      color: theme.gridColor,
      transparent: true,
      opacity: 0.35,
    });
    this.connectorSegments = new THREE.LineSegments(connGeo, connMat);
    this.scene.add(this.connectorSegments);

    // --- Centre markers (one per layer) ---
    this.markerGroup = new THREE.Group();
    for (let layer = 0; layer < LAYER_COUNT; layer++) {
      const zPos = layer * LAYER_SPACING;
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0x8b0000 }),
      );
      sphere.position.set(6, 6, zPos);
      sphere.userData = { layer };
      this.markerGroup.add(sphere);
    }
    this.scene.add(this.markerGroup);
    this.highlightCenterMarker(0);

    // --- Pieces group (rendered on demand) ---
    this.piecesGroup = new THREE.Group();
    this.scene.add(this.piecesGroup);

    this.checkBoundarySafety();
  }

  // ──────────────────────────────────────────────
  //  Boundary safety
  // ──────────────────────────────────────────────

  private checkBoundarySafety(): void {
    const target = new THREE.Vector3(6, 6, Z_CENTER);
    const dist = this.camera.position.distanceTo(target);
    const visibleHeight = 2 * dist * Math.tan((this.camera.fov * Math.PI) / 360);
    if (visibleHeight < BOARD_SIZE) {
      console.warn(
        `[LeftPanel] Board may be clipped: visibleHeight=${visibleHeight.toFixed(1)} < ${BOARD_SIZE}. ` +
          `Consider increasing camera distance or FOV.`,
      );
    }
  }

  // ──────────────────────────────────────────────
  //  Grid builders
  // ──────────────────────────────────────────────

  private buildGrid(): { gridSegments: THREE.LineSegments } {
    const geo = buildGridGeometry(this.focusZ);
    const matNonFocus = new THREE.LineBasicMaterial({
      color: this.theme.ghostGridColor,
      transparent: true,
      opacity: 0.4,
    });
    const matFocus = new THREE.LineBasicMaterial({
      color: this.theme.focusGridColor,
    });
    return { gridSegments: new THREE.LineSegments(geo, [matNonFocus, matFocus]) };
  }

  private highlightCenterMarker(focus: number): void {
    for (let i = 0; i < LAYER_COUNT; i++) {
      const sphere = this.markerGroup.children[i] as THREE.Mesh;
      const mat = sphere.material as THREE.MeshBasicMaterial;
      if (i === focus) {
        sphere.scale.setScalar(1.5);
        mat.color.setHex(0xff0000);
      } else {
        sphere.scale.setScalar(1.0);
        mat.color.setHex(0x8b0000);
      }
    }
  }

  // ──────────────────────────────────────────────
  //  Camera controls
  // ──────────────────────────────────────────────

  public rotateY(direction: number): void {
    const angle = (direction * Math.PI) / 2;
    const target = new THREE.Vector3(6, 6, Z_CENTER);
    const offset = this.camera.position.clone().sub(target);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
    this.camera.position.copy(target).add(offset);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(target);
  }

  public zoom(delta: number, anchorPoint?: THREE.Vector3): void {
    if (anchorPoint) {
      console.log("Anchor point received for zoom:", anchorPoint);
    }
    this.camera.fov = Math.max(15, Math.min(60, this.camera.fov - delta * 2));
    this.camera.updateProjectionMatrix();
    this.checkBoundarySafety();
  }

  // ──────────────────────────────────────────────
  //  Focus layer
  // ──────────────────────────────────────────────

  highlightFocusLayer(z: number): void {
    this.focusZ = Math.max(0, Math.min(LAYER_COUNT - 1, z));

    const old = this.gridSegments;
    const { gridSegments } = this.buildGrid();
    this.gridSegments = gridSegments;
    this.scene.remove(old);
    this.scene.add(this.gridSegments);
    old.geometry.dispose();
    if (Array.isArray(old.material)) {
      old.material.forEach((m) => m.dispose());
    } else {
      old.material.dispose();
    }

    this.highlightCenterMarker(this.focusZ);
  }

  // ──────────────────────────────────────────────
  //  Piece rendering (all 13×13×6)
  // ──────────────────────────────────────────────

  renderAllPieces(board: Board, focusZ: number): void {
    // Clear previous sprites
    while (this.piecesGroup.children.length > 0) {
      const c = this.piecesGroup.children[0];
      if (c instanceof THREE.Sprite && c.material instanceof THREE.Material) {
        c.material.dispose();
      }
      this.piecesGroup.remove(c);
    }

    const spriteGeoScale = 0.8;

    for (let z = 0; z < LAYER_COUNT; z++) {
      const zPos = z * LAYER_SPACING;
      const isFocus = z === focusZ;

      for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
          const state = board.get(x, y, z);
          if (state === 0) continue;

          const tex = state === 1 ? this.blackTex : this.whiteTex;
          const mat = new THREE.SpriteMaterial({
            map: tex,
            transparent: true,
            opacity: isFocus ? 1.0 : 0.25,
            depthWrite: false,
            depthTest: true,
          });
          const sprite = new THREE.Sprite(mat);
          sprite.position.set(x, y, zPos);
          sprite.scale.setScalar(spriteGeoScale);
          this.piecesGroup.add(sprite);
        }
      }
    }
  }

  // ──────────────────────────────────────────────
  //  Theme
  // ──────────────────────────────────────────────

  updateTheme(theme: Theme): void {
    this.theme = theme;
    this.scene.background = new THREE.Color(theme.bgColor);

    const gridMats = this.gridSegments.material as THREE.LineBasicMaterial[];
    gridMats[0].color.setHex(theme.ghostGridColor);
    gridMats[1].color.setHex(theme.focusGridColor);

    (this.auxSegments.material as THREE.LineBasicMaterial).color.setHex(theme.auxLineColor);
    (this.connectorSegments.material as THREE.LineBasicMaterial).color.setHex(theme.gridColor);
  }

  // ──────────────────────────────────────────────
  //  Lifecycle
  // ──────────────────────────────────────────────

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  resize(width?: number, height?: number): void {
    const w = (width ?? this.container.clientWidth) || window.innerWidth * 0.5;
    const h = (height ?? this.container.clientHeight) || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.checkBoundarySafety();
  }
}