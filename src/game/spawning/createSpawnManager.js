import { createCharacterModel } from '../assets/characters/createCharacterModel.js'
import { isVisible } from '../map/visibility.js'
import { getSpawnPlan, buildingBlocksSegment } from './createSpawnPlan.js'

export const SPAWN_LIMITS = Object.freeze({ prepare:64,unload:96,active:32 })

export function createSpawnManager(scene, plan, world) {
  const points=getSpawnPlan(plan).points, buildings=plan.settlements.flatMap(town=>town.placements)
  const buckets = new Map(), bucketSize = 32
  for (const point of points) {
    const key = `${Math.floor(point.x / bucketSize)},${Math.floor(point.z / bucketSize)}`
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(point)
  }
  const active=new Map(), blocked=new Set()
  let stats={active:0,visible:0,planned:points.length,deferred:0}
  return {
    update(dt,position,heading,vision,progress,{initial=false,paused=false}={}) {
      const prepareRange = Math.min(SPAWN_LIMITS.prepare, world.getViewDistance())
      const unloadRange = Math.min(SPAWN_LIMITS.unload, world.getViewDistance() + 16)
      const dead=new Set(progress.killedZombieIds || [])
      const range=point=>Math.hypot(point.x-position.x,point.z-position.z)
      const visible=point=>range(point)<=world.getViewDistance() && isVisible(point.x-position.x,point.z-position.z,heading,vision) && !buildings.some(b=>buildingBlocksSegment(b,[position.x,position.z],[point.x,point.z]))
      for (const [id,entry] of active) {
        if (dead.has(id) || range(entry.point)>unloadRange) { entry.model.dispose();active.delete(id) }
      }
      const nearby = []
      for (let z = Math.floor((position.z - prepareRange) / bucketSize); z <= Math.floor((position.z + prepareRange) / bucketSize); z++) {
        for (let x = Math.floor((position.x - prepareRange) / bucketSize); x <= Math.floor((position.x + prepareRange) / bucketSize); x++) {
          nearby.push(...(buckets.get(`${x},${z}`) || []))
        }
      }
      const candidates=nearby.filter(p=>range(p)<=prepareRange && !dead.has(p.id) && !blocked.has(p.id) && !active.has(p.id)).sort((a,b)=>range(a)-range(b)||a.id.localeCompare(b.id))
      let pending=0,deferred=0,created=0
      for (const point of candidates) {
        if (!world.isLoaded(point.x,point.z)) continue
        if (!world.canMove(point.x,point.z,0.8)) { blocked.add(point.id);continue }
        // 正常游玩时，错过预热的可见点必须延迟，不能补刷到眼前。
        if (!initial && visible(point)) { deferred++;continue }
        if (active.size>=SPAWN_LIMITS.active) {
          const farthest=[...active.values()].filter(e=>!visible(e.point)&&range(e.point)>prepareRange).sort((a,b)=>range(b.point)-range(a.point))[0]
          if (farthest) { farthest.model.dispose();active.delete(farthest.point.id) }
          else continue
        }
        if (paused) continue
        if (created>=1) { pending++;continue }
        const model=createCharacterModel(scene,point.assetId)
        model.root.setEnabled(false)
        model.root.position.set(point.x,world.terrain.surfaceHeight(point.x,point.z),point.z)
        model.root.rotation.y=point.rotation
        active.set(point.id,{point,model,meshes:model.root.getChildMeshes(),fade:0})
        created++
      }
      let visibleCount=0
      for (const entry of active.values()) {
        const show=!initial && visible(entry.point)
        entry.model.root.setEnabled(show)
        if (show) {
          visibleCount++;entry.fade=Math.min(1,entry.fade+dt*6)
          for (const mesh of entry.meshes) mesh.visibility=entry.fade
          entry.model.update(dt,false,entry.model.root.position.y)
        } else entry.fade=0
      }
      stats={active:active.size,visible:visibleCount,planned:points.length,deferred}
      return { ready:pending===0, ...stats }
    },
    getStats:()=>stats,
    dispose() { for (const entry of active.values()) entry.model.dispose();active.clear() },
  }
}
