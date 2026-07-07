import * as THREE from "three";

const BOARD_SIZE = 13;
const LAYER_SPACING = 2.5;
const CENTER = (BOARD_SIZE - 1) / 2; // 6
const HALF_EXTENT = CENTER + 0.5; // 6.5 - from center to edge including border

/** Build a single merged BufferGeometry for one 13x13 layer grid (black lines) */
function buildLayerGridGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];

  // 13 horizontal lines - one at each y intersection
  for (let y = 0; y < BOARD_SIZE; y++) {
    positions.push(0, y, 0, BOARD_SIZE - 1, y, 0);
  }
  // 13 vertical lines - one at each x intersection
  for (let x = 0; x < BOARD_SIZE; x++) {
    positions.push(x, 0, 0, x, BOARD_SIZE - 1, 0);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

export class RightPanel {
  public readonly renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private gridGroup: THREE.Group;
  private gridSegments: THREE.LineSegments;
  private container: HTMLElement;
  private focusZ: number = 0;

  constructor(container: HTMLElement) {
    this.container = container;
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;

    this.scene = new THREE.Scene();

    // Orthographic camera
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    this.updateCameraFrustum(w, h);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setClearColor(0xd2b48c); // tan / brown background
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    // Merged grid lines in a group so we can move it to the focus layer Z
    const gridGeo = buildLayerGridGeometry();
    const gridMat = new THREE.LineBasicMaterial({ color: 0x000000 });
    this.gridSegments = new THREE.LineSegments(gridGeo, gridMat);

    this.gridGroup = new THREE.Group();
    this.gridGroup.add(this.gridSegments);
    this.scene.add(this.gridGroup);

    this.applyFocusZ();
  }

  private updateCameraFrustum(width: number, height: number): void {
    const aspect = width / height;
    if (aspect >= 1) {
      // Wider than tall - height constrains
      this.camera.left = CENTER - HALF_EXTENT * aspect;
      this.camera.right = CENTER + HALF_EXTENT * aspect;
      this.camera.top = CENTER + HALF_EXTENT;
      this.camera.bottom = CENTER - HALF_EXTENT;
    } else {
      // Taller than wide - width constrains
      this.camera.left = CENTER - HALF_EXTENT;
      this.camera.right = CENTER + HALF_EXTENT;
      this.camera.top = CENTER + HALF_EXTENT / aspect;
      this.camera.bottom = CENTER - HALF_EXTENT / aspect;
    }
    this.camera.updateProjectionMatrix();
  }

  private applyFocusZ(): void {
    const zPos = this.focusZ * LAYER_SPACING;
    this.camera.position.set(CENTER, CENTER, zPos + 50);
    this.camera.lookAt(CENTER, CENTER, zPos);
    this.gridGroup.position.z = zPos;
  }

  setFocusZ(z: number): void {
    this.focusZ = Math.max(0, Math.min(5, z));
    this.applyFocusZ();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.updateCameraFrustum(w, h);
    this.renderer.setSize(w, h);
  }
}