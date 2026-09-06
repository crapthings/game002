import { Scene } from '@babylonjs/core/scene'
import { createThirdPersonCamera } from '../cameras/createThirdPersonCamera.js'
import { useGraphicsStore } from '../../stores/useGraphicsStore.js'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight'
import { SpotLight } from '@babylonjs/core/Lights/spotLight'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color'
import { createStreamedWorld } from '../world/chunks/createStreamedWorld.js'
import { createCharacterModel } from '../assets/characters/createCharacterModel.js'
import { PLAYER_ASSET_ID } from '../assets/characters/catalog.js'
import { createStamina, STAMINA } from '../entities/createStamina.js'
import { useDebugStore } from '../../stores/useDebugStore.js'
import { usePlayerStatusStore } from '../../stores/usePlayerStatusStore.js'
import { createMovementInput } from '../core/createMovementInput.js'
import { useGameStore } from '../../stores/useGameStore.js'
import { useWorldStore } from '../../stores/useWorldStore.js'
import { useNavigationStore } from '../../stores/useNavigationStore.js'
import { insideRegion, insideWorld } from '../world/worldConfig.js'
import { createDayNightCycle } from '../world/createDayNightCycle.js'
import { useWorldTimeStore } from '../../stores/useWorldTimeStore.js'
import { SURVIVAL } from '../entities/survival.js'
import { createFlashlight, FLASHLIGHT } from '../entities/createFlashlight.js'
import { useFlashlightStore } from '../../stores/useFlashlightStore.js'
import { createVisibility } from '../map/visibility.js'
import { createSpawnManager } from '../spawning/createSpawnManager.js'
import { useSpawnStatsStore } from '../../stores/useSpawnStatsStore.js'

