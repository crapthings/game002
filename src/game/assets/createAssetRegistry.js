import { cityAssetDefinitions } from './city/catalog.js'
import { createBridgeModel } from './city/createBridgeModel.js'
import { wuxiaDefinitions } from './wuxia/catalog.js'
import { createWuxiaModel } from './wuxia/createWuxiaModel.js'
import { fortificationDefinitions } from './fortifications/catalog.js'
import { createFortificationModel } from './fortifications/createFortificationModel.js'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import '@babylonjs/core/Meshes/instancedMesh'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { environmentCatalog } from './environment/catalog.js'
import { createEnvironmentModel } from './environment/createEnvironmentModel.js'

// 外观仅由 assetId 解析。未来替换工厂或 glTF 模型，不改变布局、对象 ID、进度。
export function createAssetRegistry(scene) {
  const templates = new Map()
  const materials = new Map()
  function material(color) {
    if (!materials.has(color)) {
      const result = new StandardMaterial(`asset:${color}`, scene)
      result.diffuseColor = Color3.FromHexString(color)
      result.specularColor = Color3.Black()
      materials.set(color, result)
    }
    return materials.get(color)
  }
  function template(assetId) {
    if (templates.has(assetId)) return templates.get(assetId)
    let mesh
    if (cityAssetDefinitions[assetId]) {
      mesh = createBridgeModel(scene,assetId,material)
    } else if (wuxiaDefinitions[assetId]) {
      mesh = createWuxiaModel(scene, assetId, material)
    } else if (fortificationDefinitions[assetId]) {
      mesh = createFortificationModel(scene, assetId, material)
    } else if (environmentCatalog[assetId]) {
      mesh = createEnvironmentModel(scene, assetId, environmentCatalog[assetId], material)
    } else if (assetId === 'nature.tree') {
      const trunk = MeshBuilder.CreateCylinder('trunk', { height: 3, diameter: 0.6, tessellation: 5 }, scene)
      trunk.position.y = 1.5
      trunk.material = material('#826448')
      const crown = MeshBuilder.CreateCylinder('crown', { height: 5, diameterBottom: 3.2, diameterTop: 0, tessellation: 6 }, scene)
      crown.position.y = 4
      crown.material = material('#315a48')
      mesh = Mesh.MergeMeshes([trunk, crown], true, true, undefined, false, true)
    } else if (assetId === 'nature.rock') {
      mesh = MeshBuilder.CreateSphere(assetId, { diameter: 2, segments: 2 }, scene)
      mesh.scaling.set(1.2, 0.7, 0.9)
      mesh.position.y = 0.5
      mesh.bakeCurrentTransformIntoVertices()
      mesh.material = material('#b5b2a0')
    } else {
      throw new Error(`未知自然资产：${assetId}`)
    }
    mesh.name = `template:${assetId}`
    mesh.isVisible = false
    mesh.isPickable = false
    templates.set(assetId, mesh)
    return mesh
  }
  return {
    prepare: (assetId) => template(assetId),
    create(placement, parent, regionId) {
      const instance = template(placement.assetId).createInstance(placement.id)
      instance.isVisible = true
      instance.isPickable = false
      instance.parent = parent
      instance.position.set(...placement.position)
      instance.rotation.y = placement.rotation
      instance.scaling.setAll(placement.scale)
      instance.metadata = { objectId: placement.id, regionId, assetId: placement.assetId }
      return instance
    },
    dispose() {
      for (const mesh of templates.values()) {
        if (mesh.material?.subMaterials) mesh.material.dispose()
        mesh.dispose()
      }
      for (const entry of materials.values()) entry.dispose()
      templates.clear()
      materials.clear()
    },
  }
}
