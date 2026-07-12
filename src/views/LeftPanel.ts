import * as THREE from "three";
import { type Theme, AuxMode, LIGHT_THEME, DARK_THEME } from "../core/Types";
import type { AuxData3D } from "../core/Types";
import type { Board } from "../core/Board";
import { BOARD_SIZE, LAYER_COUNT, DEFAULT_LAYER_SPACING, MIN_LAYER_SPACING, MAX_LAYER_SPACING, GHOST_PIECE_OPACITY, GHOST_GRID_OPACITY, GHOST_CONNECTOR_OPACITY, COLOR_ENEMY_NORMAL, COLOR_ENEMY_BLIND } from "../core/Config";
import { eventBus, Events } from "../core/EventBus";
import { resourceManager } from "../utils/ResourceManager";

// Derived Z center: (LAYER_COUNT - 1) * LAYER_SPACING / 2
const LAYER_SPACING = DEFAULT_LAYER_SPACING;




//  Canvas piece texture 

function createPieceTexture(isBlack: boolean, isGhost = false): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const cx = size / 2,cy = size / 2,r = size / 2 - 2;

  ctx.beginPath();ctx.arc(cx, cy, r, 0, Math.PI * 2);ctx.closePath();

  if (isGhost) {
    if (isBlack) {
      const g = ctx.createRadialGradient(cx * 0.3 + size * 0.2, cy * 0.3 + size * 0.2, 0, cx, cy, r);
      g.addColorStop(0, "#444444");g.addColorStop(0.5, "#222222");g.addColorStop(1, "#000000");
      ctx.fillStyle = g;ctx.fill();
      ctx.strokeStyle = "#000000";ctx.lineWidth = 2.5;ctx.stroke();
    } else {
      const g = ctx.createRadialGradient(cx * 0.3 + size * 0.2, cy * 0.3 + size * 0.2, 0, cx, cy, r);
      g.addColorStop(0, "#F0E8E0");g.addColorStop(0.5, "#D0C8C0");g.addColorStop(1, "#A09A95");
      ctx.fillStyle = g;ctx.fill();
      ctx.strokeStyle = "#555555";ctx.lineWidth = 2.5;ctx.stroke();
    }
  } else {
    if (isBlack) {
      const g = ctx.createRadialGradient(cx * 0.3 + size * 0.2, cy * 0.3 + size * 0.2, 0, cx, cy, r);
      g.addColorStop(0, "#444444");g.addColorStop(0.5, "#000000");g.addColorStop(1, "#000000");
      ctx.fillStyle = g;ctx.fill();
      ctx.strokeStyle = "#111111";ctx.lineWidth = 2;ctx.stroke();
    } else {
      const g = ctx.createRadialGradient(cx * 0.3 + size * 0.2, cy * 0.3 + size * 0.2, 0, cx, cy, r);
      g.addColorStop(0, "#FFFFFF");g.addColorStop(0.5, "#C0D0D0");g.addColorStop(1, "#90A0A0");
      ctx.fillStyle = g;ctx.fill();
      ctx.strokeStyle = "#90A0A0";ctx.lineWidth = 2;ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);tex.needsUpdate = true;
  return tex;
}

//  Geometry builders (parameterized spacing) 

