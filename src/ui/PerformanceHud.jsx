import { useGraphicsStore } from '../stores/useGraphicsStore.js'
import { usePerformanceStore } from '../stores/usePerformanceStore.js'

export default function PerformanceHud() {
  const enabled = useGraphicsStore(state => state.showPerformance)
  const sample = usePerformanceStore(state => state.sample)
  if (!enabled || !sample) return null
  return <aside aria-label="渲染性能" className="pointer-events-none absolute right-4 top-4 z-20 rounded border border-white/15 bg-black/80 px-3 py-2 font-mono text-xs leading-5 text-stone-200">
    <p className={sample.fps < 40 ? 'text-amber-300' : 'text-emerald-300'}>{Math.round(sample.fps)} FPS · {sample.frameMs.toFixed(1)} ms/帧</p>
    <p>场景 CPU {sample.sceneCpuMs.toFixed(1)} ms · GPU {sample.gpuMs === null ? (sample.gpuSupported ? '采样中' : '不支持计时') : `${sample.gpuMs.toFixed(1)} ms`}</p>
    <p>Draw calls {sample.drawCalls} · 活跃网格 {sample.activeMeshes}/{sample.meshes}</p>
    <p>网格遍历 {sample.meshEvaluationMs.toFixed(2)} ms</p>
    {sample.world && <>
      <p>模板材质批次 {sample.world.staticMaterialBatchesBefore} → {sample.world.staticMaterialBatchesAfter}</p>
      <p>碰撞体 {sample.world.collisionBodies} · 候选/查询 {sample.world.collisionQueries ? (sample.world.collisionCandidates / sample.world.collisionQueries).toFixed(1) : '—'}</p>
      <p>导航区块 {sample.world.navigationChunks}/{sample.world.navigationCapacity} · 等待 {sample.world.navigationWaiting} · 寻路 {sample.world.navigationPending}</p>
    </>}
    <p>{sample.width} × {sample.height}</p>
  </aside>
}
