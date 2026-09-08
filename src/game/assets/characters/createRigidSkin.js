import { Bone } from '@babylonjs/core/Bones/bone'
import { Skeleton } from '@babylonjs/core/Bones/skeleton'
import { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo'
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer'
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector'
import { Mesh } from '@babylonjs/core/Meshes/mesh'

// Procedural parts keep their existing joint animation, but share one skinned
// mesh. One bone per joint, one influence per vertex, material-based submeshes.
// Independently visible equipment stays attached to the original joint nodes.
export function createRigidSkin(root, { exclude = [] } = {}) {
  const parts = root.getChildMeshes().filter(mesh => !exclude.includes(mesh) && mesh.getTotalVertices() > 0)
  const scene = root.getScene()
  const skeleton = new Skeleton(`${root.name}:rig`, `${root.uniqueId}:rig`, scene)
  const rootBone = new Bone('model-origin', skeleton, null, Matrix.Identity())
  const bones = new Map([[root, rootBone]])
  function boneFor(node) {
    if (bones.has(node)) return bones.get(node)
    const parent = boneFor(node.parent)
    const local = Matrix.Compose(node.scaling, node.rotationQuaternion ?? Quaternion.FromEulerVector(node.rotation), node.position)
    const bone = new Bone(node.name, skeleton, parent, local)
    bone.linkTransformNode(node)
    bones.set(node, bone)
    return bone
  }
  const inverseRoot = root.computeWorldMatrix(true).clone().invert()
  for (const part of parts) {
    const index = skeleton.bones.indexOf(boneFor(part.parent))
    const indices = new Float32Array(part.getTotalVertices() * 4)
    const weights = new Float32Array(indices.length)
    for (let i = 0; i < indices.length; i += 4) { indices[i] = index; weights[i] = 1 }
    part.setVerticesData(VertexBuffer.MatricesIndicesKind, indices, false)
    part.setVerticesData(VertexBuffer.MatricesWeightsKind, weights, false)
  }
  const mesh = Mesh.MergeMeshes(parts, true, true, undefined, false, true)
  mesh.name = `${root.name}:skin`
  // MergeMeshes bakes world transforms; bones operate in model coordinates.
  mesh.bakeTransformIntoVertices(inverseRoot)
  mesh.parent = root
  mesh.skeleton = skeleton
  mesh.numBoneInfluencers = 1
  mesh.computeBonesUsingShaders = true
  mesh.isPickable = false
  // A fixed envelope includes swings, the cape, baskets and somersaults.
  // Never read skinned vertices back to the CPU just to update culling bounds.
  const minimum = new Vector3(-3, -3, -3), maximum = new Vector3(3, 4, 3)
  mesh.setBoundingInfo(new BoundingInfo(minimum, maximum))
  for (const subMesh of mesh.subMeshes) subMesh.setBoundingInfo(new BoundingInfo(minimum.clone(), maximum.clone()))
  const material = mesh.material
  return {
    mesh,
    dispose() { mesh.dispose(); material.dispose(); skeleton.dispose() },
  }
}
