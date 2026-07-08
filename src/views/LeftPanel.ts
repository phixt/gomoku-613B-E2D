import * as THREE from "three";
import { type Theme, AuxMode } from "../core/Types";
import type { AuxData3D } from "../core/Types";
import type { Board } from "../core/Board";

const BOARD_SIZE = 13;
const LAYER_COUNT = 6;
// Derived Z center: (LAYER_COUNT - 1) * LAYER_SPACING / 2 = 5 * 3.5 / 2 = 8.75
const LAYER_SPACING = 3.5; // ???????????????????
const CENTER_Z = (LAYER_COUNT - 1) * LAYER_SPACING / 2;

const VERTS_PER_LAYER = 26 * 2;

const AUX_PTS: [number, number][] = [
  [0, 0], [BOARD_SIZE - 1, 0], [0, BOARD_SIZE - 1],
  [BOARD_SIZE - 1, BOARD_SIZE - 1], [6, 6],
];

// 鈹€鈹€ Canvas piece texture 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

function createPieceTexture(isBlack: boolean, isGhost = false): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const cx = size / 2, cy = size / 2, r = size / 2 - 2;

  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath();

  if (isGhost) {
    if (isBlack) {
      const g = ctx.createRadialGradient(cx * 0.3 + size * 0.2, cy * 0.3 + size * 0.2, 0, cx, cy, r);
      g.addColorStop(0, "#444444"); g.addColorStop(0.5, "#222222"); g.addColorStop(1, "#000000");
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = "#000000"; ctx.lineWidth = 2.5; ctx.stroke();
    } else {
      const g = ctx.createRadialGradient(cx * 0.3 + size * 0.2, cy * 0.3 + size * 0.2, 0, cx, cy, r);
      g.addColorStop(0, "#F0E8E0"); g.addColorStop(0.5, "#D0C8C0"); g.addColorStop(1, "#A09A95");
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = "#555555"; ctx.lineWidth = 2.5; ctx.stroke();
    }
  } else {
    if (isBlack) {
      const g = ctx.createRadialGradient(cx * 0.3 + size * 0.2, cy * 0.3 + size * 0.2, 0, cx, cy, r);
      g.addColorStop(0, "#444444"); g.addColorStop(0.5, "#000000"); g.addColorStop(1, "#000000");
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = "#111111"; ctx.lineWidth = 2; ctx.stroke();
    } else {
      const g = ctx.createRadialGradient(cx * 0.3 + size * 0.2, cy * 0.3 + size * 0.2, 0, cx, cy, r);
      g.addColorStop(0, "#FFFFFF"); g.addColorStop(0.5, "#C0D0D0"); g.addColorStop(1, "#90A0A0");
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = "#90A0A0"; ctx.lineWidth = 2; ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas); tex.needsUpdate = true;
  return tex;
}

// 鈹€鈹€ Geometry builders (parameterized spacing) 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

