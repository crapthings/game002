import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { HUMAN_SCALE } from '../world/worldMetrics.js'

// 面向 +Z、脚底为根原点；空手侠客，身体翻滚与物理根节点分离。
export function createPlayer(scene) {
  const root = new TransformNode('player', scene)
  const rig = new TransformNode('xia-ke-rig', scene)
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
  const cloth = material('ink-teal-linen', '#293e3e')
  const folds = material('linen-folds', '#3f5653')
  const cloak = material('charcoal-cloak', '#202626')
  cloak.backFaceCulling = false
  const cloakEdge = material('cloak-weathered-edge', '#3b4240')
  cloakEdge.backFaceCulling = false
  const hair = material('tied-black-hair', '#171b1b')
  const straw = material('bamboo-straw', '#a68149')
  const weave = material('straw-woven-ribs', '#c6a269')
  const darkStraw = material('straw-dark-binding', '#705636')
  const skin = material('xia-ke-skin', '#ba9475')
  const linen = material('unbleached-linen', '#b1ab93')
  const leather = material('dark-wrist-wraps', '#39332c')
  function joint(name, position, parent = rig) {
    const node = new TransformNode(name, scene)
    node.parent = parent; node.position.set(...position)
    return node
  }
  const tumble = joint('air-somersault-pivot', [0, 1.05, 0])
  const body = joint('xia-ke-body', [0, -1.05, 0], tumble)
  function finish(mesh, position, mat, parent = body) {
    mesh.parent = parent; mesh.position.set(...position); mesh.material = mat; mesh.isPickable = false
    return mesh
  }
  function box(name, size, position, mat, parent = body) {
    return finish(MeshBuilder.CreateBox(name, { width: size[0], height: size[1], depth: size[2] }, scene), position, mat, parent)
  }
  function sphere(name, size, position, mat, parent = body) {
    const mesh = finish(MeshBuilder.CreateSphere(name, { diameter: 1, segments: 5 }, scene), position, mat, parent)
    mesh.scaling.set(...size)
    return mesh
  }
  function cone(name, height, top, bottom, position, mat, parent = body, tessellation = 12) {
    return finish(MeshBuilder.CreateCylinder(name, { height, diameterTop: top, diameterBottom: bottom, tessellation }, scene), position, mat, parent)
  }
  function line(name, points, radius, mat, parent = body) {
    return finish(MeshBuilder.CreateTube(name, { path: points.map(p => new Vector3(...p)), radius, tessellation: 4 }, scene), [0, 0, 0], mat, parent)
  }
  function panel(name, rows, mat, parent) {
    return finish(MeshBuilder.CreateRibbon(name, { pathArray: rows.map(row => row.map(p => new Vector3(...p))), sideOrientation: Mesh.DOUBLESIDE }, scene), [0, 0, 0], mat, parent)
  }

  const torso = cone('cross-collar-robe', 0.65, 0.62, 0.5, [0, 1.23, 0], cloth)
  torso.scaling.z = 0.66
  box('inner-linen-collar', [0.22, 0.24, 0.045], [0, 1.49, 0.203], linen)
  box('crossed-lapel-left', [0.075, 0.4, 0.055], [-0.045, 1.39, 0.232], folds).rotation.z = -0.48
  box('crossed-lapel-right', [0.085, 0.32, 0.06], [0.075, 1.43, 0.24], cloth).rotation.z = 0.5
  const belt = cone('wrapped-cloth-sash', 0.13, 0.57, 0.57, [0, 0.94, 0], leather)
  belt.scaling.z = 0.74
  box('sash-knot', [0.14, 0.1, 0.12], [-0.22, 0.94, 0.19], folds).rotation.z = -0.2
  box('neck', [0.18, 0.16, 0.18], [0, 1.62, 0.02], skin)
  sphere('face', [0.34, 0.4, 0.34], [0, 1.8, 0.025], skin)
  sphere('hair-crown', [0.38, 0.32, 0.35], [0, 1.9, -0.035], hair)
  box('nose', [0.055, 0.1, 0.08], [0, 1.8, 0.203], skin)
  for (const side of [-1, 1]) {
    box(`eyebrow:${side}`, [0.092, 0.018, 0.025], [side * 0.09, 1.864, 0.182], hair).rotation.z = side * 0.08
    box(`eye:${side}`, [0.046, 0.016, 0.015], [side * 0.087, 1.827, 0.19], hair)
    sphere(`ear:${side}`, [0.065, 0.12, 0.08], [side * 0.173, 1.8, 0], skin)
    line(`loose-hair:${side}`, [[side * 0.16, 1.96, 0], [side * 0.19, 1.71, 0.02], [side * 0.16, 1.52, -0.035]], 0.022, hair)
  }
  const ponytail = joint('long-tied-hair', [0, 1.86, -0.17], body)
  sphere('hair-knot', [0.22, 0.18, 0.2], [0, -0.02, -0.03], hair, ponytail)
  cone('hair-tie', 0.055, 0.17, 0.17, [0, -0.14, -0.04], leather, ponytail)
  for (let i = 0; i < 4; i++) {
    line(`hair-lock:${i}`, [[(i - 1.5) * 0.045, -0.12, -0.04], [(i - 1.5) * 0.06, -0.4, -0.13], [(i - 1.5) * 0.045, -0.66, -0.1]], 0.032, hair, ponytail)
  }

  const hat = joint('wide-straw-hat', [0, 1.925, 0], body)
  hat.rotation.x = -0.065
  cone('woven-conical-hat', 0.205, 0.16, 1.22, [0, 0.103, 0], straw, hat, 32)
  const hatDetails = []
  for (let ring = 0; ring < 7; ring++) {
    const radius = 0.6 - ring * 0.075
    hatDetails.push(finish(MeshBuilder.CreateTorus(`hat-weave:${ring}`, { diameter: radius * 2, thickness: ring === 0 ? 0.025 : 0.012, tessellation: 32 }, scene), [0, (0.61 - radius) / 0.53 * 0.205 + 0.006, 0], ring % 2 ? weave : darkStraw, hat))
  }
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI / 12
    hatDetails.push(line(`hat-rib:${i}`, [[Math.cos(a) * 0.085, 0.21, Math.sin(a) * 0.085], [Math.cos(a) * 0.6, 0.012, Math.sin(a) * 0.6]], 0.008, weave, hat))
  }
  // 固定编织细节合并，避免每根竹篾单独提交绘制。
  for (const mesh of hatDetails) mesh.computeWorldMatrix(true)
  const woven = Mesh.MergeMeshes(hatDetails, true, true, undefined, false, true)
  if (woven) {
    woven.setParent(hat)
    woven.isPickable = false
    if (woven.material?.subMaterials) materials.push(woven.material)
  }
  for (const side of [-1, 1]) line(`hat-cord:${side}`, [[side * 0.27, 1.95, 0.03], [side * 0.18, 1.64, 0.12], [side * 0.025, 1.56, 0.16]], 0.009, darkStraw)

  const cape = joint('split-travel-cloak', [0, 1.51, -0.23], body)
  // 连续底层连接分片，摆动时仍保持完整披风轮廓。
  panel('cloak-continuous-lining', [
    [[-0.435, 0, 0.018], [0.435, 0, 0.018]],
    [[-0.475, -0.48, -0.055], [0.475, -0.48, -0.055]],
    [[-0.56, -1.1, -0.12], [0.56, -1.1, -0.12]],
  ], cloak, cape)
  const capePanels = []
  for (let i = 0; i < 5; i++) {
    const strip = joint(`cape-strip:${i}`, [0, 0, 0], cape)
    const a = (i / 5 - 0.5), b = ((i + 1) / 5 - 0.5)
    const hem = -1.19 + Math.abs(i - 2) * 0.045
    panel(`cloak-fold:${i}`, [
      [[a * 0.87, 0, 0], [b * 0.87, 0, 0]],
      [[a * 0.95, -0.48, -0.075], [b * 0.95, -0.48, -0.09]],
      [[a * 1.12, hem, -0.17], [b * 1.12, hem - 0.025, -0.14]],
    ], i % 2 ? cloakEdge : cloak, strip)
    capePanels.push(strip)
  }
  for (const side of [-1, 1]) {
    sphere(`cloak-shoulder:${side}`, [0.38, 0.17, 0.48], [side * 0.29, 1.53, -0.035], cloak)
  }
  const skirts = [-1, 1].map(side => {
    const hem = joint(`split-robe:${side}`, [side * 0.13, 0.94, 0.05], body)
    panel(`robe-skirt:${side}`, [
      [[-0.14, 0, 0.15], [0.14, 0, 0.15]],
      [[-0.21, -0.55, 0.12], [0.21, -0.52, 0.12]],
    ], cloth, hem)
    return hem
  })
  const sash = joint('loose-sash-end', [-0.23, 0.91, 0.24], body)
  box('sash-tail', [0.095, 0.42, 0.025], [0, -0.2, 0], folds, sash)
  const legs = [-1, 1].map(side => {
    const hip = joint(`hip:${side}`, [side * 0.16, 0.88, 0], body)
    cone(`loose-trousers:${side}`, 0.42, 0.27, 0.23, [0, -0.2, 0], cloak, hip)
    const knee = joint(`knee:${side}`, [0, -0.4, 0], hip)
    cone(`wrapped-shin:${side}`, 0.29, 0.2, 0.16, [0, -0.145, 0], leather, knee)
    for (let wrap = 0; wrap < 3; wrap++) cone(`shin-binding:${side}:${wrap}`, 0.026, 0.205 - wrap * 0.012, 0.205 - wrap * 0.012, [0, -0.055 - wrap * 0.085, 0], linen, knee)
    box(`cloth-shoe:${side}`, [0.22, 0.16, 0.34], [0, -0.39, 0.06], cloak, knee)
    box(`cloth-sole:${side}`, [0.23, 0.035, 0.35], [0, -0.462, 0.06], leather, knee)
    return { hip, knee }
  })
  const arms = [-1, 1].map(side => {
    const shoulder = joint(`shoulder:${side}`, [side * 0.36, 1.47, 0], body)
    cone(`wide-sleeve:${side}`, 0.36, 0.26, 0.3, [0, -0.15, 0], cloth, shoulder)
    cone(`linen-cuff:${side}`, 0.095, 0.305, 0.275, [0, -0.29, 0], linen, shoulder)
    const elbow = joint(`elbow:${side}`, [0, -0.33, 0], shoulder)
    cone(`wrist-guard:${side}`, 0.23, 0.19, 0.16, [0, -0.105, 0], leather, elbow)
    for (let wrap = 0; wrap < 3; wrap++) cone(`wrist-binding:${side}:${wrap}`, 0.025, 0.193 - wrap * 0.008, 0.193 - wrap * 0.008, [0, -0.025 - wrap * 0.07, 0], cloakEdge, elbow)
    sphere(`empty-hand:${side}`, [0.16, 0.19, 0.16], [0, -0.28, 0.018], skin, elbow)
    return { shoulder, elbow, side }
  })
  const shadow = MeshBuilder.CreateDisc('player-contact-shadow', { radius: 0.43, tessellation: 24 }, scene)
  shadow.rotation.x = Math.PI / 2
  shadow.material = material('contact-shadow', '#0c1514')
  shadow.material.alpha = 0.3
  shadow.material.backFaceCulling = false
  shadow.isPickable = false
  let time = 0, gait = 0, stride = 0, landing = 0
  return {
    root,
    update(dt, moving, height, running = false, motion = {}) {
      time += dt
      const airborne = motion.grounded === false
      const flip = airborne && motion.flipProgress !== null && motion.flipProgress !== undefined ? motion.flipProgress : null
      const tuck = flip === null ? 0 : Math.sin(Math.PI * flip) ** 2
      if (motion.landed) landing = Math.min(0.15, motion.landingImpact * 0.012)
      landing *= Math.exp(-dt * 15)
      stride += ((moving && !airborne ? 1 : 0) - stride) * (1 - Math.exp(-dt * 14))
      if (moving && !airborne) gait += dt * (running ? 18 : 12)
      root.position.y = height
      rig.position.y = Math.sin(gait * 2) * 0.018 * stride - landing
      rig.rotation.x = airborne ? 0.04 : (running ? 0.12 : 0.035) * stride + landing * 0.7
      // 翻滚围绕腰部旋转，根节点与镜头保持直立；落地即恢复站姿。
      tumble.rotation.x = flip === null ? 0 : Math.PI * 2 * (flip * flip * (3 - 2 * flip))
      for (let index = 0; index < 2; index++) {
        const swing = Math.sin(gait + index * Math.PI)
        legs[index].hip.rotation.x = airborne ? -0.3 - tuck * 0.95 + index * 0.18 : swing * (running ? 0.65 : 0.42) * stride - landing
        legs[index].knee.rotation.x = airborne ? 0.45 + tuck * 1.05 : Math.max(0, -swing) * 0.45 * stride + landing * 2
        arms[index].shoulder.rotation.x = airborne ? -0.6 - tuck * 0.7 : -swing * (running ? 0.55 : 0.32) * stride - 0.08
        arms[index].shoulder.rotation.z = arms[index].side * (airborne ? 0.25 * (1 - tuck) : 0.09)
        arms[index].elbow.rotation.x = -0.25 - tuck * 0.95 - (running ? 0.35 * stride : 0)
        skirts[index].rotation.x = -Math.max(0, swing) * 0.16 * stride - (airborne ? 0.28 : 0)
      }
      cape.rotation.x = 0.04 + stride * (running ? 0.28 : 0.12) + (airborne ? 0.32 : 0) + tuck * 0.25
      for (let index = 0; index < capePanels.length; index++) {
        capePanels[index].rotation.x = Math.sin(time * 5 + index * 0.8) * (0.022 + stride * 0.045 + (airborne ? 0.055 : 0))
      }
      ponytail.rotation.x = 0.06 + stride * 0.2 + Math.sin(time * 4) * 0.025 + tuck * 0.25
      sash.rotation.x = Math.sin(gait + 0.7) * 0.15 * stride + (airborne ? -0.35 : 0)
      rig.scaling.y = HUMAN_SCALE.playerModelScale * (1 + Math.sin(time * 2) * 0.002 * (1 - stride))
      const altitude = motion.heightAboveGround ?? 0
      shadow.position.set(root.position.x, (motion.groundHeight ?? height) + 0.035, root.position.z)
      shadow.scaling.setAll(1 + Math.min(altitude, 4) * 0.12)
      shadow.material.alpha = 0.3 / (1 + altitude * 0.65)
    },
    dispose() {
      root.dispose(); shadow.dispose()
      materials.forEach(mat => mat.dispose())
    },
  }
}
