import { buildingBodies, createTraversal } from './createTraversal.js'
import { createNpcCrowd } from '../../npcs/createNpcCrowd.js'
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture'
import { Texture } from '@babylonjs/core/Materials/Textures/texture'
import { GROUND_TEXTURE_SIZE } from './groundTexture.js'
import { inCanal, onBridge } from '../city/createCityPlan.js'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { wuxiaDefinitions } from '../../assets/wuxia/catalog.js'
import { canMoveInWorld } from './movementQuery.js'
import { createNavigationWorker } from '../../living/createNavigationWorker.js'
import { createCollisionIndex, fortificationBodies } from './collisionIndex.js'
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
import { createTerrain, chunkAt, chunkKey, requiredChunks, CHUNK_SIZE } from './terrain.js'

export function createStreamedWorld(scene, plan, initialViewDistance = 64) {
  const towns = plan.settlements || []
  const terrain = createTerrain(plan.seed, towns, plan)
  const assets = createAssetRegistry(scene)
  const loaded = new Map()
  const collisionIndex = createCollisionIndex()
  collisionIndex.replace('fortifications', fortificationBodies(plan.fortifications))
  const navigation = createNavigationWorker(plan)
  const material = new StandardMaterial('terrain-material', scene)
  material.diffuseColor = Color3.White()
  material.specularColor = Color3.Black()
  const waterMaterial=new StandardMaterial('city-water',scene)
  waterMaterial.diffuseColor=Color3.FromHexString('#59b5ae')
  waterMaterial.specularColor=Color3.FromHexString('#bce6d9')
  const bankMaterial=new StandardMaterial('city-quay',scene)
  bankMaterial.diffuseColor=Color3.FromHexString('#a7b4a1')
  bankMaterial.specularColor=Color3.Black()
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
  warmup.push(...new Set((plan.fortifications?.placements || []).map(p => p.assetId)))
  warmup.push(...new Set((plan.city?.placements || []).map(p => p.assetId)))
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
  for (const placement of [...(plan.fortifications?.placements || []),...(plan.city?.placements || [])]) {
    const chunk = chunkAt(placement.position[0], placement.position[2])
    const key = chunkKey(chunk.x, chunk.z)
    if (!overrides.has(key)) overrides.set(key, [])
    overrides.get(key).push(placement)
  }
  function* build(chunk, data, root) {
    const mesh = new Mesh(`ground:${chunk.key}`, scene)
    mesh.parent = root
    const vertices = new VertexData()
    vertices.positions = data.positions
    vertices.indices = data.indices
    vertices.uvs = []
    for(let i=0;i<data.positions.length;i+=3)vertices.uvs.push((data.positions[i]-chunk.x*CHUNK_SIZE)/CHUNK_SIZE,(data.positions[i+2]-chunk.z*CHUNK_SIZE)/CHUNK_SIZE)
    vertices.normals = data.normals
    vertices.applyToMesh(mesh)
    const groundMaterial=material.clone(`ground-material:${chunk.key}`)
    const texture=RawTexture.CreateRGBATexture(data.groundPixels,GROUND_TEXTURE_SIZE,GROUND_TEXTURE_SIZE,scene,true,false,Texture.TRILINEAR_SAMPLINGMODE)
    texture.wrapU=Texture.CLAMP_ADDRESSMODE;texture.wrapV=Texture.CLAMP_ADDRESSMODE
    texture.anisotropicFilteringLevel=4
    groundMaterial.diffuseTexture=texture
    mesh.material = groundMaterial
    mesh.onDisposeObservable.add(()=>{groundMaterial.dispose();texture.dispose()})
    mesh.receiveShadows = true
    mesh.isPickable = false
    mesh.metadata = { ground: true, chunkKey: chunk.key }
    yield
    const river=plan.city?.water
    if(river) {
      const minX=Math.max(chunk.x*CHUNK_SIZE,river.minX),maxX=Math.min((chunk.x+1)*CHUNK_SIZE,river.maxX)
      const minZ=Math.max(chunk.z*CHUNK_SIZE,river.minZ),maxZ=Math.min((chunk.z+1)*CHUNK_SIZE,river.maxZ)
      if(maxX>minX&&maxZ>minZ) {
        const water=MeshBuilder.CreateGround('canal-water',{width:maxX-minX,height:maxZ-minZ},scene)
        water.position.set((minX+maxX)/2,river.level,(minZ+maxZ)/2);water.parent=root;water.material=waterMaterial;water.isPickable=false
      }
      const banks=[]
      if(maxX>minX)for(const z of [river.minZ,river.maxZ])if(z>=chunk.z*CHUNK_SIZE&&z<(chunk.z+1)*CHUNK_SIZE) {
        // 桥头预留缺口，堤岸不会挡住通路。
        for(let x=minX;x<maxX;x+=1)if(!onBridge(plan.city,x+.5,z,.0)) {
          const bank=MeshBuilder.CreateBox('canal-bank',{width:1,height:2,depth:.35},scene)
          bank.position.set(x+.5,plan.city.elevation-1,z);bank.parent=root;bank.material=bankMaterial;bank.isPickable=false;banks.push(bank)
        }
      }
      if(banks.length) {
        for(const bank of banks) {bank.parent=null;bank.computeWorldMatrix(true)}
        const merged=Mesh.MergeMeshes(banks,true,true);merged.parent=root;merged.isPickable=false
      }
    }
    yield
    const colliders = [], landingObstacles = []
    for (const placement of data.placements) {
      if (!placement.planned && !placement.building && !placement.decoration && plan.regions.some((region) => region.placements.length > 0 && Math.hypot(placement.position[0] - region.center[0], placement.position[2] - region.center[1]) < region.radius)) continue
      const x = placement.position[0], z = placement.position[2]
      // 不占用出生点；地标代理留待真实交互素材接入。
      const spawn = plan.spawn || [0, 0]
      if (Math.hypot(x - spawn[0], z - spawn[1]) < 3 || placement.assetId.startsWith('landmark.')) continue
      if (!placement.building && !placement.decoration && townSurface(towns, x, z)?.weight > 0.5) continue
      const instance = assets.create(placement, root, placement.regionId)
      instance.computeWorldMatrix(true)
      const box = instance.getBoundingInfo().boundingBox
      // 额外保留视觉包围盒，瞬移避开树冠与无移动碰撞的高灌木。
      if (box.maximumWorld.y - placement.position[1] > 0.35) landingObstacles.push({
        minX: box.minimumWorld.x, maxX: box.maximumWorld.x,
        minZ: box.minimumWorld.z, maxZ: box.maximumWorld.z,
        top: box.maximumWorld.y,
      })
      if (placement.fortification || placement.infrastructure) { yield; continue }
      const definition = environmentCatalog[placement.assetId] || wuxiaDefinitions[placement.assetId]
      const footprint = placement.footprint || definition?.footprint
      if (wuxiaDefinitions[placement.assetId]) {
        if(definition.kind.startsWith('market-'))colliders.push({x,z,rotation:placement.rotation,halfWidth:definition.width*placement.scale/2,halfDepth:definition.depth*placement.scale/2,base:placement.position[1],top:box.maximumWorld.y})
        else colliders.push(...buildingBodies(definition,placement))
      } else if (definition?.kind==='court' || definition?.layout==='court' || definition?.layout==='wing') {
        const c=Math.cos(placement.rotation),s=Math.sin(placement.rotation)
        for(const [ox,oz,w,d] of [[0,definition.depth/2-2,definition.width,4],[-definition.width/2+1.75,-2,3.5,definition.depth-4],...(definition.layout==='wing'?[]:[[definition.width/2-1.75,-2,3.5,definition.depth-4]])])colliders.push({x:x+c*ox+s*oz,z:z-s*ox+c*oz,rotation:placement.rotation,halfWidth:w/2,halfDepth:d/2})
      } else if (footprint) {
        colliders.push({ x, z, rotation: placement.rotation, halfWidth: footprint.width * placement.scale / 2, halfDepth: footprint.depth * placement.scale / 2 })
      } else {
        const radius = definition?.radius ?? (placement.assetId === 'nature.tree' ? 0.45 : 0.9)
        if (radius > 0) colliders.push({ x, z, radius: radius * placement.scale, top:box.maximumWorld.y })
      }
      yield
    }
    // All chunk geometry is static. Visibility still changes on chunk entry/exit.
    root.freezeWorldMatrix()
    for (const mesh of root.getChildMeshes()) { mesh.freezeWorldMatrix(); mesh.doNotSyncBoundingInfo = true }
    root.setEnabled(true)
    const bounds = colliders.reduce((bounds, obstacle) => {
      const reach = obstacle.radius ?? Math.hypot(obstacle.halfWidth, obstacle.halfDepth)
      bounds.minX = Math.min(bounds.minX, obstacle.x - reach)
      bounds.maxX = Math.max(bounds.maxX, obstacle.x + reach)
      bounds.minZ = Math.min(bounds.minZ, obstacle.z - reach)
      bounds.maxZ = Math.max(bounds.maxZ, obstacle.z + reach)
      return bounds
    }, { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity })
    const entry = { root, colliders, bounds, landingObstacles }
    loaded.set(chunk.key, entry)
    collisionIndex.replace(chunk.key, colliders)
    navigation.install(chunk.key, entry)
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
      // Only scan retained chunks when crossing a boundary or changing view
      // distance; standing still does not need another visibility/eviction pass.
      for (const [key, entry] of loaded) {
        const enabled = wanted.has(key)
        if (entry.root.isEnabled() !== enabled) entry.root.setEnabled(enabled)
        const [cx, cz] = key.split(',').map(Number)
        if (Math.abs(cx - center.x) > radius + 1 || Math.abs(cz - center.z) > radius + 1) {
          retired.push(entry.root)
          loaded.delete(key)
          collisionIndex.remove(key)
          navigation.remove(key)
        }
      }
    }
    queue = [...wanted.values()].filter((chunk) => !loaded.has(chunk.key) && chunk.key !== pending?.key && chunk.key !== prepared?.key && chunk.key !== assembling?.key)
    if (prepared && !wanted.has(prepared.key)) prepared = null
    if (assembling && !wanted.has(assembling.key)) {
      assembling.iterator.return()
      retired.push(assembling.root)
      assembling = null
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
  let crowd
  const api = {
    terrain,
    updateNpcs(dt,x,z) { crowd.update(dt,x,z,viewDistance) },
    update,
    setViewDistance(value) { viewDistance = value },
    getViewDistance: () => viewDistance,
    findRoute: (start, target) => navigation.findRoute(start, target),
    getStats: () => ({ loaded: loaded.size, queued: required.filter((chunk) => !loaded.has(chunk.key)).length, required: required.length, ready: required.filter((chunk) => loaded.has(chunk.key)).length, templatesReady: templateCount - warmup.length, templatesTotal: templateCount, pending: Boolean(pending), assembling: Boolean(assembling), center, ...navigation.stats(), ...collisionIndex.stats(), ...assets.stats() }),
    // 所有导航与移动共用这层检查，不依赖美术模型的三角面。
    isLoaded(x,z) { const at=chunkAt(x,z); return loaded.has(chunkKey(at.x,at.z)) },
    isClearLanding(x, z) {
      if (!insideWorld(plan.bounds, x, z, 3)) return false
      const at = chunkAt(x, z)
      // 邻块也必须完成，防止忽略从相邻区块伸来的树冠。
      for (const chunk of requiredChunks(at, 1)) {
        if (insideWorld(plan.bounds, (chunk.x + 0.5) * CHUNK_SIZE, (chunk.z + 0.5) * CHUNK_SIZE) && !loaded.has(chunk.key)) return false
      }
      const floor = terrain.surfaceHeight(x, z), clearance = 1.1
      for (const entry of loaded.values()) {
        if (entry.landingObstacles.some(b => b.top > floor + 0.35 && x + clearance >= b.minX && x - clearance <= b.maxX && z + clearance >= b.minZ && z - clearance <= b.maxZ)) return false
      }
      return [[1.5,0],[-1.5,0],[0,1.5],[0,-1.5]].every(([dx,dz]) => Math.abs(terrain.surfaceHeight(x + dx,z + dz) - floor) < 0.45)
    },
    canMove(x, z, radius = HUMAN_SCALE.collisionRadius) {
      return canMoveInWorld(plan, loaded, x, z, radius, collisionIndex)
    },
    dispose() {
      crowd?.dispose()
      disposed = true
      worker.terminate()
      navigation.dispose()
      assembling?.iterator.return()
      assembling?.root.dispose()
      for (const root of retired) root.dispose()
      prepared = null
      queue = []
      for (const entry of loaded.values()) entry.root.dispose()
      loaded.clear()
      collisionIndex.clear()
      assets.dispose()
      material.dispose()
      waterMaterial.dispose()
      bankMaterial.dispose()
    },
  }
  Object.assign(api,createTraversal(loaded,plan.fortifications,terrain,(x,z)=>api.isLoaded(x,z),(x,z)=>insideWorld(plan.bounds,x,z,1),(x,z,r)=>(inCanal(plan.city,x,z,r)&&!onBridge(plan.city,x,z,r))||plan.city?.bridges.some(b=>Math.abs(z-b.z)<b.length/2&&Math.abs(Math.abs(x-b.x)-b.width/2-.12)<r+.12),collisionIndex))
  crowd=createNpcCrowd(scene,plan,api)
  return api
}