export function createWorldScene(engine, canvas, { onLoading, onReady } = {}) {
  const scene = new Scene(engine)
  scene.clearColor = new Color4(0.105, 0.14, 0.13, 1)
  scene.fogMode = Scene.FOGMODE_LINEAR
  scene.fogColor = new Color3(0.105, 0.14, 0.13)
  scene.fogStart = 52
  scene.fogEnd = 88
  const thirdPerson = createThirdPersonCamera(scene, canvas, () => useGameStore.getState().phase === 'playing')
  const camera = thirdPerson.camera
  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.intensity = 0.8
  ambient.groundColor = new Color3(0.12, 0.15, 0.16)
  const sun = new DirectionalLight('sun', new Vector3(-0.5, -1, 0.4), scene)
  sun.diffuse = new Color3(1, 0.88, 0.7)
  sun.intensity = 0.9
  const torch = new SpotLight('player-flashlight', Vector3.Zero(), new Vector3(0,-0.08,1), FLASHLIGHT.halfAngle * 2, 2, scene)
  torch.diffuse = new Color3(1,0.94,0.76)
  torch.range = FLASHLIGHT.range
  torch.intensity = 0

  const player = createCharacterModel(scene, PLAYER_ASSET_ID)
  const input = createMovementInput(canvas, scene, () => useGameStore.getState().phase === 'playing')
  let world = null, activePlan = null, lastSaved = null, lastSavedFog = null
  let spawning = null
  let stamina = createStamina(), lastSavedStamina = null
  let dayNight = createDayNightCycle(), lastSavedWorldTime = null
  let flashlight = createFlashlight(), lastSavedFlashlight = null
  const visibility = () => createVisibility(dayNight.lighting().daylight, flashlight.snapshot().enabled)
  let initialChunkCount = 1, ready = false
  let foodDecay = 0, waterDecay = 0
  function flushSurvival() {
    if (!foodDecay && !waterDecay) return
    const owner = activePlan, food = foodDecay, water = waterDecay
    foodDecay = 0; waterDecay = 0
    useWorldStore.getState().dispatch({ type: 'survival-tick', food, water }).then(saved => {
      if (!saved && activePlan === owner) { foodDecay += food; waterDecay += water }
    })
  }
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
    spawning?.dispose()
    world?.dispose()
    world = createStreamedWorld(scene, document.world, useGraphicsStore.getState().viewDistance)
    spawning = createSpawnManager(scene,document.world,world)
    ready = false
    activePlan = document.world
    foodDecay = 0; waterDecay = 0
    input.clear()
    thirdPerson.clear()
    stamina = createStamina(document.progress.stamina)
    dayNight = createDayNightCycle(document.progress.worldTime)
    flashlight = createFlashlight(document.progress.flashlight)
    useFlashlightStore.getState().publish(flashlight.hud())
    lastSavedFlashlight = JSON.stringify(flashlight.snapshot())
    lastSavedStamina = JSON.stringify(stamina.snapshot())
    lastSavedWorldTime = dayNight.snapshot()
    usePlayerStatusStore.getState().publish(stamina.hud())
    applyLighting()
    let position = document.progress.playerPosition || document.world.spawn || [0, 0]
    if (!insideWorld(document.world.bounds, ...position, 1)) position = document.world.spawn
    player.root.position.set(position[0], world.terrain.surfaceHeight(...position), position[1])
    lastSaved = [...position]
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
    if (!ready || !world || useWorldStore.getState().document?.world !== activePlan) return
    flashlight.update(0, useFlashlightStore.getState().enabled)
    flushSurvival()
    const owner = activePlan
    const position = [player.root.position.x, player.root.position.z]
    const fog = useNavigationStore.getState().fog
    const staminaState = stamina.snapshot()
    const staminaKey = JSON.stringify(staminaState)
    const worldTime = dayNight.snapshot()
    const flashlightState = flashlight.snapshot(), flashlightKey = JSON.stringify(flashlightState)
    if (lastSaved && Math.hypot(position[0] - lastSaved[0], position[1] - lastSaved[1]) < 0.05 && fog === lastSavedFog && staminaKey === lastSavedStamina && flashlightKey === lastSavedFlashlight && Math.abs(worldTime - lastSavedWorldTime) < 0.0001) return
    if (await useWorldStore.getState().dispatch({ type: 'checkpoint', position, fog, stamina: staminaState, worldTime, flashlight: flashlightState }) && activePlan === owner) {
      lastSaved = position
      lastSavedFog = fog
      lastSavedStamina = staminaKey
      lastSavedWorldTime = worldTime
      lastSavedFlashlight = flashlightKey
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
      input.clear()
      thirdPerson.clear()
      usePlayerStatusStore.getState().publish({ ...stamina.hud(), mode: stamina.snapshot().exhausted ? 'exhausted' : 'idle' })
      if (previous.phase === 'playing' || state.phase === 'playing') {
        const p = player.root.position
        useNavigationStore.getState().update({ x: p.x, y: p.y, z: p.z }, player.root.rotation.y, visibility())
      }
      if (previous.phase === 'playing') checkpoint()
    }
  })
  window.addEventListener('pagehide', checkpoint)

  scene.onBeforeRenderObservable.add(() => {
    if (!world) return
    const position = player.root.position
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
          world.update(...spawn)
          thirdPerson.follow(player.root, world.terrain)
          useNavigationStore.getState().update({ x: position.x, y: position.y, z: position.z }, player.root.rotation.y)
          return
        }
        const spawnState=spawning.update(0,position,player.root.rotation.y,visibility(),useWorldStore.getState().document.progress,{initial:true,paused:useDebugStore.getState().pauseSpawning})
        useSpawnStatsStore.getState().publish(spawnState)
        if (!spawnState.ready) { onLoading?.({progress:96,label:`正在准备附近感染者 ${spawnState.active}/32`});return }
        ready = true
        onLoading?.({ progress: 100, label: '世界准备完成' })
        onReady?.()
      }
    }
    if (useGameStore.getState().phase !== 'playing') return
    const dt = Math.min(engine.getDeltaTime() / 1000, 0.05)
    dayNight.update(dt)
    flashlight.update(dt, useFlashlightStore.getState().enabled)
    lightingTimer += dt
    if (lightingTimer >= 0.1) {
      lightingTimer = 0
      applyLighting()
    }
    const direction = input.direction(position)
    const wantsSprint = input.wantsSprint()
    const needs = useWorldStore.getState().document?.progress.survival
    const depleted = needs && (needs.food <= 0 || needs.water <= 0)
    const debug = useDebugStore.getState()
    const sprintAllowed = wantsSprint && (debug.infiniteSprint || !depleted)
    const speed = debug.infiniteSprint && sprintAllowed ? STAMINA.runSpeed : stamina.speed(sprintAllowed)
    const multiplier = sprintAllowed && speed === STAMINA.runSpeed ? debug.sprintMultiplier : 1
    const distance = Math.min(speed * multiplier * dt, direction.distance ?? Infinity)
    const dx = direction.x * distance, dz = direction.z * distance
    const oldX = position.x, oldZ = position.z
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.2))
    const stepX = dx / steps, stepZ = dz / steps
    for (let step = 0; step < steps; step++) {
      if (world.canMove(position.x + stepX, position.z + stepZ)) {
        position.x += stepX
        position.z += stepZ
      } else {
        if (world.canMove(position.x + stepX, position.z)) position.x += stepX
        if (world.canMove(position.x, position.z + stepZ)) position.z += stepZ
      }
    }
    const moving = Math.hypot(position.x - oldX, position.z - oldZ) > 0.001
    const running = debug.infiniteSprint ? moving && sprintAllowed : stamina.update(dt, moving, sprintAllowed)
    foodDecay += SURVIVAL.foodPerSecond * dt * (running ? 1.5 : 1)
    waterDecay += SURVIVAL.waterPerSecond * dt * (running ? 2 : 1)
    if (moving) player.root.rotation.y = Math.atan2(direction.x, direction.z)
    player.update(dt, moving, world.terrain.surfaceHeight(position.x, position.z), running)
    torch.position.set(position.x,position.y+1.35,position.z)
    torch.direction.set(Math.sin(player.root.rotation.y),-0.08,Math.cos(player.root.rotation.y))
    torch.intensity = flashlight.snapshot().enabled ? 5 : 0
    spawning.update(dt,position,player.root.rotation.y,visibility(),useWorldStore.getState().document.progress,{paused:debug.pauseSpawning})
    thirdPerson.follow(player.root, world.terrain)
    navigationTimer += dt
    if (navigationTimer >= 0.1) {
      navigationTimer = 0
      usePlayerStatusStore.getState().publish(debug.infiniteSprint ? { ...stamina.hud(), mode: running ? 'running' : moving ? 'walking' : 'idle' } : stamina.hud())
      useNavigationStore.getState().update({ x: position.x, y: position.y, z: position.z }, player.root.rotation.y, visibility())
      useFlashlightStore.getState().publish(flashlight.hud())
      useSpawnStatsStore.getState().publish(spawning.getStats())
    }
    saveTimer += dt
    exploreTimer += dt
    if (saveTimer >= 2) {
      checkpoint()
      saveTimer = 0
      // 开发环境供浏览器验证读取；不显示为游戏面板，也不写入存档。
      if (import.meta.env.DEV) canvas.dataset.runtime = JSON.stringify({ x: position.x, z: position.z, alpha: camera.alpha, beta: camera.beta, ...world.getStats() })
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
    unsubscribeWorld()
    unsubscribePhase()
    window.removeEventListener('pagehide', checkpoint)
    unsubscribeGraphics()
    thirdPerson.dispose()
    input.dispose()
    delete canvas.dataset.runtime
    player.dispose()
    spawning?.dispose()
    useSpawnStatsStore.getState().publish({active:0,visible:0,planned:0,deferred:0})
    world?.dispose()
  })
  return scene
}