function buildGridGeometry(focusZ: number, spacing: number, bs: number, lc: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const ordered: number[] = [];
  for (let z = 0; z < lc; z++) {if (z !== focusZ) ordered.push(z);}
  ordered.push(focusZ);
  for (const layer of ordered) {
    const zPos = layer * spacing;
    for (let y = 0; y < bs; y++) positions.push(0, y, zPos, bs - 1, y, zPos);
    for (let x = 0; x < bs; x++) positions.push(x, 0, zPos, x, bs - 1, zPos);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const vertsPerLayer = bs * 4;
  const nf = vertsPerLayer * (lc - 1);
  g.addGroup(0, nf, 0);
  g.addGroup(nf, vertsPerLayer, 1);
  return g;
}

function buildAuxLinesGeometry(spacing: number, bs: number, lc: number): THREE.BufferGeometry {
  const maxZ = (lc - 1) * spacing;
  const positions: number[] = [];
  const auxPts: [number, number][] = [[0,0],[bs-1,0],[0,bs-1],[bs-1,bs-1],[(bs-1)/2,(bs-1)/2]];
  for (const [x, y] of auxPts) positions.push(x, y, 0, x, y, maxZ);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return g;
}

function buildConnectorGeometry(spacing: number, bs: number, lc: number): THREE.BufferGeometry {
  const positions: number[] = [];
  for (let z = 0; z < lc - 1; z++) {
    const z0 = z * spacing,z1 = (z + 1) * spacing;
    const auxPts2: [number, number][] = [[0,0],[bs-1,0],[0,bs-1],[bs-1,bs-1],[(bs-1)/2,(bs-1)/2]];
    for (const [x, y] of auxPts2) positions.push(x, y, z0, x, y, z1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return g;
}

function safeWidth(el: HTMLElement): number {return el.clientWidth || window.innerWidth * 0.5;}
function safeHeight(el: HTMLElement): number {return el.clientHeight || window.innerHeight;}


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
  private bluePathGroup!: THREE.Group;
  private hoverMarkerGroup!: THREE.Group;
  private lastMoveRing: THREE.Mesh;

  private container: HTMLElement;
  private focusZ: number = 0;
  private theme: Theme;
  private auxMode: AuxMode = AuxMode.ALL;
  private isColorblindMode: boolean = false;
  private blackTex: THREE.CanvasTexture;
  private whiteTex: THREE.CanvasTexture;
  private blackGhostTex: THREE.CanvasTexture;
  private whiteGhostTex: THREE.CanvasTexture;
  private focusBlackMat!: THREE.SpriteMaterial;
  private focusWhiteMat!: THREE.SpriteMaterial;
  private ghostBlackMat!: THREE.SpriteMaterial;
  private ghostWhiteMat!: THREE.SpriteMaterial;


  private _boardSize: number;
  private _layerCount: number;
  private _layerSpacing: number = 3.5;
  private _previousSpacing: number | null = null;
  private _board: Board | null = null;

  constructor(container: HTMLElement, theme: Theme, boardSize: number = BOARD_SIZE, layerCount: number = LAYER_COUNT) {
    this._boardSize = boardSize;
    this._layerCount = layerCount;
    this.container = container;
    this.theme = theme;
    const w = safeWidth(container),h = safeHeight(container);

    this.blackTex = resourceManager.getOrCreateTexture("black", () => createPieceTexture(true, false));
    this.whiteTex = resourceManager.getOrCreateTexture("white", () => createPieceTexture(false, false));
    this.blackGhostTex = resourceManager.getOrCreateTexture("blackGhost", () => createPieceTexture(true, true));
    this.whiteGhostTex = resourceManager.getOrCreateTexture("whiteGhost", () => createPieceTexture(false, true));

    this.focusBlackMat = new THREE.SpriteMaterial({ map: this.blackTex, transparent: true, opacity: 1.0, depthWrite: true, depthTest: true });
    this.focusWhiteMat = new THREE.SpriteMaterial({ map: this.whiteTex, transparent: true, opacity: 1.0, depthWrite: true, depthTest: true });
    this.ghostBlackMat = new THREE.SpriteMaterial({ map: this.blackGhostTex, transparent: true, opacity: GHOST_PIECE_OPACITY, depthWrite: false, depthTest: true });
    this.ghostWhiteMat = new THREE.SpriteMaterial({ map: this.whiteGhostTex, transparent: true, opacity: GHOST_PIECE_OPACITY, depthWrite: false, depthTest: true });

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(theme.bgColor);

    this.camera = new THREE.PerspectiveCamera(15, w / h, 0.1, 200);
    this.camera.up.set(0, 1, 0);
    this.camera.position.set(20, 8, 40);
    const c_look = (this._boardSize - 1) / 2; const cz_look = (this._layerCount - 1) * LAYER_SPACING / 2; this.camera.lookAt(c_look, c_look, cz_look);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.buildAllGeometry();

    this.hoverMarkerGroup = new THREE.Group();
    this.hoverMarkerGroup.renderOrder = 3;
    this.scene.add(this.hoverMarkerGroup);

    // Last-move highlight ring (3D)
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

    this.checkBoundarySafety();
    this.rotateY(2);

    // Subscribe to events
    eventBus.on(Events.THEME_TOGGLED, (isDark: boolean) => this.applyTheme(isDark));
    eventBus.on(Events.COLORBLIND_MODE_TOGGLED, (isBlind: boolean) => {
      this.isColorblindMode = isBlind;
      this.highlightCenterMarker(this.focusZ);
      (this.lastMoveRing.material as THREE.MeshBasicMaterial).color.setHex(isBlind ? 0xFFCC00 : 0xFF0000);
    });
    eventBus.on(Events.LAYER_CHANGED, (z: number) => {this.focusZ = z;this.highlightFocusLayer(z);});
    eventBus.on(Events.GAME_RESET, () => {

      if (this.lastMoveRing) this.lastMoveRing.visible = false;
    });
  }

  /** @internal Exposed for cross-panel coordination. */
  get layerSpacing(): number {return this._layerSpacing;}




  private checkBoundarySafety(): void {
    const c_tgt = (this._boardSize - 1) / 2; const cz_tgt = (this._layerCount - 1) * LAYER_SPACING / 2; const target = new THREE.Vector3(c_tgt, c_tgt, cz_tgt);
    const dist = this.camera.position.distanceTo(target);
    const vh = 2 * dist * Math.tan(this.camera.fov * Math.PI / 360);
    if (vh < this._boardSize) console.warn(`[LeftPanel] Board may be clipped: visibleHeight=${vh.toFixed(1)} < ${this._boardSize}.`);
  }



  private buildAllGeometry(): void {
    const s = this._layerSpacing;


    const geo = buildGridGeometry(this.focusZ, s, this._boardSize, this._layerCount);
    const m1 = new THREE.LineBasicMaterial({ color: this.theme.ghostGridColor, transparent: true, opacity: GHOST_GRID_OPACITY });
    const m2 = new THREE.LineBasicMaterial({ color: this.theme.focusGridColor });
    this.gridSegments = new THREE.LineSegments(geo, [m1, m2]);
    this.scene.add(this.gridSegments);


    const auxGeo = buildAuxLinesGeometry(s, this._boardSize, this._layerCount);
    this.auxSegments = new THREE.LineSegments(auxGeo, new THREE.LineBasicMaterial({ color: this.theme.auxLineColor }));
    this.scene.add(this.auxSegments);


    const connGeo = buildConnectorGeometry(s, this._boardSize, this._layerCount);
    this.connectorSegments = new THREE.LineSegments(connGeo, new THREE.LineBasicMaterial({ color: this.theme.gridColor, transparent: true, opacity: GHOST_CONNECTOR_OPACITY }));
    this.scene.add(this.connectorSegments);


    this.markerGroup = new THREE.Group();
    for (let layer = 0; layer < this._layerCount; layer++) {
      const sphere = new THREE.Mesh(
        resourceManager.getGeometry("marker"),
        new THREE.MeshBasicMaterial({ color: 0x8b0000 })
      );
      const c_sph = (this._boardSize - 1) / 2; sphere.position.set(c_sph, c_sph, layer * s);
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

    this.bluePathGroup = new THREE.Group();
    this.scene.add(this.bluePathGroup);
  }

  /** Dispose all old geometry/materials and rebuild from scratch. */





  highlightFocusLayer(z: number): void {
    this.focusZ = Math.max(0, Math.min(this._layerCount - 1, z));
    const old = this.gridSegments;
    const s = this._layerSpacing;
    const geo = buildGridGeometry(this.focusZ, s, this._boardSize, this._layerCount);
    const m1 = new THREE.LineBasicMaterial({ color: this.theme.ghostGridColor, transparent: true, opacity: GHOST_GRID_OPACITY });
    const m2 = new THREE.LineBasicMaterial({ color: this.theme.focusGridColor });
    this.gridSegments = new THREE.LineSegments(geo, [m1, m2]);
    this.scene.remove(old);
    this.scene.add(this.gridSegments);
    old.geometry.dispose();
    if (Array.isArray(old.material)) old.material.forEach((m: THREE.Material) => m.dispose());else
    old.material.dispose();
    this.highlightCenterMarker(this.focusZ);
  }

  private highlightCenterMarker(focus: number): void {
    for (let i = 0; i < this._layerCount; i++) {
      const sphere = this.markerGroup.children[i] as THREE.Mesh;
      const mat = sphere.material as THREE.MeshBasicMaterial;
      if (i === focus) {sphere.scale.setScalar(1.5);mat.color.setHex(this.isColorblindMode ? COLOR_ENEMY_BLIND : COLOR_ENEMY_NORMAL);} else
      {sphere.scale.setScalar(1.0);mat.color.setHex(this.isColorblindMode ? 0x886600 : 0x8b0000);}
    }
  }



  public rotateY(direction: number): void {
    const angle = direction * Math.PI / 2;
    const c_tgt = (this._boardSize - 1) / 2; const cz_tgt = (this._layerCount - 1) * LAYER_SPACING / 2; const target = new THREE.Vector3(c_tgt, c_tgt, cz_tgt);
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

      const c_look = (this._boardSize - 1) / 2; const cz_look = (this._layerCount - 1) * LAYER_SPACING / 2; this.camera.lookAt(c_look, c_look, cz_look);
      this.camera.updateProjectionMatrix();
    } else {

      this.camera.fov = Math.max(15, Math.min(60, this.camera.fov - delta * 2));
      this.camera.updateProjectionMatrix();
    }
    this.checkBoundarySafety();

  }



  renderAllPieces(board: Board, focusZ: number): void {
    this._board = board;
    const s = this._layerSpacing;
    this.piecesGroup.clear();
    const scale = 0.8;
    // Clamp loops to configured bounds (safe against runtime config changes)
    const maxZ = Math.min(this._layerCount, board.layers);
    const maxXY = Math.min(this._boardSize, board.size);
    for (let z = 0; z < maxZ; z++) {
      const zPos = z * s;
      const isFocus = z === focusZ;
      for (let y = 0; y < maxXY; y++) {
        for (let x = 0; x < maxXY; x++) {
          const state = board.get(x, y, z);
          if (state === 0) continue;
          const mat = isFocus ?
          state === 1 ? this.focusBlackMat : this.focusWhiteMat :
          state === 1 ? this.ghostBlackMat : this.ghostWhiteMat;
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
      if (c instanceof THREE.LineSegments) {c.geometry.dispose();if (c.material instanceof THREE.Material) c.material.dispose();}
      this.auxLinesGroup.remove(c);
    }
    while (this.highlightMarkers3DGroup.children.length > 0) {
      const c = this.highlightMarkers3DGroup.children[0];
      if (c instanceof THREE.Mesh) {c.geometry.dispose();if (c.material instanceof THREE.Material) c.material.dispose();}
      this.highlightMarkers3DGroup.remove(c);
    }
    while (this.bluePathGroup.children.length > 0) {
      const c = this.bluePathGroup.children[0];
      if (c instanceof THREE.Points) {c.geometry.dispose();if (c.material instanceof THREE.Material) c.material.dispose();}
      this.bluePathGroup.remove(c);
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
      const ls = this._layerSpacing;
      for (const ln of data.lines) {
        pos.push(ln.startX, ln.startY, ln.startZ * ls, ln.endX, ln.endY, ln.endZ * ls);
        const r = (ln.color >> 16 & 0xff) / 255;
        const g = (ln.color >> 8 & 0xff) / 255;
        const b = (ln.color & 0xff) / 255;
        col.push(r, g, b, r, g, b);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
      const mat = new THREE.LineBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0.9,
        depthWrite: false, depthTest: true,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
      });
      const seg = new THREE.LineSegments(geo, mat);
      seg.renderOrder = 0;
      this.auxLinesGroup.add(seg);
    }


    for (const pt of data.points) {
      const geo = new THREE.SphereGeometry(0.12, 8, 6);
      const mat = new THREE.MeshBasicMaterial({
        color: pt.color, transparent: true, opacity: 0.8, depthWrite: false, depthTest: true
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(pt.x, pt.y, pt.z * this._layerSpacing);
      mesh.renderOrder = 10;
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

  applyTheme(isDark: boolean): void {
    const theme = isDark ? DARK_THEME : LIGHT_THEME;
    this.updateTheme(theme);
  }


  updateHoverMarker(x: number, y: number, z: number): void {
    while (this.hoverMarkerGroup.children.length > 0) {
      const c = this.hoverMarkerGroup.children[0];
      if (c instanceof THREE.Mesh) {c.geometry.dispose();if (c.material instanceof THREE.Material) c.material.dispose();}
      this.hoverMarkerGroup.remove(c);
    }
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x0088FF })
    );
    marker.position.set(x, y, z * this.layerSpacing + 0.1);
    this.hoverMarkerGroup.add(marker);
  }

  clearHoverMarker(): void {
    while (this.hoverMarkerGroup.children.length > 0) {
      const c = this.hoverMarkerGroup.children[0];
      if (c instanceof THREE.Mesh) {c.geometry.dispose();if (c.material instanceof THREE.Material) c.material.dispose();}
      this.hoverMarkerGroup.remove(c);
    }
  }

  adjustLayerSpacing(delta: number): void {
    console.log("adjustLayerSpacing called, new spacing:", this._layerSpacing);
    this._layerSpacing = Math.max(MIN_LAYER_SPACING, Math.min(MAX_LAYER_SPACING, this._layerSpacing + delta));

    // Rebuild grid segments (same pattern as highlightFocusLayer)
    const oldGrid = this.gridSegments;
    const s = this._layerSpacing;
    const geo = buildGridGeometry(this.focusZ, s, this._boardSize, this._layerCount);
    const m1 = new THREE.LineBasicMaterial({ color: this.theme.ghostGridColor, transparent: true, opacity: GHOST_GRID_OPACITY });
    const m2 = new THREE.LineBasicMaterial({ color: this.theme.focusGridColor });
    this.gridSegments = new THREE.LineSegments(geo, [m1, m2]);
    this.scene.remove(oldGrid);
    this.scene.add(this.gridSegments);
    oldGrid.geometry.dispose();
    if (Array.isArray(oldGrid.material)) oldGrid.material.forEach((m: THREE.Material) => m.dispose());else
    oldGrid.material.dispose();

    // Rebuild aux segments
    const oldAux = this.auxSegments;
    const auxGeo = buildAuxLinesGeometry(s, this._boardSize, this._layerCount);
    this.auxSegments = new THREE.LineSegments(auxGeo, new THREE.LineBasicMaterial({ color: this.theme.auxLineColor }));
    this.scene.remove(oldAux);
    this.scene.add(this.auxSegments);
    oldAux.geometry.dispose();
    (oldAux.material as THREE.Material).dispose();

    // Rebuild connector segments
    const oldConn = this.connectorSegments;
    const connGeo = buildConnectorGeometry(s, this._boardSize, this._layerCount);
    this.connectorSegments = new THREE.LineSegments(connGeo, new THREE.LineBasicMaterial({ color: this.theme.gridColor, transparent: true, opacity: GHOST_CONNECTOR_OPACITY }));
    this.scene.remove(oldConn);
    this.scene.add(this.connectorSegments);
    oldConn.geometry.dispose();
    (oldConn.material as THREE.Material).dispose();

    // Rebuild marker group spheres
    this.scene.remove(this.markerGroup);
    while (this.markerGroup.children.length > 0) {
      const c = this.markerGroup.children[0];
      if (c instanceof THREE.Mesh) {c.geometry.dispose();if (c.material instanceof THREE.Material) c.material.dispose();}
      this.markerGroup.remove(c);
    }
    this.markerGroup = new THREE.Group();
    for (let layer = 0; layer < this._layerCount; layer++) {
      const sphere = new THREE.Mesh(
        resourceManager.getGeometry("marker"),
        new THREE.MeshBasicMaterial({ color: 0x8b0000 })
      );
      const c_sph = (this._boardSize - 1) / 2; sphere.position.set(c_sph, c_sph, layer * s);
      sphere.userData = { layer };
      this.markerGroup.add(sphere);
    }
    this.scene.add(this.markerGroup);
    this.highlightCenterMarker(this.focusZ);

    // Rebuild pieces at new Z positions
    if (this._board) this.renderAllPieces(this._board, this.focusZ);

    // Clear 3D tactical overlays (Z coords now invalid)
    this.clear3DAuxLines();
    this.clearHoverMarker();
    while (this.bluePathGroup.children.length > 0) {
      const c = this.bluePathGroup.children[0];
      if (c instanceof THREE.Points) {c.geometry.dispose();if (c.material instanceof THREE.Material) c.material.dispose();}
      this.bluePathGroup.remove(c);
    }

    // Sync camera lookAt to new Z center
    const newCenterZ = (this._layerCount - 1) * this._layerSpacing / 2;
    const c_ncz = (this._boardSize - 1) / 2; this.camera.lookAt(c_ncz, c_ncz, newCenterZ);
    this.checkBoundarySafety();
  }

  toggleLayerSpacing(): void {
    if (this._previousSpacing === null) {
      this._previousSpacing = this._layerSpacing;
      const delta = 3.5 - this._layerSpacing;
      this.adjustLayerSpacing(delta);
    } else {
      const delta = this._previousSpacing - this._layerSpacing;
      this._previousSpacing = null;
      this.adjustLayerSpacing(delta);
    }
  }

  updateLastMoveUI(x: number, y: number, z: number): void {
    // Boundary check: reject out-of-range coordinates (phantom ring prevention)
    if (x < 0 || x >= this._boardSize || y < 0 || y >= this._boardSize || z < 0 || z >= this._layerCount) return;
    const zPos = z * this._layerSpacing;
    this.lastMoveRing.position.set(x, y, zPos + 0.1);
    this.lastMoveRing.visible = true;
  }

  /** Restore camera focus and layer spacing from a loaded save. */
  restoreCameraState(focusZ: number, layerSpacing: number): void {
    const delta = layerSpacing - this._layerSpacing;
    if (Math.abs(delta) > 0.01) {
      this.adjustLayerSpacing(delta);
    }
    this.focusZ = Math.max(0, Math.min(this._layerCount - 1, focusZ));
    this.highlightFocusLayer(this.focusZ);
  }


  render(): void {
    // Billboard effect: always face the camera so the ring is a perfect circle
    if (this.lastMoveRing && this.lastMoveRing.visible) {
      this.lastMoveRing.lookAt(this.camera.position);
    }
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