import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { createAssetRegistry } from '../../assets/createAssetRegistry.js'
import { environmentCatalog } from '../../assets/environment/catalog.js'
import { biomeCatalog } from '../biomes/catalog.js'
import { HUMAN_SCALE } from '../worldMetrics.js'
import { insideWorld } from '../worldConfig.js'
import { townSurface } from '../settlements/createTownPlan.js'
import { createStreetSection } from '../settlements/createStreetSection.js'
import { createTerrain, chunkAt, chunkKey, requiredChunks, CHUNK_SIZE } from './terrain.js'

export function createStreamedWorld(scene, plan, initialViewDistance = 64) {
  const towns = plan.settlements || []
  const terrain = createTerrain(plan.seed, towns, plan)
  const assets = createAssetRegistry(scene)
  const loaded = new Map()
  const material = new StandardMaterial('terrain-material', scene)
  material.diffuseColor = Color3.White()
  material.specularColor = Color3.Black()
  const worker = new Worker(new URL('./chunk.worker.js', import.meta.url), { type: 'module' })
  let center = null, queue = [], wanted = new Map(), required = [], pending = null, prepared = null, assembling = null
  let disposed = false, failure = null
  let viewDistance = initialViewDistance
  let selectionKey = null
  const retired = []
  const warmup = [...new Set([
    ...Object.values(biomeCatalog).flatMap((biome) => biome.assets.map(([id]) => id)),
    ...towns.flatMap((town) => [...town.placements, ...(town.decorations || [])].map((item) => item.assetId)),
    ...plan.regions.flatMap((region) => region.placements.map((item) => item.assetId)),
  ])].filter((id) => !id.startsWith('landmark.'))
  const templateCount = warmup.length
  worker.onmessage = ({ data: message }) => {
    if (disposed) return
    pending = null
    if (message.type === 'error') { failure = new Error(message.message); return }
    if (wanted.has(message.data.key)) prepared = message.data
  }
  worker.onerror = (event) => { event.preventDefault(); failure = new Error(event.message || '世界生成线程启动失败') }
  worker.onmessageerror = () => { failure = new Error('无法读取世界生成线程结果') }
  worker.postMessage({ type: 'init', plan })
  // 区域仅是语义和地标覆盖，不再绘制孤立的圆形区域底座。
  const overrides = new Map()
  for (const region of plan.regions) {
    for (const placement of region.placements) {
      const chunk = chunkAt(placement.position[0], placement.position[2])
      const key = chunkKey(chunk.x, chunk.z)
      if (!overrides.has(key)) overrides.set(key, [])
      overrides.get(key).push({ ...placement, regionId: region.id, planned: true })
    }
  }
  for (const town of towns) {
    for (const placement of town.placements) {
      const chunk = chunkAt(placement.position[0], placement.position[2])
      const key = chunkKey(chunk.x, chunk.z)
      if (!overrides.has(key)) overrides.set(key, [])
      overrides.get(key).push({ ...placement, regionId: town.id, building: true })
    }
  }
  for (const town of towns) {
    for (const placement of town.decorations || []) {
      const chunk = chunkAt(placement.position[0], placement.position[2])
      const key = chunkKey(chunk.x, chunk.z)
      if (!overrides.has(key)) overrides.set(key, [])
      overrides.get(key).push({ ...placement, regionId: town.regionId, decoration: true })
    }
  }
  function* build(chunk, data, root) {
    const mesh = new Mesh(`ground:${chunk.key}`, scene)
    mesh.parent = root
    const vertices = new VertexData()
    vertices.positions = data.positions
    vertices.indices = data.indices
    vertices.colors = data.colors
    vertices.normals = data.normals
    vertices.applyToMesh(mesh)
    mesh.material = material
    mesh.receiveShadows = true
    mesh.metadata = { ground: true, chunkKey: chunk.key }
    yield
    createStreetSection(scene, root, chunk, data, plan.seed)
    yield
    const colliders = []
    for (const placement of data.placements) {
      if (!placement.planned && !placement.building && !placement.decoration && plan.regions.some((region) => region.placements.length > 0 && Math.hypot(placement.position[0] - region.center[0], placement.position[2] - region.center[1]) < region.radius)) continue
      const x = placement.position[0], z = placement.position[2]
      // 不占用出生点；地标代理留待真实交互素材接入。
      const spawn = plan.spawn || [0, 0]
      if (Math.hypot(x - spawn[0], z - spawn[1]) < 3 || placement.assetId.startsWith('landmark.')) continue
      if (!placement.building && !placement.decoration && townSurface(towns, x, z)?.weight > 0.5) continue
      assets.create(placement, root, placement.regionId)
      const definition = environmentCatalog[placement.assetId]
      const footprint = placement.footprint || definition?.footprint
      if (footprint) {
        colliders.push({ x, z, rotation: placement.rotation, halfWidth: footprint.width * placement.scale / 2, halfDepth: footprint.depth * placement.scale / 2 })
      } else {
        const radius = definition?.radius ?? (placement.assetId === 'nature.tree' ? 0.45 : 0.9)
        if (radius > 0) colliders.push({ x, z, radius: radius * placement.scale })
      }
      yield
    }
    root.setEnabled(true)
    const bounds = colliders.reduce((bounds, obstacle) => {
      const reach = obstacle.radius ?? Math.hypot(obstacle.halfWidth, obstacle.halfDepth)
      bounds.minX = Math.min(bounds.minX, obstacle.x - reach)
      bounds.maxX = Math.max(bounds.maxX, obstacle.x + reach)
      bounds.minZ = Math.min(bounds.minZ, obstacle.z - reach)
      bounds.maxZ = Math.max(bounds.maxZ, obstacle.z + reach)
      return bounds
    }, { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity })
    loaded.set(chunk.key, { root, colliders, bounds })
  }
  function update(x, z, budgetMs = 3) {
    if (failure) throw failure
    const started = performance.now()
    const next = chunkAt(x, z)
    center = next
    const radius = Math.ceil((viewDistance + 10) / CHUNK_SIZE)
    const nextSelectionKey = `${center.x},${center.z},${radius}`
    if (selectionKey !== nextSelectionKey) {
      selectionKey = nextSelectionKey
      const inBounds = chunk => insideWorld(plan.bounds, (chunk.x + 0.5) * CHUNK_SIZE, (chunk.z + 0.5) * CHUNK_SIZE)
      required = requiredChunks(center, radius).filter(inBounds)
      wanted = new Map(required.map(chunk => [chunk.key, chunk]))
    }
    queue = [...wanted.values()].filter((chunk) => !loaded.has(chunk.key) && chunk.key !== pending?.key && chunk.key !== prepared?.key && chunk.key !== assembling?.key)
    if (prepared && !wanted.has(prepared.key)) prepared = null
    if (assembling && !wanted.has(assembling.key)) {
      assembling.iterator.return()
      retired.push(assembling.root)
      assembling = null
    }
    for (const [key, entry] of loaded) {
      entry.root.setEnabled(wanted.has(key))
      const [cx, cz] = key.split(',').map(Number)
      if (Math.abs(cx - center.x) > radius + 1 || Math.abs(cz - center.z) > radius + 1) {
        entry.root.setEnabled(false)
        retired.push(entry.root)
        loaded.delete(key)
      }
    }
    // 最多一个计算任务和一个待安装结果，防止 Worker 消息与 GPU 上传堆积。
    if (!pending && !prepared && queue.length) {
      pending = queue.shift()
      worker.postMessage({ type: 'generate', chunk: pending, placements: overrides.get(pending.key) || [] })
    }
    if (!assembling && prepared) {
      const data = prepared
      prepared = null
      const root = new TransformNode(`chunk:${data.key}`, scene)
      root.setEnabled(false)
      assembling = { key: data.key, root, iterator: build(data, data, root) }
    }
    // 首次加载逐帧预热世界会用到的模板，避免进入新街区才首次合并建筑模型。
    if (warmup.length && performance.now() - started < budgetMs) assets.prepare(warmup.shift())
    // 每一步仅做地面、道路上传或一个资产实例；预算是软上限，单个 GPU 操作不可中断。
    let steps = 0
    while (assembling && performance.now() - started < budgetMs && steps < 8) {
      steps += 1
      if (assembling.iterator.next().done) assembling = null
    }
    if (retired.length && performance.now() - started < budgetMs) retired.shift().dispose()
  }
  return {
    terrain,
    update,
    setViewDistance(value) { viewDistance = value },
    getViewDistance: () => viewDistance,
    getStats: () => ({ loaded: loaded.size, queued: required.filter((chunk) => !loaded.has(chunk.key)).length, required: required.length, ready: required.filter((chunk) => loaded.has(chunk.key)).length, templatesReady: templateCount - warmup.length, templatesTotal: templateCount, pending: Boolean(pending), assembling: Boolean(assembling), center }),
    // 所有导航与移动共用这层检查，不依赖美术模型的三角面。
    isLoaded(x,z) { const at=chunkAt(x,z); return loaded.has(chunkKey(at.x,at.z)) },
    canMove(x, z, radius = HUMAN_SCALE.collisionRadius) {
      if (!insideWorld(plan.bounds, x, z, 1)) return false
      const at = chunkAt(x, z)
      if (!loaded.has(chunkKey(at.x, at.z))) return false
      for (const entry of loaded.values()) {
        const b = entry.bounds
        if (x + radius < b.minX || x - radius > b.maxX || z + radius < b.minZ || z - radius > b.maxZ) continue
        if (entry.colliders.some((obstacle) => {
          const dx = x - obstacle.x, dz = z - obstacle.z
          if (obstacle.radius !== undefined) return Math.hypot(dx, dz) < obstacle.radius + radius
          const cosine = Math.cos(obstacle.rotation), sine = Math.sin(obstacle.rotation)
          const localX = dx * cosine - dz * sine, localZ = dx * sine + dz * cosine
          return Math.abs(localX) < obstacle.halfWidth + radius && Math.abs(localZ) < obstacle.halfDepth + radius
        })) return false
      }
      return true
    },
    dispose() {
      disposed = true
      worker.terminate()
      assembling?.iterator.return()
      assembling?.root.dispose()
      for (const root of retired) root.dispose()
      prepared = null
      queue = []
      for (const entry of loaded.values()) entry.root.dispose()
      loaded.clear()
      assets.dispose()
      material.dispose()
    },
  }
}
