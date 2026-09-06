import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { HUMAN_SCALE } from '../world/worldMetrics.js'

// 现代末日幸存者代理：面向 +Z、脚底原点；保持原有移动和碰撞接口。
export function createSurvivor(scene) {
  const root = new TransformNode('player', scene)
  const rig = new TransformNode('survivor-rig', scene)
  rig.parent = root
  rig.scaling.setAll(HUMAN_SCALE.playerModelScale)
  const materials = []
  function material(name, color) {
    const mat = new StandardMaterial(name, scene)
    mat.diffuseColor = Color3.FromHexString(color)
    mat.specularColor = Color3.Black()
    materials.push(mat)
    return mat
  }
  const jacket = material('survivor-faded-olive', '#737c60')
  const seams = material('survivor-dark-seams', '#444c3d')
  const trousers = material('survivor-charcoal-canvas', '#454b49')
  const boots = material('survivor-worn-leather', '#303431')
  const skin = material('survivor-skin', '#b89879')
  const cap = material('survivor-rust-cap', '#985b43')
  const packCloth = material('survivor-khaki-pack', '#96896a')
  const straps = material('survivor-webbing', '#514c3b')
  const steel = material('survivor-dull-steel', '#a2a89d')
  const bandage = material('survivor-bandage', '#c1bba2')

  function box(name, size, position, mat, parent = rig) {
    const mesh = MeshBuilder.CreateBox(name, { width: size[0], height: size[1], depth: size[2] }, scene)
    mesh.parent = parent
    mesh.position.set(...position)
    mesh.material = mat
    mesh.isPickable = false
    return mesh
  }
  function sphere(name, size, position, mat, parent = rig) {
    const mesh = MeshBuilder.CreateSphere(name, { diameter: 1, segments: 3 }, scene)
    mesh.parent = parent
    mesh.position.set(...position)
    mesh.scaling.set(...size)
    mesh.material = mat
    mesh.isPickable = false
    return mesh
  }
  function joint(name, position, parent = rig) {
    const node = new TransformNode(name, scene)
    node.parent = parent
    node.position.set(...position)
    return node
  }

  // 肩线、棒球帽和背包形成俯视时可辨识的前后轮廓。
  box('jacket-torso', [0.63, 0.69, 0.39], [0, 1.22, 0], jacket)
  box('jacket-hem', [0.66, 0.13, 0.42], [0, 0.94, 0], seams)
  box('jacket-zipper', [0.035, 0.56, 0.025], [0, 1.26, 0.21], steel)
  box('collar-left', [0.19, 0.13, 0.16], [-0.13, 1.59, 0.065], seams).rotation.z = -0.18
  box('collar-right', [0.19, 0.13, 0.16], [0.13, 1.59, 0.065], seams).rotation.z = 0.18
  box('chest-pocket', [0.19, 0.18, 0.045], [-0.19, 1.35, 0.23], seams)
  box('repaired-jacket-patch', [0.15, 0.12, 0.03], [0.19, 1.08, 0.225], packCloth)
  box('neck', [0.19, 0.16, 0.2], [0, 1.64, 0.025], skin)
  sphere('head', [0.41, 0.44, 0.4], [0, 1.84, 0.035], skin)
  box('face-mask', [0.31, 0.13, 0.085], [0, 1.77, 0.22], seams)
  sphere('baseball-cap', [0.45, 0.24, 0.44], [0, 2.015, 0.02], cap)
  box('cap-brim', [0.4, 0.045, 0.28], [0, 1.99, 0.29], cap)

  const backpack = joint('backpack', [0, 1.23, -0.3])
  box('backpack-body', [0.55, 0.64, 0.33], [0, 0, -0.05], packCloth, backpack)
  box('backpack-top-flap', [0.59, 0.12, 0.36], [0, 0.28, -0.055], straps, backpack)
  box('backpack-outer-pocket', [0.4, 0.27, 0.1], [0, -0.12, -0.26], seams, backpack)
  box('pack-reflective-tab', [0.12, 0.055, 0.015], [0, -0.06, -0.32], bandage, backpack)
  for (const side of [-1, 1]) {
    box('shoulder-strap', [0.07, 0.64, 0.055], [side * 0.22, 1.25, 0.245], straps)
    box('strap-over-shoulder', [0.075, 0.045, 0.47], [side * 0.22, 1.585, 0], straps)
    box('pack-compression-strap', [0.045, 0.58, 0.025], [side * 0.19, -0.02, -0.23], straps, backpack)
  }
  box('chest-buckle', [0.43, 0.055, 0.035], [0, 1.33, 0.28], straps)
  box('buckle', [0.07, 0.06, 0.025], [0, 1.33, 0.307], steel)
  box('utility-belt', [0.67, 0.09, 0.45], [0, 0.91, 0], straps)
  box('belt-pouch', [0.18, 0.22, 0.15], [-0.32, 0.85, 0.18], packCloth)
  box('canteen', [0.15, 0.27, 0.16], [0.34, 0.89, -0.14], steel)
  box('canteen-cap', [0.07, 0.045, 0.07], [0.34, 1.045, -0.14], boots)
  box('radio', [0.13, 0.19, 0.09], [0.29, 1.47, 0.25], boots)
  box('radio-antenna', [0.018, 0.19, 0.018], [0.33, 1.65, 0.25], steel)

  const legs = [-1, 1].map((side) => {
    const hip = joint(`hip:${side}`, [side * 0.18, 0.88, 0])
    box(`trouser-thigh:${side}`, [0.27, 0.42, 0.3], [0, -0.2, 0], trousers, hip)
    box(`cargo-pocket:${side}`, [0.07, 0.19, 0.21], [side * 0.16, -0.22, 0], seams, hip)
    const knee = joint(`knee:${side}`, [0, -0.4, 0], hip)
    box(`trouser-shin:${side}`, [0.23, 0.29, 0.25], [0, -0.13, 0], trousers, knee)
    box(`kneepad:${side}`, [0.21, 0.18, 0.08], [0, -0.02, 0.15], seams, knee)
    box(`boot:${side}`, [0.27, 0.19, 0.4], [0, -0.37, 0.075], boots, knee)
    box(`boot-sole:${side}`, [0.28, 0.045, 0.41], [0, -0.455, 0.075], seams, knee)
    return { hip, knee }
  })
  const arms = [-1, 1].map((side) => {
    const shoulder = joint(`shoulder:${side}`, [side * 0.41, 1.49, 0])
    shoulder.rotation.z = side * 0.07
    box(`jacket-sleeve:${side}`, [0.23, 0.36, 0.27], [0, -0.14, 0], jacket, shoulder)
    box(`rolled-cuff:${side}`, [0.24, 0.08, 0.28], [0, -0.3, 0], seams, shoulder)
    const elbow = joint(`elbow:${side}`, [0, -0.32, 0], shoulder)
    elbow.rotation.x = -0.2
    box(`forearm:${side}`, [0.17, 0.22, 0.19], [0, -0.1, 0], skin, elbow)
    if (side === -1) box('forearm-bandage', [0.19, 0.12, 0.21], [0, -0.075, 0], bandage, elbow)
    box(`work-glove:${side}`, [0.19, 0.17, 0.22], [0, -0.27, 0.025], boots, elbow)
    return shoulder
  })

  const shadow = MeshBuilder.CreateDisc('player-contact-shadow', { radius: 0.48, tessellation: 24 }, scene)
  shadow.rotation.x = Math.PI / 2
  shadow.material = material('contact-shadow', '#0c1514')
  shadow.material.alpha = 0.35
  shadow.material.backFaceCulling = false
  shadow.isPickable = false
  let time = 0, gait = 0, stride = 0
  return {
    root,
    update(dt, moving, height, running = false) {
      time += dt
      stride += ((moving ? 1 : 0) - stride) * Math.min(1, dt * 14)
      if (moving) gait += dt * (running ? 18 : 12)
      root.position.y = height
      rig.position.y = Math.sin(gait * 2) * 0.018 * stride
      rig.rotation.x = (running ? 0.16 : 0.045) * stride
      backpack.rotation.x = Math.sin(gait + 0.4) * 0.035 * stride
      for (let index = 0; index < 2; index += 1) {
        const swing = Math.sin(gait + index * Math.PI)
        legs[index].hip.rotation.x = swing * (running ? 0.65 : 0.42) * stride
        legs[index].knee.rotation.x = Math.max(0, -swing) * 0.38 * stride
        arms[index].rotation.x = -swing * (running ? 0.55 : 0.32) * stride - 0.06
      }
      // 静止时仅轻微呼吸，不改变根节点坐标或存档位置。
      const breathing = Math.sin(time * 2) * 0.002 * (1 - stride)
      rig.scaling.y = HUMAN_SCALE.playerModelScale * (1 + breathing)
      shadow.position.set(root.position.x, height + 0.035, root.position.z)
    },
    dispose() {
      root.dispose()
      shadow.dispose()
      materials.forEach((mat) => mat.dispose())
    },
  }
}
