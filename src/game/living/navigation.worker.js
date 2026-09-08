import { canMoveInWorld } from '../world/chunks/movementQuery.js'
import { createTerrain } from '../world/chunks/terrain.js'
import { generateNavigationGeometry, plannedPlacementIndex } from '../world/chunks/chunkGeometry.js'
import { localRoute } from './geometry.js'
import { createCityRouteGraph } from './cityRouteGraph.js'
import { createCollisionIndex, fortificationBodies } from '../world/chunks/collisionIndex.js'

let plan, terrain, overlays, graph
const rendered = new Map(), resident = new Map(), loaded = new Map()
const collisionIndex = createCollisionIndex()
function sync(key) {
  const entry = rendered.get(key) ?? resident.get(key)
  if (entry) { loaded.set(key, entry); collisionIndex.replace(key, entry.colliders) }
  else { loaded.delete(key); collisionIndex.remove(key) }
}
self.onmessage = ({ data }) => {
  if (data.type === 'init') { plan = data.plan; collisionIndex.replace('fortifications', fortificationBodies(plan.fortifications)); return }
  if (data.type === 'chunk' || data.type === 'resident') {
    (data.type === 'chunk' ? rendered : resident).set(data.key, data.entry); sync(data.key); return
  }
  if (data.type === 'remove' || data.type === 'release') {
    (data.type === 'remove' ? rendered : resident).delete(data.key); sync(data.key); return
  }
  if (!['route', 'local-route', 'city-route', 'geometry'].includes(data.type)) return
  try {
    if (data.type === 'geometry') {
      if (!/^-?\d+,-?\d+$/.test(data.key)) throw new Error('无效导航区块')
      terrain ??= createTerrain(plan.seed, plan.settlements ?? [], plan)
      overlays ??= plannedPlacementIndex(plan)
      const [x, z] = data.key.split(',').map(Number)
      // An expired request must not retain unbounded geometry in the worker.
      const entry = generateNavigationGeometry(terrain, x, z, overlays)
      self.postMessage({ id: data.id, result: { status: 'ready', entry } }); return
    }
    if (data.type === 'city-route') {
      graph ??= createCityRouteGraph(plan)
      self.postMessage({ id: data.id, result: graph.route(data.start, data.target, data.options) }); return
    }
    const path = localRoute(data.start, data.target, (x, z) => canMoveInWorld(plan, loaded, x, z, .36, collisionIndex))
    if(data.type==='local-route'){self.postMessage({id:data.id,result:{status:path.length?'ready':'blocked',reason:path.length?null:'LOCAL_ROUTE_BLOCKED',path}});return}
    self.postMessage({ id: data.id, path })
  } catch (error) {
    self.postMessage({ id: data.id, path: [], error: error.message })
  }
}
