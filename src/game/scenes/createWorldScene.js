import { createGameAudio } from '../audio/createGameAudio.js'
import { Scene } from '@babylonjs/core/scene'
import { createThirdPersonCamera } from '../cameras/createThirdPersonCamera.js'
import { useGraphicsStore } from '../../stores/useGraphicsStore.js'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color'
import { createStreamedWorld } from '../world/chunks/createStreamedWorld.js'
import { createCharacterModel } from '../assets/characters/createCharacterModel.js'
import { PLAYER_ASSET_ID } from '../assets/characters/catalog.js'
import { createLocomotion } from '../entities/createLocomotion.js'
import { createStamina, STAMINA } from '../entities/createStamina.js'
import { useTeleportStore } from '../../stores/useTeleportStore.js'
import { teleportLandingCandidates, TELEPORT_DROP_HEIGHT } from '../entities/teleportLanding.js'
import { useDebugStore } from '../../stores/useDebugStore.js'
import { usePlayerStatusStore } from '../../stores/usePlayerStatusStore.js'
import { createMovementInput } from '../core/createMovementInput.js'
import { useGameStore } from '../../stores/useGameStore.js'
import { useWorldStore } from '../../stores/useWorldStore.js'
import { useNavigationStore } from '../../stores/useNavigationStore.js'
import { insideRegion, insideWorld } from '../world/worldConfig.js'
import { createDayNightCycle } from '../world/createDayNightCycle.js'
import { useWorldTimeStore } from '../../stores/useWorldTimeStore.js'
import { createVisibility } from '../map/visibility.js'
import { createFirstLoopScene } from '../worldLedger/createFirstLoopScene.js'

