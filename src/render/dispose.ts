import { Material, Mesh, Object3D, Texture } from '@iwsdk/core';

/** Mark a cached material or texture so disposeObject() leaves it alone. */
export function markShared<T extends Material | Texture>(x: T): T {
  x.userData.shared = true;
  return x;
}

/**
 * Free the GPU resources under an object: geometries, materials and their
 * textures, skipping anything marked shared. Call after removing it from the
 * scene for good.
 */
export function disposeObject(root: Object3D): void {
  root.traverse((o) => {
    const m = o as Mesh;
    if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
    const mats: Material[] = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      if (mat.userData.shared) continue;
      for (const v of Object.values(mat)) {
        if (v instanceof Texture && !v.userData.shared) v.dispose();
      }
      mat.dispose();
    }
  });
}
