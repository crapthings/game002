import { useEffect, useRef, useState } from 'react'
import { Engine } from '@babylonjs/core/Engines/engine'
import { createWorldScene } from '../game/scenes/createWorldScene.js'
import { useGraphicsStore } from '../stores/useGraphicsStore.js'
import { createPerformanceMonitor } from '../game/core/createPerformanceMonitor.js'

export default function GameCanvas({ onLoading, onReady, onError }) {
  const canvasRef = useRef(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let engine
    let resizeObserver
    let unsubscribeGraphics, performanceMonitor

    try {
      const canvas = canvasRef.current
      onLoading?.({ progress: 32, label: '正在启动图形引擎' })
      engine = new Engine(canvas, true, { powerPreference: 'high-performance' })
      const resize = () => {
        engine.setHardwareScalingLevel(1 / useGraphicsStore.getState().renderScale)
        engine.resize()
      }
      resize()
      unsubscribeGraphics = useGraphicsStore.subscribe((state, previous) => {
        if (state.renderScale !== previous.renderScale) resize()
      })
      onLoading?.({ progress: 42, label: '正在创建世界场景' })
      const scene = createWorldScene(engine, canvas, { onLoading, onReady })
      performanceMonitor = createPerformanceMonitor(engine, scene, canvas)
      engine.runRenderLoop(() => {
        try {
          const started = performanceMonitor.begin()
          scene.render()
          performanceMonitor.end(started)
        }
        catch (cause) {
          engine.stopRenderLoop()
          const message = `世界加载失败：${cause.message || '未知错误'}`
          setError(message)
          onError?.(message)
        }
      })
      resizeObserver = new ResizeObserver(() => engine.resize())
      resizeObserver.observe(canvas)
    } catch (cause) {
      console.error('Unable to initialize Babylon scene:', cause)
      const message = '3D 场景启动失败，请使用支持 WebGL 的浏览器并开启硬件加速。'
      setError(message)
      onError?.(message)
      resizeObserver?.disconnect()
      unsubscribeGraphics?.()
      performanceMonitor?.dispose()
      engine?.dispose()
      return
    }

    return () => {
      resizeObserver?.disconnect()
      unsubscribeGraphics?.()
      performanceMonitor?.dispose()
      engine.dispose()
    }
  }, [])

  return (
    <>
      <canvas ref={canvasRef} className="block h-full w-full outline-none" aria-label="第三人称武侠场景，WASD 移动，空格两段跳，点击场景后移动鼠标转动视角，Tab 释放鼠标" />
      {error && <p role="alert" className="absolute inset-x-6 top-1/2 rounded-xl bg-red-950 p-4 text-red-100">{error}</p>}
    </>
  )
}
