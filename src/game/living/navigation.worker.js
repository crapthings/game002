import { canMoveInWorld } from '../world/chunks/movementQuery.js'
import { localRoute } from './geometry.js'
import { createCollisionIndex, fortificationBodies } from '../world/chunks/collisionIndex.js'

let plan
const loaded = new Map()
const collisionIndex = createCollisionIndex()
self.onmessage = ({ data }) => {
  if (data.type === 'init') { plan = data.plan; collisionIndex.replace('fortifications', fortificationBodies(plan.fortifications)); return }
  if (data.type === 'chunk') { loaded.set(data.key, data.entry); collisionIndex.replace(data.key, data.entry.colliders); return }
  if (data.type === 'remove') { loaded.delete(data.key); collisionIndex.remove(data.key); return }
  if (data.type !== 'route') return
  try {
    const path = localRoute(data.start, data.target, (x, z) => canMoveInWorld(plan, loaded, x, z, .36, collisionIndex))
    self.postMessage({ id: data.id, path })
  } catch (error) {
    self.postMessage({ id: data.id, path: [], error: error.message })
  }
}