export function createWorldScene(engine, canvas, { onLoading, onReady } = {}) {
  const scene = new Scene(engine)
  scene.clearColor = new Color4(0.105, 0.14, 0.13, 1)
  scene.fogMode = Scene.FOGMODE_LINEAR
  scene.fogColor = new Color3(0.105, 0.14, 0.13)
  scene.fogStart = 52
  scene.fogEnd = 88
  const thirdPerson = createThirdPersonCamera(scene, canvas, () => useGameStore.getState().phase === 'playing', () => useGameStore.getState().pauseGame())
  const camera = thirdPerson.camera
  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.intensity = 0.8
  ambient.groundColor = new Color3(0.12, 0.15, 0.16)
  const sun = new DirectionalLight('sun', new Vector3(-0.5, -1, 0.4), scene)
  sun.diffuse = new Color3(1, 0.88, 0.7)
  sun.intensity = 0.9
  const player = createCharacterModel(scene, PLAYER_ASSET_ID)
  const locomotion = createLocomotion()
  const audio=createGameAudio()
  audio.setActive(useGameStore.getState().phase==='playing')
  const input = createMovementInput(scene, () => useGameStore.getState().phase === 'playing')
  let world = null, activePlan = null, lastSaved = null, lastSavedFog = null
  let ledger = null, lastSavedLedgerRevision = -1
  let stamina = createStamina(), lastSavedStamina = null
  let dayNight = createDayNightCycle(), lastSavedWorldTime = null
  const visibility = () => createVisibility(dayNight.lighting().daylight)
  let teleportJob = null
  let initialChunkCount = 1, ready = false
  let saveTimer = 0, exploreTimer = 0, navigationTimer = 0, lightingTimer = 0
  function applyLighting() {
    const state = dayNight.lighting()
    scene.clearColor.set(state.sky[0], state.sky[1], state.sky[2], 1)
    scene.fogColor.set(...state.fog)
    const distance = useGraphicsStore.getState().viewDistance
    camera.maxZ = distance + 12
    scene.fogStart = distance * (0.45 + state.daylight * 0.15)
    scene.fogEnd = distance
    ambient.intensity = state.ambient
    ambient.groundColor.set(state.fog[0] * 0.75, state.fog[1] * 0.8, state.fog[2] * 0.85)
    sun.intensity = state.sun
    sun.diffuse.set(...state.sunColor)
    sun.direction.set(...state.direction)
    useWorldTimeStore.getState().publish({ time: state.time, period: state.period, daylight: state.daylight })
  }
  function syncWorld(document) {
    if (!document || document.world === activePlan) return
    audio.reset()
    ledger?.dispose()
    world?.dispose()
    useTeleportStore.getState().finish()
    teleportJob = null
    world = createStreamedWorld(scene, document.world, useGraphicsStore.getState().viewDistance)
    ready = false
    activePlan = document.world
    input.clear()
    locomotion.reset()
    thirdPerson.clear()
    stamina = createStamina(document.progress.stamina)
    dayNight = createDayNightCycle(document.progress.worldTime)
    lastSavedStamina = JSON.stringify(stamina.snapshot())
    lastSavedWorldTime = dayNight.snapshot()
    usePlayerStatusStore.getState().publish(stamina.hud())
    applyLighting()
    let position = document.progress.playerPosition || document.world.spawn || [0, 0]
    if (!insideWorld(document.world.bounds, ...position, 1)) position = document.world.spawn
    player.root.position.set(position[0], world.terrain.surfaceHeight(...position), position[1])
    lastSaved = [...position]
    ledger = createFirstLoopScene(scene, document.world, world, player, document.progress.ledger, () => checkpoint())
    lastSavedLedgerRevision = document.progress.ledger?.revision ?? -1
    world.update(...position, 1)
    const initial = world.getStats()
    initialChunkCount = initial.required
    onLoading?.({ progress: 45, label: `正在生成附近区域 0/${initialChunkCount}` })
    thirdPerson.follow(player.root, world.terrain)
    player.update(0, false, player.root.position.y)
    const p = player.root.position
    useNavigationStore.getState().reset({ x: p.x, y: p.y, z: p.z }, document.progress.exploredFog, document.world.bounds, visibility())
    lastSavedFog = useNavigationStore.getState().fog
    saveTimer = 0
    exploreTimer = 0
    navigationTimer = 0
    lightingTimer = 0
  }
  async function checkpoint() {
    if (useTeleportStore.getState().request || !ready || !world || useWorldStore.getState().document?.world !== activePlan) return
    const owner = activePlan
    const position = [player.root.position.x, player.root.position.z]
    const fog = useNavigationStore.getState().fog
    const staminaState = stamina.snapshot()
    const staminaKey = JSON.stringify(staminaState)
    const worldTime = dayNight.snapshot()
    const ledgerRevision = ledger?.revision() ?? -1
    if (lastSaved && Math.hypot(position[0] - lastSaved[0], position[1] - lastSaved[1]) < 0.05 && fog === lastSavedFog && staminaKey === lastSavedStamina && Math.abs(worldTime - lastSavedWorldTime) < 0.0001 && ledgerRevision === lastSavedLedgerRevision) return
    const ledgerState = ledger?.snapshot()
    if (await useWorldStore.getState().dispatch({ type: 'checkpoint', position, fog, stamina: staminaState, worldTime, ...(ledgerState ? { ledger: ledgerState } : {}) }) && activePlan === owner) {
      lastSaved = position
      lastSavedFog = fog
      lastSavedStamina = staminaKey
      lastSavedWorldTime = worldTime
      lastSavedLedgerRevision = ledgerRevision
    }
  }
  syncWorld(useWorldStore.getState().document)
  const unsubscribeGraphics = useGraphicsStore.subscribe(state => {
    world?.setViewDistance(state.viewDistance)
    applyLighting()
  })
  const unsubscribeWorld = useWorldStore.subscribe((state) => syncWorld(state.document))
  const unsubscribePhase = useGameStore.subscribe((state, previous) => {
    if (state.phase !== previous.phase) {
      audio.setActive(state.phase==='playing')
      input.clear()
      ledger?.clearCommands()
      locomotion.clearInput()
      thirdPerson.clear()
      usePlayerStatusStore.getState().publish({ ...stamina.hud(), mode: stamina.snapshot().exhausted ? 'exhausted' : 'idle' })
      if (previous.phase === 'playing' || state.phase === 'playing') {
        const p = player.root.position
        useNavigationStore.getState().update({ x: p.x, y: p.y, z: p.z }, player.root.rotation.y, visibility())
      }
      if (previous.phase === 'playing') checkpoint()
    }
  })
  const clearPointerInput = () => { if (document.pointerLockElement !== canvas) { input.clear(); locomotion.clearInput(); ledger?.clearCommands() } }
  document.addEventListener('pointerlockchange', clearPointerInput)
  window.addEventListener('pagehide', checkpoint)

  scene.onBeforeRenderObservable.add(() => {
    if (!world) return
    const position = player.root.position
    const teleport = useTeleportStore.getState()
    const request = teleport.request
    if (request && ready) {
      if (useGameStore.getState().phase !== 'map' || !useDebugStore.getState().teleportMode || request.seed !== activePlan.seed) {
        teleport.finish('已取消瞬移。')
        teleportJob = null
      } else {
        if (teleportJob?.id !== request.id) {
          teleportJob = { id: request.id, started: performance.now(), candidates: null }
          input.clear()
          locomotion.clearInput()
        }
        if (performance.now() - teleportJob.started > 45000) {
          teleport.finish('附近区域准备超时，请换个位置重试。')
          teleportJob = null
          return
        }
        // 一次只计算一个 Worker 区块，主线程安装预算 2ms，不加载整张地图。
        world.update(request.x, request.z, 2)
        const stats = world.getStats()
        if (stats.queued > 0 || stats.templatesReady !== stats.templatesTotal) {
          teleport.publish(Math.round(stats.ready / Math.max(1, stats.required) * 90), `正在准备落点附近区域 ${stats.ready}/${stats.required}…`)
          return
        }
        teleport.publish(95, '正在寻找避开模型的安全落点…')
        teleportJob.candidates ??= teleportLandingCandidates(request.x, request.z)
        const started = performance.now()
        let attempts = 0
        while (attempts++ < 16 && performance.now() - started < 2) {
          const candidate = teleportJob.candidates.next()
          if (candidate.done) {
            teleport.finish('附近没有足够平坦的空地，请换个位置。')
            teleportJob = null
            return
          }
          const { x, z } = candidate.value
          if (!world.isClearLanding(x, z) || !world.canMove(x, z, 1.1)) continue
          const floor = world.terrain.surfaceHeight(x, z)
          position.set(x, floor + TELEPORT_DROP_HEIGHT, z)
          locomotion.beginFall()
          input.clear()
          thirdPerson.clear()
          player.update(0, false, position.y, false, { grounded: false, groundHeight: floor, heightAboveGround: TELEPORT_DROP_HEIGHT })
          thirdPerson.follow(player.root, world.terrain)
          useNavigationStore.getState().update({ x, y: position.y, z }, player.root.rotation.y, visibility())
          teleport.finish()
          teleportJob = null
          useGameStore.getState().closeMap()
          checkpoint()
          return
        }
        return
      }
    } else teleportJob = null
    world.update(position.x, position.z)
    if (!ready) {
      const stats = world.getStats()
      initialChunkCount = stats.required
      const loaded = stats.ready
      const progress = 45 + 40 * loaded / initialChunkCount + 10 * stats.templatesReady / Math.max(1, stats.templatesTotal)
      onLoading?.({ progress, label: `附近区域 ${loaded}/${initialChunkCount} · 素材 ${stats.templatesReady}/${stats.templatesTotal}` })
      if (stats.queued === 0 && stats.templatesReady === stats.templatesTotal) {
        // 异步区块未完成时不能做出生点碰撞判断；否则读档会被误判并传回出生点。
        if (!world.canMove(position.x, position.z)) {
          const spawn = activePlan.spawn || [0, 0]
          if (Math.hypot(position.x - spawn[0], position.z - spawn[1]) < 0.01) throw new Error('出生点被占用，无法进入世界。')
          position.set(spawn[0], world.terrain.surfaceHeight(...spawn), spawn[1])
          locomotion.reset()
          world.update(...spawn)
          thirdPerson.follow(player.root, world.terrain)
          useNavigationStore.getState().update({ x: position.x, y: position.y, z: position.z }, player.root.rotation.y)
          return
        }
        ready = true
        onLoading?.({ progress: 100, label: '世界准备完成' })
        onReady?.()
      }
    }
    if (useGameStore.getState().phase !== 'playing') return
    const dt = Math.min(engine.getDeltaTime() / 1000, 0.05)
    dayNight.update(dt)
    lightingTimer += dt
    if (lightingTimer >= 0.1) {
      lightingTimer = 0
      applyLighting()
    }
    const direction = input.direction()
    const wantsSprint = input.wantsSprint()
    const debug = useDebugStore.getState()
    const sprintAllowed = wantsSprint
    const speed = debug.infiniteSprint && sprintAllowed ? STAMINA.runSpeed : stamina.speed(sprintAllowed)
    const multiplier = sprintAllowed && speed === STAMINA.runSpeed ? debug.sprintMultiplier : 1
    const motion = locomotion.update(dt, position, world, {
      direction, speed: speed * multiplier, dashDirection: input.consumeDash(),
      jumpPressed: input.consumeJump(), jumpHeld: input.jumpHeld(),
      bodySupport: (x,z,ceiling) => ledger?.bodySupport(x,z,ceiling) ?? -Infinity,
      bodyClear: (from, to) => ledger?.bodyClear(from,to) ?? true,
    })
    const moving = motion.moving
    const running = debug.infiniteSprint ? moving && sprintAllowed : stamina.update(dt, moving, sprintAllowed)
    if (moving) {
      const turn = Math.atan2(Math.sin(motion.heading - player.root.rotation.y), Math.cos(motion.heading - player.root.rotation.y))
      player.root.rotation.y += turn * (1 - Math.exp(-dt * (motion.grounded ? 18 : 9)))
    }
    player.update(dt, moving, position.y, running, motion)
    audio.update(dt,position,motion,running,()=>{
      const floor=world.terrain.surfaceHeight(position.x,position.z)
      if(motion.groundHeight>floor+.7)return 'tile'
      const bridge=activePlan.city?.bridges.find(b=>Math.abs(position.x-b.x)<=b.width/2&&Math.abs(position.z-b.z)<=b.length/2)
      if(bridge){const asset=activePlan.city.placements.find(p=>p.id===bridge.id);return asset?.assetId.includes('wood')?'wood':'stone'}
      const road=world.terrain.nearbyRoad(position.x,position.z)
      return road.distance<=road.width/2+.5?'stone':'grass'
    })
    world.updateNpcs(dt,position.x,position.z)
    ledger?.update(dt)
    thirdPerson.follow(player.root, world.terrain, dt)
    navigationTimer += dt
    if (navigationTimer >= 0.1) {
      navigationTimer = 0
      usePlayerStatusStore.getState().publish(debug.infiniteSprint ? { ...stamina.hud(), mode: running ? 'running' : moving ? 'walking' : 'idle' } : stamina.hud())
      useNavigationStore.getState().update({ x: position.x, y: position.y, z: position.z }, player.root.rotation.y, visibility())
    }
    saveTimer += dt
    exploreTimer += dt
    if (saveTimer >= 2) {
      checkpoint()
      saveTimer = 0
      // 开发环境供浏览器验证读取；不显示为游戏面板，也不写入存档。
      if (import.meta.env.DEV) canvas.dataset.runtime = JSON.stringify({ x: position.x, y: position.y, z: position.z, grounded: motion.grounded, jumpCount: motion.jumpCount, verticalSpeed: motion.verticalSpeed, alpha: camera.alpha, beta: camera.beta, ...world.getStats() })
    }
    if (exploreTimer >= 0.5) {
      exploreTimer = 0
      const store = useWorldStore.getState()
      for (const region of activePlan.regions) {
        if (!store.document.progress.discoveredRegionIds.includes(region.id) && insideRegion(region, position.x, position.z)) {
          store.dispatch({ type: 'discover', regionId: region.id })
        }
      }
    }
  })
  scene.onDisposeObservable.add(() => {
    checkpoint()
    useTeleportStore.getState().finish()
    unsubscribeWorld()
    unsubscribePhase()
    document.removeEventListener('pointerlockchange', clearPointerInput)
    window.removeEventListener('pagehide', checkpoint)
    unsubscribeGraphics()
    audio.dispose()
    thirdPerson.dispose()
    input.dispose()
    delete canvas.dataset.runtime
    player.dispose()
    ledger?.dispose()
    world?.dispose()
  })
  return scene
}
