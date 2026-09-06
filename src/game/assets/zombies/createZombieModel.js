import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'

// 米制、脚底原点、朝向 +Z；与玩家共用 root/update/dispose 接口。
export function createZombieModel(scene, definition) {
  const d = definition, prefix = `zombie:${d.id}`
  const root = new TransformNode(prefix, scene), rig = new TransformNode(`${prefix}:rig`, scene)
  rig.parent = root
  const materials = {}, meshes = []
  for (const [name, color] of Object.entries({ skin: d.skin, cloth: d.cloth, pants: d.pants, accent: d.accent, dark: '#29332e', eyes: '#c3c5a4' })) {
    const mat = new StandardMaterial(`${prefix}:${name}`, scene)
    mat.diffuseColor = Color3.FromHexString(color); mat.specularColor = Color3.Black()
    materials[name] = mat
  }
  const joint = (name, position, parent = rig) => {
    const node = new TransformNode(`${prefix}:${name}`, scene)
    node.parent = parent; node.position.set(...position)
    return node
  }
  const part = (name, size, at, color, parent = rig, shape = 'box') => {
    const mesh = shape === 'sphere'
      ? MeshBuilder.CreateSphere(`${prefix}:${name}`, { diameter: 1, segments: 3 }, scene)
      : MeshBuilder.CreateBox(`${prefix}:${name}`, { size: 1 }, scene)
    mesh.parent = parent; mesh.scaling.set(...size); mesh.position.set(...at)
    mesh.material = materials[color]; mesh.isPickable = false; meshes.push(mesh)
    return mesh
  }
  const crawling = Boolean(d.crawler)
  const torso = joint('torso', [0, crawling ? 0.42 : 1.16, 0])
  torso.scaling.x = d.build
  torso.scaling.z = Math.max(0.85, d.build)
  part('chest', [0.5, crawling ? 0.34 : 0.56, crawling ? 0.65 : 0.38], [0,0,0], 'cloth', torso)
  part('torn-hem-left', [0.22,0.16,0.38], [-0.14,-0.31,0], 'cloth', torso).rotation.z = 0.12
  part('torn-hem-right', [0.18,0.1,0.37], [0.16,-0.3,0], 'accent', torso).rotation.z = -0.15
  const head = joint('head', [0, crawling ? 0.6 : 1.64 + (d.neck || 0), crawling ? 0.47 : 0.09])
  part('neck', [0.17,0.22+(d.neck||0),0.17], [0,-0.2,0], 'skin', head)
  part('head', [0.35,0.4,0.36], [0,0,0], 'skin', head, 'sphere')
  part('jaw', [0.24,0.1,0.24], [0,-0.15,0.045], 'skin', head)
  for (const side of [-1,1]) {
    part(`eye-socket:${side}`, [0.1,0.06,0.025], [side*0.09,0.035,0.168], 'dark', head)
    part(`eye:${side}`, [0.035,0.023,0.015], [side*0.09,0.03,0.187], 'eyes', head)
  }
  part('mouth', [0.15,0.035,0.025], [0,-0.11,0.18], 'dark', head)
  const arms = [-1,1].map(side => {
    const arm = joint(`arm:${side}`, [side*0.34*d.build,crawling?0.5:1.37,crawling?0.26:0])
    part('sleeve', [0.21,0.29,0.25], [0,-0.13,0], 'cloth', arm)
    part('exposed-arm', [0.15,0.31,0.17], [0,-0.4,0.06], 'skin', arm)
    part('hand', [0.18,0.16,0.12], [0,-0.61,0.12], 'skin', arm)
    part('fingers', [0.15,0.12,0.06], [0,-0.72,0.14], 'skin', arm)
    return arm
  })
  const legs = [-1,1].map(side => {
    const leg = joint(`leg:${side}`, [side*0.16*d.build,crawling?0.35:0.83,crawling?-0.25:0])
    part('thigh', [0.24,0.4,0.28], [0,-0.19,0], 'pants', leg)
    part('shin', [0.19,0.32,0.21], [0,-0.53,0.035], 'pants', leg)
    part('boot', [0.24,0.16,0.34], [0,-0.75,0.075], 'dark', leg)
    return leg
  })
  const anchors = { torso, head, leftArm: arms[0], rightArm: arms[1] }
  for (const [index, item] of d.parts.entries()) part(`detail:${index}`, item.size, item.at, item.color, anchors[item.anchor], item.shape)
  let time = 0
  function pose(moving = false, running = false) {
    const stride = moving ? (running ? 0.5 : 0.24) : 0
    torso.rotation.x = crawling ? 0 : d.lean + Math.sin(time*1.5)*0.018
    head.rotation.z = Math.sin(time*0.8)*0.06 + (d.id === 'wanderer' ? 0.13 : 0)
    head.rotation.x = d.id === 'howler' ? -0.3 + Math.sin(time*1.7)*0.08 : 0.08
    for (let i=0;i<2;i++) {
      const swing = Math.sin(time*d.gait*(running?1.6:1)+i*Math.PI)
      arms[i].rotation.x = -(crawling ? 0.72 : d.armReach) + swing*(stride+0.035)
      arms[i].rotation.z = (i?1:-1)*(d.id === 'howler' ? 0.38 : 0.1)
      legs[i].rotation.x = crawling ? 1.25 + swing*stride*0.3 : swing*stride*(i?0.7:1)
      legs[i].rotation.z = (i?1:-1)*(crawling?0.16:0.025)
    }
  }
  pose()
  // 帽子、爬姿也计入实际总高；不同变种保持同一米制标尺。
  let min = Infinity, max = -Infinity
  for (const mesh of meshes) {
    mesh.computeWorldMatrix(true)
    const bounds = mesh.getBoundingInfo().boundingBox
    min = Math.min(min,bounds.minimumWorld.y); max = Math.max(max,bounds.maximumWorld.y)
  }
  const scale = d.height/(max-min)
  rig.scaling.setAll(scale); rig.position.y = -min*scale
  return {
    root,
    update(dt, moving, height, running = false) { time += dt; root.position.y = height; pose(moving,running) },
    dispose() { root.dispose(); Object.values(materials).forEach(material => material.dispose()) },
  }
}
