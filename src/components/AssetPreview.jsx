import { useEffect, useRef, useState } from 'react'
import { Engine } from '@babylonjs/core/Engines/engine'
import { Scene } from '@babylonjs/core/scene'
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture'
import { createAssetRegistry } from '../game/assets/createAssetRegistry.js'
import { HUMAN_SCALE } from '../game/world/worldMetrics.js'
import { characterCatalog, PLAYER_ASSET_ID } from '../game/assets/characters/catalog.js'
import { createCharacterModel } from '../game/assets/characters/createCharacterModel.js'
import { createRoadPreview } from '../game/assets/roads/createRoadPreview.js'

function createHumanReference(scene) {
  return createCharacterModel(scene, PLAYER_ASSET_ID)
}

function addMeterGrid(scene, material) {
  const texture = new DynamicTexture('meter-grid', { width: 1024, height: 1024 }, scene, false)
  const context = texture.getContext()
  context.fillStyle = '#202927'
  context.fillRect(0, 0, 1024, 1024)
  const pixelsPerMeter = 1024 / 80
  for (let meter = 0; meter <= 80; meter += 1) {
    const pixel = meter * pixelsPerMeter
    context.beginPath()
    context.strokeStyle = meter % 5 === 0 ? '#58635e' : '#343e3a'
    context.lineWidth = meter % 5 === 0 ? 1.4 : 0.7
    context.moveTo(pixel, 0); context.lineTo(pixel, 1024)
    context.moveTo(0, pixel); context.lineTo(1024, pixel)
    context.stroke()
  }
  texture.update(false)
  material.diffuseTexture = texture
}

