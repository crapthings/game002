import { EngineInstrumentation } from '@babylonjs/core/Instrumentation/engineInstrumentation'
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation'
import '@babylonjs/core/Engines/Extensions/engine.query'
import { useGraphicsStore } from '../../stores/useGraphicsStore.js'
import { usePerformanceStore } from '../../stores/usePerformanceStore.js'

// Opt-in, sampled twice per second. GPU queries are asynchronous and unsupported
// timers are reported as null, never as an invented zero-cost GPU frame.
export function createPerformanceMonitor(engine, scene, canvas) {
  let instrumentation = null, gpu = null, since = 0, frames = 0, cpu = 0
  function configure() {
    const enabled = useGraphicsStore.getState().showPerformance
    if (enabled === Boolean(instrumentation)) return
    if (enabled) {
      instrumentation = new SceneInstrumentation(scene)
      instrumentation.captureActiveMeshesEvaluationTime = true
      gpu = new EngineInstrumentation(engine)
      if (engine.getCaps().timerQuery) gpu.captureGPUFrameTime = true
      since = performance.now(); frames = 0; cpu = 0
    } else {
      instrumentation.dispose(); gpu.dispose()
      instrumentation = null; gpu = null
      usePerformanceStore.getState().publish(null)
      delete canvas.dataset.performance
    }
  }
  configure()
  const unsubscribe = useGraphicsStore.subscribe(configure)
  return {
    begin: () => instrumentation ? performance.now() : 0,
    end(started) {
      if (!instrumentation) return
      const now = performance.now()
      frames++; cpu += now - started
      if (now - since < 500) return
      const counter = gpu.captureGPUFrameTime ? gpu.gpuFrameTimeCounter : null
      const sample = {
        fps: frames * 1000 / (now - since), frameMs: (now - since) / frames,
        sceneCpuMs: cpu / frames, gpuMs: counter?.count > 0 ? counter.current / 1e6 : null,
        meshEvaluationMs: instrumentation.activeMeshesEvaluationTimeCounter.current,
        gpuSupported: Boolean(engine.getCaps().timerQuery),
        drawCalls: instrumentation.drawCallsCounter.current,
        meshes: scene.meshes.length, activeMeshes: scene.getActiveMeshes().length,
        width: engine.getRenderWidth(), height: engine.getRenderHeight(),
        world: scene.metadata?.readPerformanceStats?.() ?? null,
      }
      usePerformanceStore.getState().publish(sample)
      if (import.meta.env.DEV) canvas.dataset.performance = JSON.stringify(sample)
      since = now; frames = 0; cpu = 0
    },
    dispose() {
      unsubscribe(); instrumentation?.dispose(); gpu?.dispose()
      usePerformanceStore.getState().publish(null)
      delete canvas.dataset.performance
    },
  }
}
