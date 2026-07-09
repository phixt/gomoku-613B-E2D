import * as THREE from "three";
import { PIECE_RADIUS } from "../core/Config";

type GeometryKey = "piece" | "marker";

class ResourceManager {
  private static instance: ResourceManager;
  private materials = new Map<string, THREE.Material>();
  private geometries = new Map<GeometryKey, THREE.BufferGeometry>();
  private textures = new Map<string, THREE.CanvasTexture>();

  private constructor() {}

  static getInstance(): ResourceManager {
    if (!ResourceManager.instance) {
      ResourceManager.instance = new ResourceManager();
    }
    return ResourceManager.instance;
  }

  getGeometry(type: GeometryKey): THREE.BufferGeometry {
    let geo = this.geometries.get(type);
    if (!geo) {
      switch (type) {
        case "piece":
          geo = new THREE.CircleGeometry(PIECE_RADIUS, 24);
          break;
        case "marker":
          geo = new THREE.SphereGeometry(0.1, 8, 6);
          break;
      }
      this.geometries.set(type, geo!);
    }
    return geo!;
  }

  getMaterial(type: string, texture?: THREE.Texture): THREE.Material {
    const key = texture ? `${type}_${texture.id}` : type;
    let mat = this.materials.get(key);
    if (!mat) {
      switch (type) {
        case "black":
          mat = new THREE.MeshBasicMaterial({ map: texture });
          break;
        case "white":
          mat = new THREE.MeshBasicMaterial({ map: texture });
          break;
        case "blackGhost":
          mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
          break;
        case "whiteGhost":
          mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
          break;
        case "grid":
          mat = new THREE.LineBasicMaterial({ color: 0xa0c0c4 });
          break;
        case "marker":
          mat = new THREE.MeshBasicMaterial({ color: 0x8b0000 });
          break;
      }
      if (mat) this.materials.set(key, mat);
    }
    return mat ?? new THREE.MeshBasicMaterial();
  }

  getOrCreateTexture(key: string, factory: () => THREE.CanvasTexture): THREE.CanvasTexture {
    let tex = this.textures.get(key);
    if (!tex) {
      tex = factory();
      this.textures.set(key, tex);
    }
    return tex;
  }

  dispose(): void {
    this.materials.forEach((m) => m.dispose());
    this.materials.clear();
    this.geometries.forEach((g) => g.dispose());
    this.geometries.clear();
    this.textures.forEach((t) => t.dispose());
    this.textures.clear();
  }
}

export const resourceManager = ResourceManager.getInstance();
