import { VertexBuffer } from '@babylonjs/core/Buffers/buffer'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase'
import { MultiMaterial } from '@babylonjs/core/Materials/multiMaterial'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { SubMesh } from '@babylonjs/core/Meshes/subMesh'

class VertexDiffusePlugin extends MaterialPluginBase {
  constructor(material) { super(material, 'StaticVertexDiffuse', 200, {}, true, true) }
  getClassName() { return 'VertexDiffusePlugin' }
  getCustomCode(shaderType) {
    if (shaderType !== 'fragment') return null
    // StandardMaterial normally multiplies vertex color AFTER clamping lighting.
    // Move this palette into diffuseColor so bright sunlight shades exactly like
    // the original colored materials, instead of darkening the baked geometry.
    return { CUSTOM_FRAGMENT_UPDATE_DIFFUSE: 'diffuseColor *= baseColor.rgb;\nbaseColor.rgb = vec3(1.0);' }
  }
}

// Only the registry's opaque, untextured, non-specular palette is eligible.
// Textured fortifications and dynamic character materials keep their own passes.
export function createStaticMaterialBatches(scene, isPlainMaterial) {
  const shared = new Map()
  let before = 0, after = 0, baked = 0
  function material(doubleSided) {
    if (!shared.has(doubleSided)) {
      const result = new StandardMaterial(`static-palette:${doubleSided ? 'double' : 'single'}`, scene)
      result.diffuseColor = Color3.White()
      result.specularColor = Color3.Black()
      result.backFaceCulling = !doubleSided
      new VertexDiffusePlugin(result)
      shared.set(doubleSided, result)
    }
    return shared.get(doubleSided)
  }
  function bake(mesh) {
    const original = mesh.material, palette = original?.subMaterials ?? [original]
    if (!palette.every(isPlainMaterial) || mesh.isVerticesDataPresent(VertexBuffer.ColorKind)) return
    const indices = mesh.getIndices(), groups = new Map()
    for (const sub of mesh.subMeshes) {
      const doubleSided = !palette[sub.materialIndex].backFaceCulling
      if (!groups.has(doubleSided)) groups.set(doubleSided, [])
      groups.get(doubleSided).push(sub)
    }
    if (groups.size >= mesh.subMeshes.length) return
    const colors = new Float32Array(mesh.getTotalVertices() * 4)
    const painted = new Int32Array(mesh.getTotalVertices()).fill(-1)
    const reordered = mesh.getTotalVertices() > 65535 ? new Uint32Array(indices.length) : new Uint16Array(indices.length)
    const ranges = []
    let cursor = 0
    for (const [doubleSided, subs] of groups) {
      const start = cursor
      for (const sub of subs) {
        const color = palette[sub.materialIndex].diffuseColor
        for (let i = sub.indexStart; i < sub.indexStart + sub.indexCount; i++) {
          const vertex = indices[i]
          // Procedural MergeMeshes keeps vertices separate across materials. If
          // a future asset shares differently colored vertices, keep it intact.
          if (painted[vertex] !== -1 && painted[vertex] !== sub.materialIndex) return
          if (painted[vertex] === -1) {
            painted[vertex] = sub.materialIndex
            colors[vertex * 4] = color.r; colors[vertex * 4 + 1] = color.g
            colors[vertex * 4 + 2] = color.b; colors[vertex * 4 + 3] = 1
          }
          reordered[cursor++] = vertex
        }
      }
      ranges.push({ doubleSided, start, count: cursor - start })
    }
    if (cursor !== indices.length) return
    mesh.setVerticesData(VertexBuffer.ColorKind, colors, false)
    mesh.useVertexColors = true
    mesh.hasVertexAlpha = false
    mesh.setIndices(reordered)
    mesh.releaseSubMeshes()
    const materials = ranges.map(range => material(range.doubleSided))
    if (materials.length === 1) mesh.material = materials[0]
    else {
      const combined = new MultiMaterial(`${mesh.name}:palette`, scene)
      combined.subMaterials = materials
      mesh.material = combined
    }
    ranges.forEach((range, index) => SubMesh.CreateFromIndices(index, range.start, range.count, mesh))
    if (original.subMaterials) original.dispose()
    baked++
  }
  return {
    apply(mesh) { before += mesh.subMeshes.length; bake(mesh); after += mesh.subMeshes.length },
    stats: () => ({ staticMaterialBatchesBefore: before, staticMaterialBatchesAfter: after, paletteTemplates: baked }),
    dispose() { for (const entry of shared.values()) entry.dispose(); shared.clear() },
  }
}
