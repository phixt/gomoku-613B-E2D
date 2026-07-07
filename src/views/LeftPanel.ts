import * as THREE from "three";

const BOARD_SIZE = 13;
const LAYER_COUNT = 6;
const LAYER_SPACING = 2.5;
const MAX_Z = (LAYER_COUNT - 1) * LAYER_SPACING; // 12.5

/** Number of vertices per layer (26 lines x 2 verts) */
const VERTS_PER_LAYER = 26 * 2;

/**
 * Build a single merged BufferGeometry with two groups:
 *   group 0 - all layers except the focus layer
 *   group 1 - the focus layer
 */
function buildGridGeometry(focusZ: number): THREE.BufferGeometry {
  const positions: number[] = [];

  // Push non-focus layers first, then the focus layer
  const orderedLayers: number[] = [];
  for (let z = 0; z < LAYER_COUNT; z++) {
    if (z !== focusZ) orderedLayers.push(z);
  }
  orderedLayers.push(focusZ);

  for (const layer of orderedLayers) {
    const zPos = layer * LAYER_SPACING;
    // 13 horizontal lines
    for (let y = 0; y < BOARD_SIZE; y++) {
      positions.push(0, y, zPos, BOARD_SIZE - 1, y, zPos);
    }
    // 13 vertical lines
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

/** Build auxiliary lines through Z-axis at corners and center */
function buildAuxLinesGeometry(): THREE.BufferGeometry {
  const pts: [number, number][] = [
    [0, 0],
    [BOARD_SIZE - 1, 0],
    [0, BOARD_SIZE - 1],
    [BOARD_SIZE - 1, BOARD_SIZE - 1],
    [6, 6],
  ];
  const positions: number[] = [];
  for (const [x, y] of pts) {
    positions.push(x, y, 0, x, y, MAX_Z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

export class LeftPanel {
  public readonly renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private gridSegments: THREE.LineSegments;
  private auxSegments: THREE.LineSegments;
  private container: HTMLElement;
  private focusZ: number = 0;
  private rotationState: number = 0;

  /** 4 camera positions orbiting the board (Y-axis) at 90-degree increments */
  private static readonly CAM_POSITIONS: [number, number, number][] = [
    [25, 18, 25],
    [-13, 18, 25],
    [-13, 18, -13],
    [25, 18, -13],
  ];

  constructor(container: HTMLElement) {
    this.container = container;
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a1a);

    this.camera = new THREE.PerspectiveCamera(20, w / h, 0.1, 200);
    this.updateCamera();

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    // Grid lines - single merged geometry with 2 groups
    const { gridSegments } = this.buildGrid();
    this.gridSegments = gridSegments;
    this.scene.add(this.gridSegments);

    // Auxiliary orange-red lines through Z axis
    const auxGeo = buildAuxLinesGeometry();
    const auxMat = new THREE.LineBasicMaterial({ color: 0xff4500 });
    this.auxSegments = new THREE.LineSegments(auxGeo, auxMat);
    this.scene.add(this.auxSegments);
  }

  private buildGrid(): { gridSegments: THREE.LineSegments } {
    const geo = buildGridGeometry(this.focusZ);
    const matNonFocus = new THREE.LineBasicMaterial({
      color: 0x888888,
      transparent: true,
      opacity: 0.3,
    });
    const matFocus = new THREE.LineBasicMaterial({
      color: 0xffd700,
    });
    const gridSegments = new THREE.LineSegments(geo, [matNonFocus, matFocus]);
    return { gridSegments };
  }

  private updateCamera(): void {
    const [cx, cy, cz] = LeftPanel.CAM_POSITIONS[this.rotationState];
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(6, MAX_Z / 2, 6);
    this.camera.updateProjectionMatrix();
  }

  rotateZ(delta: number): void {
    this.rotationState = ((this.rotationState + delta) % 4 + 4) % 4;
    this.updateCamera();
  }

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
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
}