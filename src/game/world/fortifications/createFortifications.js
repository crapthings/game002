import { createTopographySampler } from '../generation/topography.js'

export const FORT = Object.freeze({ halfExtent: 192, wallWidth: 8, wallHeight: 12, gateWidth: 12 })

export function createFortifications(topography) {
  const h = FORT.halfExtent
  const terrain = createTopographySampler(topography)
  const elevation = Math.round([[h,0],[-h,0],[0,h],[0,-h]].reduce((sum,p) => sum + terrain.base(...p).height, 0) / 4 * 10) / 10
  const placements = [], walls = [], gates = [], colliders = []
  const sides = [
    { id: 'north', name: '玄武门', x: 0, z: h, rotation: 0 },
    { id: 'east', name: '青龙门', x: h, z: 0, rotation: Math.PI / 2 },
    { id: 'south', name: '朱雀门', x: 0, z: -h, rotation: Math.PI },
    { id: 'west', name: '白虎门', x: -h, z: 0, rotation: -Math.PI / 2 },
  ]
  const place = (assetId, id, x, z, rotation) => {
    const item = { id, assetId, position: [x, elevation, z], rotation, scale: 1, fortification: true }
    placements.push(item)
    return item
  }
  const collider = (item, offsetX, width, depth) => {
    colliders.push({ x: item.position[0] + Math.cos(item.rotation) * offsetX, z: item.position[2] - Math.sin(item.rotation) * offsetX, rotation: item.rotation, halfWidth: width / 2, halfDepth: depth / 2 })
  }
  for (const side of sides) {
    const gate = place('fort.gate', `fort/${side.id}/gate`, side.x, side.z, side.rotation)
    gates.push({ id: gate.id, name: side.name, x: side.x, z: side.z, rotation: side.rotation })
    // 左右城台分开，中央十二米通道没有平面碰撞体。
    collider(gate, -12, 12, 20); collider(gate, 12, 12, 20)
    for (const sign of [-1, 1]) for (let index = 0; index < 6; index++) {
      const offset = sign * (index < 5 ? 32 + index * 32 : 184)
      const length = index < 5 ? 32 : 16
      const x = side.x + Math.cos(side.rotation) * offset, z = side.z - Math.sin(side.rotation) * offset
      const item = place(index < 5 ? 'fort.wall' : 'fort.wall-short', `fort/${side.id}/wall/${sign}/${index}`, x, z, side.rotation)
      collider(item, 0, length, FORT.wallWidth)
      walls.push({ x, z, rotation: side.rotation, length, width: FORT.wallWidth })
    }
  }
  for (const x of [-h, h]) for (const z of [-h, h]) {
    const item = place('fort.corner', `fort/corner/${x}/${z}`, x, z, 0)
    collider(item, 0, 20, 20)
  }
  return { version: 1, halfExtent: h, elevation, placements, walls, gates, colliders }
}

// 墙基与角楼使用连续平整带，门前留宽阔缓坡；不改变城内外其余地貌。
export function fortificationGround(fort, x, z, naturalHeight) {
  if (!fort) return naturalHeight
  const edgeDistance = Math.abs(Math.max(Math.abs(x), Math.abs(z)) - fort.halfExtent)
  const gateApproach = Math.min(Math.abs(x), Math.abs(z)) < 15
  const flat = gateApproach ? 18 : 12, blend = 16
  const t = Math.max(0, Math.min(1, (edgeDistance - flat) / blend))
  const weight = 1 - t * t * (3 - 2 * t)
  return naturalHeight * (1 - weight) + fort.elevation * weight
}
export function fortificationClearance(fort, x, z) {
  if (!fort) return false
  const edgeDistance = Math.abs(Math.max(Math.abs(x), Math.abs(z)) - fort.halfExtent)
  return edgeDistance < 17 || (Math.min(Math.abs(x), Math.abs(z)) < 18 && edgeDistance < 38)
}
export function blocksFortification(fort, x, z, radius) {
  return fort?.colliders.some(b => {
    const dx = x - b.x, dz = z - b.z
    if (Math.hypot(dx, dz) > Math.hypot(b.halfWidth, b.halfDepth) + radius) return false
    const c = Math.cos(b.rotation), s = Math.sin(b.rotation)
    return Math.abs(dx*c-dz*s) < b.halfWidth+radius && Math.abs(dx*s+dz*c) < b.halfDepth+radius
  }) ?? false
}
