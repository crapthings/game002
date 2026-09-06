import { createRandom } from '../world/generation/random.js'
import { zombieCatalog } from '../assets/zombies/catalog.js'
import { compileRoadNetwork, sampleRoad } from '../world/roads/roadGeometry.js'

const cached = new WeakMap()
export function buildingBlocksSegment(building, a, b, padding = 0) {
  const cosine = Math.cos(building.rotation), sine = Math.sin(building.rotation)
  const local = p => {
    const x = p[0] - building.position[0], z = p[1] - building.position[2]
    return [x*cosine-z*sine,x*sine+z*cosine]
  }
  const from = local(a), to = local(b)
  const half = [building.footprint.width * building.scale/2+padding,building.footprint.depth * building.scale/2+padding]
  let enter = 0, leave = 1
  for (let axis=0;axis<2;axis++) {
    const delta=to[axis]-from[axis]
    if (Math.abs(delta)<1e-8) { if (Math.abs(from[axis])>half[axis]) return false }
    else {
      const first=(-half[axis]-from[axis])/delta, second=(half[axis]-from[axis])/delta
      enter=Math.max(enter,Math.min(first,second));leave=Math.min(leave,Math.max(first,second))
    }
  }
  return enter<=leave
}

export function createSpawnPlan(world) {
  const points = [], buildings = world.settlements.flatMap(town=>town.placements)
  const roads = compileRoadNetwork(world.roads || [])
  const inTown = (x,z) => world.settlements.find(town=>x>town.bounds.minX-24 && x<town.bounds.maxX+24 && z>town.bounds.minZ-24 && z<town.bounds.maxZ+24)
  const special = { hospital:'medic',school:'wanderer','fire-station':'firefighter',police:'riot',warehouse:'worker',factory:'hazmat' }
  for (let z=-16;z<16;z++) for (let x=-16;x<16;x++) {
    const random = createRandom(world.seed,'infection-v1',x,z)
    const cx=x*64+12+random()*40, cz=z*64+12+random()*40
    const town=inTown(cx,cz)
    const roadside=!town && sampleRoad(roads,cx,cz).distance<18
    const region=world.regions.find(r=>cx>=r.bounds.minX && cx<r.bounds.maxX && cz>=r.bounds.minZ && cz<r.bounds.maxZ)
    const chance=town?.kind==='city'?0.85:town?0.45:roadside?0.18:0.07
    if (random()>chance) continue
    const count=town?.kind==='city'?2+Math.floor(random()*2):1+Math.floor(random()*2)
    for (let index=0;index<count;index++) {
      const px=cx+(random()-0.5)*12,pz=cz+(random()-0.5)*12
      if (Math.hypot(px-world.spawn[0],pz-world.spawn[1])<40 || points.some(point=>Math.hypot(point.x-px,point.z-pz)<2.2) || buildings.some(b=>buildingBlocksSegment(b,[px,pz],[px,pz],1))) continue
      const zone=town?.kind==='city'?'city':town?'village':roadside?'roadside':region?.biome==='wetland'?'wetland':'forest'
      const pool=zombieCatalog.filter(item=>item.zones.includes(zone))
      let assetId=random()<0.65?'character.zombie.wanderer':pool[Math.floor(random()*pool.length)].assetId
      const nearby=buildings.find(b=>Math.hypot(b.position[0]-px,b.position[2]-pz)<24 && Object.keys(special).some(key=>b.assetId.endsWith(key)))
      if (nearby && random()<0.6) assetId=`character.zombie.${special[Object.keys(special).find(key=>nearby.assetId.endsWith(key))]}`
      points.push({ id:`infected-v1/${x}/${z}/${index}`,assetId,x:px,z:pz,rotation:random()*Math.PI*2,regionId:region.id })
    }
  }
  return { version:1,points }
}

// 旧世界缺少出生规划时使用固定 v1 配方；不修改已保存世界引用。
export function getSpawnPlan(world) {
  if (world.spawnPlan) return world.spawnPlan
  if (!cached.has(world)) cached.set(world,createSpawnPlan(world))
  return cached.get(world)
}