export default function AssetPreview({ asset }) {
  const canvasRef = useRef(null)
  const runtimeRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)
  const [motion, setMotion] = useState('idle')
  const motionRef = useRef('idle')

  useEffect(() => {
    const canvas = canvasRef.current
    let engine
    try {
      engine = new Engine(canvas, true)
      engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 2))
      const scene = new Scene(engine)
      scene.clearColor = new Color4(0.055, 0.075, 0.073, 1)
      const camera = new ArcRotateCamera('asset-camera', -Math.PI / 4, Math.PI / 3.1, 12, new Vector3(0, 1, 0), scene)
      camera.lowerBetaLimit = 0.25
      camera.upperBetaLimit = Math.PI / 2.05
      camera.lowerRadiusLimit = 2
      camera.upperRadiusLimit = 80
      camera.wheelDeltaPercentage = 0.01
      camera.attachControl(canvas, true)
      const ambient = new HemisphericLight('asset-ambient', new Vector3(0, 1, 0), scene)
      ambient.intensity = 0.8
      ambient.groundColor = new Color3(0.13, 0.16, 0.16)
      const key = new DirectionalLight('asset-key', new Vector3(-0.6, -1, 0.45), scene)
      key.intensity = 1.1
      key.diffuse = new Color3(1, 0.88, 0.72)
      const ground = MeshBuilder.CreateGround('asset-ground', { width: 80, height: 80 }, scene)
      const groundMaterial = new StandardMaterial('asset-ground-material', scene)
      groundMaterial.diffuseColor = new Color3(0.13, 0.16, 0.15)
      groundMaterial.specularColor = Color3.Black()
      addMeterGrid(scene, groundMaterial)
      ground.material = groundMaterial
      ground.receiveShadows = true
      const resize = new ResizeObserver(() => engine.resize())
      resize.observe(canvas)
      const runtime = { engine, scene, camera, resize, registry: null, instance: null, reference: null, character: null }
      runtimeRef.current = runtime
      engine.runRenderLoop(() => {
        const dt = Math.min(engine.getDeltaTime() / 1000, 0.05)
        runtime.character?.update(dt, motionRef.current !== 'idle', 0, motionRef.current === 'run')
        runtime.reference?.update(dt, false, 0)
        scene.render()
      })
      setReady(true)
    } catch (cause) {
      console.error('Unable to initialize asset preview:', cause)
      setError('预览启动失败，请检查 WebGL 与硬件加速。')
      engine?.dispose()
    }
    return () => {
      const runtime = runtimeRef.current
      runtime?.resize.disconnect()
      runtime?.character?.dispose()
      runtime?.reference?.dispose()
      runtime?.instance?.dispose()
      runtime?.registry?.dispose()
      runtime?.engine.dispose()
      runtimeRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    const runtime = runtimeRef.current
    if (!runtime) return
    runtime.character?.dispose()
    runtime.reference?.dispose()
    runtime.instance?.dispose()
    runtime.registry?.dispose()
    runtime.character = null
    runtime.reference = null
    runtime.instance = null
    runtime.registry = null
    motionRef.current = 'idle'
    setMotion('idle')
    if (asset.category === 'road') {
      runtime.instance = createRoadPreview(runtime.scene, asset)
    } else if (characterCatalog.some((item) => item.assetId === asset.assetId)) {
      runtime.character = createCharacterModel(runtime.scene, asset.assetId)
    } else {
      runtime.registry = createAssetRegistry(runtime.scene)
      runtime.instance = runtime.registry.create({ id: `preview:${asset.assetId}`, assetId: asset.assetId, position: [0, 0, 0], rotation: 0, scale: 1 }, null, 'asset-gallery')
    }
    const assetLeft = -asset.size.width / 2
    let compositionRight = asset.size.width / 2
    if (asset.assetId !== PLAYER_ASSET_ID) {
      runtime.reference = createHumanReference(runtime.scene)
      runtime.reference.root.position.x = asset.size.width / 2 + 1
      runtime.reference.update(0, false, 0)
      compositionRight = runtime.reference.root.position.x + characterCatalog.find((item) => item.assetId === PLAYER_ASSET_ID).size.width / 2
    }
    const compositionWidth = compositionRight - assetLeft
    const targetX = (compositionRight + assetLeft) / 2
    const largest = Math.max(compositionWidth, asset.size.depth, asset.size.height)
    runtime.camera.setTarget(new Vector3(targetX, Math.max(HUMAN_SCALE.referenceHeight, asset.size.height) * 0.38, 0))
    runtime.camera.radius = Math.max(4, largest * 1.45)
    runtime.camera.lowerRadiusLimit = asset.category === 'road' ? 2 : Math.max(1.5, largest * 0.65)
    runtime.camera.upperRadiusLimit = Math.max(12, largest * 4)
  }, [asset, ready])

  return <div className="relative h-full min-h-0 overflow-hidden bg-[#0e1514]"><canvas ref={canvasRef} className="block h-full w-full outline-none" aria-label={`${asset.name} 三维预览`} />{asset.category === 'character' && <div className="absolute left-3 top-3 flex gap-1 rounded-md bg-black/65 p-1">{[['idle','待机'],['walk','行走'],['run','奔跑']].map(([key,label]) => <button key={key} aria-pressed={motion === key} onClick={() => { motionRef.current = key; setMotion(key) }} className={`rounded px-3 py-1.5 text-xs ${motion === key ? 'bg-emerald-900 text-emerald-100' : 'text-stone-400 hover:bg-white/10'}`}>{label}</button>)}</div>}{asset.description && <p className="pointer-events-none absolute bottom-12 left-3 max-w-sm rounded bg-black/60 px-3 py-2 text-xs leading-5 text-stone-300">{asset.description}</p>}{error && <p role="alert" className="absolute inset-x-4 top-4 rounded-lg bg-red-950 p-3 text-sm text-red-100">{error}</p>}<p className="pointer-events-none absolute bottom-3 right-3 rounded-md bg-black/45 px-2 py-1.5 text-[9px] text-stone-400 backdrop-blur-sm sm:bottom-4 sm:right-4">玩家模型 1.80m · 网格 1m · 拖动旋转 · 滚轮缩放</p></div>
}