function buildGridGeometry(focusZ: number, spacing: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const ordered: number[] = [];
  for (let z = 0; z < LAYER_COUNT; z++) { if (z !== focusZ) ordered.push(z); }
  ordered.push(focusZ);
  for (const layer of ordered) {
    const zPos = layer * spacing;
    for (let y = 0; y < BOARD_SIZE; y++) positions.push(0, y, zPos, BOARD_SIZE - 1, y, zPos);
    for (let x = 0; x < BOARD_SIZE; x++) positions.push(x, 0, zPos, x, BOARD_SIZE - 1, zPos);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const nf = VERTS_PER_LAYER * (LAYER_COUNT - 1);
  g.addGroup(0, nf, 0);
  g.addGroup(nf, VERTS_PER_LAYER, 1);
  return g;
}

function buildAuxLinesGeometry(spacing: number): THREE.BufferGeometry {
  const maxZ = (LAYER_COUNT - 1) * spacing;
  const positions: number[] = [];
  for (const [x, y] of AUX_PTS) positions.push(x, y, 0, x, y, maxZ);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return g;
}

function buildConnectorGeometry(spacing: number): THREE.BufferGeometry {
  const positions: number[] = [];
  for (let z = 0; z < LAYER_COUNT - 1; z++) {
    const z0 = z * spacing, z1 = (z + 1) * spacing;
    for (const [x, y] of AUX_PTS) positions.push(x, y, z0, x, y, z1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return g;
}

function safeWidth(el: HTMLElement): number { return el.clientWidth || window.innerWidth * 0.5; }
function safeHeight(el: HTMLElement): number { return el.clientHeight || window.innerHeight; }

// 鈹€鈹€ LeftPanel 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

export class LeftPanel {
  public readonly renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private gridSegments!: THREE.LineSegments;
  private auxSegments!: THREE.LineSegments;
  private connectorSegments!: THREE.LineSegments;
  private markerGroup!: THREE.Group;
  private piecesGroup!: THREE.Group;
  private auxLinesGroup!: THREE.Group;
  private highlightMarkers3DGroup!: THREE.Group;
  private container: HTMLElement;
  private focusZ: number = 0;
  private theme: Theme;
  private auxMode: AuxMode = AuxMode.ALL;
  private blackTex: THREE.CanvasTexture;
  private whiteTex: THREE.CanvasTexture;
  private blackGhostTex: THREE.CanvasTexture;
  private whiteGhostTex: THREE.CanvasTexture;


  private static readonly LAYER_SPACING = LAYER_SPACING; // ???????

  constructor(container: HTMLElement, theme: Theme) {
    this.container = container;
    this.theme = theme;
    const w = safeWidth(container), h = safeHeight(container);

    this.blackTex = createPieceTexture(true, false);
    this.whiteTex = createPieceTexture(false, false);
    this.blackGhostTex = createPieceTexture(true, true);
    this.whiteGhostTex = createPieceTexture(false, true);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(theme.bgColor);

    this.camera = new THREE.PerspectiveCamera(15, w / h, 0.1, 200);
    this.camera.up.set(0, 1, 0);
    this.camera.position.set(20, 8, 40);
    this.camera.lookAt(6, 6, CENTER_Z);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.buildAllGeometry();

    this.checkBoundarySafety();
  }

  /** @internal Exposed for cross-panel coordination. */
  get layerSpacing(): number { return LeftPanel.LAYER_SPACING; }



  private checkBoundarySafety(): void {
    const target = new THREE.Vector3(6, 6, CENTER_Z);
    const dist = this.camera.position.distanceTo(target);
    const vh = 2 * dist * Math.tan((this.camera.fov * Math.PI) / 360);
    if (vh < BOARD_SIZE) console.warn(`[LeftPanel] Board may be clipped: visibleHeight=${vh.toFixed(1)} < ${BOARD_SIZE}.`);
  }



  private buildAllGeometry(): void {
    const s = LeftPanel.LAYER_SPACING;

  
    const geo = buildGridGeometry(this.focusZ, s);
    const m1 = new THREE.LineBasicMaterial({ color: this.theme.ghostGridColor, transparent: true, opacity: 0.4 });
    const m2 = new THREE.LineBasicMaterial({ color: this.theme.focusGridColor });
    this.gridSegments = new THREE.LineSegments(geo, [m1, m2]);
    this.scene.add(this.gridSegments);

  
    const auxGeo = buildAuxLinesGeometry(s);
    this.auxSegments = new THREE.LineSegments(auxGeo, new THREE.LineBasicMaterial({ color: this.theme.auxLineColor }));
    this.scene.add(this.auxSegments);

  
    const connGeo = buildConnectorGeometry(s);
    this.connectorSegments = new THREE.LineSegments(connGeo, new THREE.LineBasicMaterial({ color: this.theme.gridColor, transparent: true, opacity: 0.35 }));
    this.scene.add(this.connectorSegments);

  
    this.markerGroup = new THREE.Group();
    for (let layer = 0; layer < LAYER_COUNT; layer++) {
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0x8b0000 }),
      );
      sphere.position.set(6, 6, layer * s);
      sphere.userData = { layer };
      this.markerGroup.add(sphere);
    }
    this.scene.add(this.markerGroup);
    this.highlightCenterMarker(this.focusZ);

  
    this.piecesGroup = new THREE.Group();
    this.scene.add(this.piecesGroup);

  
    this.auxLinesGroup = new THREE.Group();
    this.scene.add(this.auxLinesGroup);

  
    this.highlightMarkers3DGroup = new THREE.Group();
    this.scene.add(this.highlightMarkers3DGroup);
  }

  /** Dispose all old geometry/materials and rebuild from scratch. */
  




  highlightFocusLayer(z: number): void {
    this.focusZ = Math.max(0, Math.min(LAYER_COUNT - 1, z));
    const old = this.gridSegments;
    const s = LeftPanel.LAYER_SPACING;
    const geo = buildGridGeometry(this.focusZ, s);
    const m1 = new THREE.LineBasicMaterial({ color: this.theme.ghostGridColor, transparent: true, opacity: 0.4 });
    const m2 = new THREE.LineBasicMaterial({ color: this.theme.focusGridColor });
    this.gridSegments = new THREE.LineSegments(geo, [m1, m2]);
    this.scene.remove(old);
    this.scene.add(this.gridSegments);
    old.geometry.dispose();
    if (Array.isArray(old.material)) old.material.forEach((m: THREE.Material) => m.dispose());
    else old.material.dispose();
    this.highlightCenterMarker(this.focusZ);
  }

  private highlightCenterMarker(focus: number): void {
    for (let i = 0; i < LAYER_COUNT; i++) {
      const sphere = this.markerGroup.children[i] as THREE.Mesh;
      const mat = sphere.material as THREE.MeshBasicMaterial;
      if (i === focus) { sphere.scale.setScalar(1.5); mat.color.setHex(0xff0000); }
      else { sphere.scale.setScalar(1.0); mat.color.setHex(0x8b0000); }
    }
  }



  public rotateY(direction: number): void {
    const angle = (direction * Math.PI) / 2;
    const target = new THREE.Vector3(6, 6, CENTER_Z);
    const offset = this.camera.position.clone().sub(target);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
    this.camera.position.copy(target).add(offset);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(target);
  }



  /**
   * Zoom the view.
   * @param delta  Positive = zoom in (closer), negative = zoom out (farther).
   * @param anchorPoint  Optional 3D anchor. When provided, moves camera position
   *                     toward/away from the anchor. When absent, falls back to FOV adjustment.
   */
  public zoom(delta: number, anchorPoint?: THREE.Vector3): void {
    if (anchorPoint) {
    
      const dir = new THREE.Vector3().copy(anchorPoint).sub(this.camera.position);
      const dist = dir.length();
      const minDist = 5.0;
      const moveAmount = dist * delta * 0.15;

      if (moveAmount > 0 && dist - moveAmount < minDist) {
      
        const clampedDist = Math.max(minDist, dist - moveAmount);
        const ratio = (dist - clampedDist) / dist;
        this.camera.position.add(dir.clone().multiplyScalar(ratio));
      } else if (moveAmount < 0) {
      
        this.camera.position.add(dir.clone().multiplyScalar(delta * 0.15));
      } else {
        this.camera.position.add(dir.clone().multiplyScalar(delta * 0.15));
      }

      this.camera.lookAt(6, 6, CENTER_Z);
      this.camera.updateProjectionMatrix();
    } else {
    
      this.camera.fov = Math.max(15, Math.min(60, this.camera.fov - delta * 2));
      this.camera.updateProjectionMatrix();
    }
    this.checkBoundarySafety();
  }



  renderAllPieces(board: Board, focusZ: number): void {
    const s = LeftPanel.LAYER_SPACING;
    while (this.piecesGroup.children.length > 0) {
      const c = this.piecesGroup.children[0];
      if (c instanceof THREE.Sprite && c.material instanceof THREE.Material) c.material.dispose();
      this.piecesGroup.remove(c);
    }
    const scale = 0.8;
    for (let z = 0; z < LAYER_COUNT; z++) {
      const zPos = z * s;
      const isFocus = z === focusZ;
      for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
          const state = board.get(x, y, z);
          if (state === 0) continue;
          const tex = isFocus
            ? (state === 1 ? this.blackTex : this.whiteTex)
            : (state === 1 ? this.blackGhostTex : this.whiteGhostTex);
          const mat = new THREE.SpriteMaterial({
            map: tex, transparent: true, opacity: isFocus ? 1.0 : 0.25,
            depthWrite: isFocus, depthTest: true,
          });
          const sprite = new THREE.Sprite(mat);
          sprite.renderOrder = isFocus ? 2 : 1;
          sprite.position.set(x, y, zPos);
          sprite.scale.setScalar(scale);
          this.piecesGroup.add(sprite);
        }
      }
    }
  }



  clear3DAuxLines(): void {
    while (this.auxLinesGroup.children.length > 0) {
      const c = this.auxLinesGroup.children[0];
      if (c instanceof THREE.LineSegments) { c.geometry.dispose(); if (c.material instanceof THREE.Material) c.material.dispose(); }
      this.auxLinesGroup.remove(c);
    }
    while (this.highlightMarkers3DGroup.children.length > 0) {
      const c = this.highlightMarkers3DGroup.children[0];
      if (c instanceof THREE.Mesh) { c.geometry.dispose(); if (c.material instanceof THREE.Material) c.material.dispose(); }
      this.highlightMarkers3DGroup.remove(c);
    }
  }

  /** Render 3D auxiliary lines from hover-computed data (ally=green, enemy=red). */
  update3DAuxData(data: AuxData3D): void {
    this.clear3DAuxLines();
    if (data.lines.length === 0 && data.points.length === 0) return;

  
    const drawTactical = !!(this.auxMode & 0b10);
    const drawCenter = !!(this.auxMode & 0b01);
    if (!drawTactical && !drawCenter) return;

  
    if (data.lines.length > 0) {
      const pos: number[] = [];
      const col: number[] = [];
      for (const ln of data.lines) {
        pos.push(ln.startX, ln.startY, ln.startZ, ln.endX, ln.endY, ln.endZ);
        const r = ((ln.color >> 16) & 0xff) / 255;
        const g = ((ln.color >> 8) & 0xff) / 255;
        const b = (ln.color & 0xff) / 255;
        col.push(r, g, b, r, g, b);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
      const mat = new THREE.LineBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0.9,
        depthWrite: false, depthTest: true,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
      });
      const seg = new THREE.LineSegments(geo, mat);
      seg.renderOrder = 0;
      this.auxLinesGroup.add(seg);
    }

  
    for (const pt of data.points) {
      const geo = new THREE.SphereGeometry(0.12, 8, 6);
      const mat = new THREE.MeshBasicMaterial({
        color: pt.color, transparent: true, opacity: 0.8, depthWrite: false, depthTest: true,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(pt.x, pt.y, pt.z);
      mesh.renderOrder = 0;
      this.highlightMarkers3DGroup.add(mesh);
    }
  }



  setAuxMode(mode: AuxMode): void {
    this.auxMode = mode;
  }

  updateTheme(theme: Theme): void {
    this.theme = theme;
    this.scene.background = new THREE.Color(theme.bgColor);
    const m = this.gridSegments.material as THREE.LineBasicMaterial[];
    m[0].color.setHex(theme.ghostGridColor);
    m[1].color.setHex(theme.focusGridColor);
    (this.auxSegments.material as THREE.LineBasicMaterial).color.setHex(theme.auxLineColor);
    (this.connectorSegments.material as THREE.LineBasicMaterial).color.setHex(theme.gridColor);
  }

  render(): void { this.renderer.render(this.scene, this.camera); }

  resize(width?: number, height?: number): void {
    const w = (width ?? this.container.clientWidth) || window.innerWidth * 0.5;
    const h = (height ?? this.container.clientHeight) || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.checkBoundarySafety();
  }
}