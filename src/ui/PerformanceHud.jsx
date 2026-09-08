import { useGraphicsStore } from '../stores/useGraphicsStore.js'
import { usePerformanceStore } from '../stores/usePerformanceStore.js'

export default function PerformanceHud() {
  const enabled = useGraphicsStore(state => state.showPerformance)
  const sample = usePerformanceStore(state => state.sample)
  const capture = usePerformanceStore(state => state.capture)
  if (!enabled || !sample) return null
  const download=()=>{
    if(!capture||capture.status==='recording')return
    const url=URL.createObjectURL(new Blob([JSON.stringify(capture,null,2)],{type:'application/json'})),link=document.createElement('a')
    link.href=url;link.download=`world-ledger-performance-${capture.samples[0]?.world?.living?.populationTarget??'scene'}-${Date.now()}.json`
    link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
  }
  return <aside aria-label="渲染性能" className="pointer-events-none absolute right-4 top-4 z-20 rounded border border-white/15 bg-black/80 px-3 py-2 font-mono text-xs leading-5 text-stone-200">
    <p className={sample.fps < 40 ? 'text-amber-300' : 'text-emerald-300'}>{Math.round(sample.fps)} FPS · {sample.frameMs.toFixed(1)} ms/帧</p>
    <p>场景 CPU {sample.sceneCpuMs.toFixed(1)} ms · GPU {sample.gpuMs === null ? (sample.gpuSupported ? '采样中' : '不支持计时') : `${sample.gpuMs.toFixed(1)} ms`}</p>
    <p>Draw calls {sample.drawCalls} · 活跃网格 {sample.activeMeshes}/{sample.meshes}</p>
    <p>网格遍历 {sample.meshEvaluationMs.toFixed(2)} ms</p>
    {sample.world && <>
      <p>模板材质批次 {sample.world.staticMaterialBatchesBefore} → {sample.world.staticMaterialBatchesAfter}</p>
      <p>碰撞体 {sample.world.collisionBodies} · 候选/查询 {sample.world.collisionQueries ? (sample.world.collisionCandidates / sample.world.collisionQueries).toFixed(1) : '—'}</p>
      <p>导航区块 {sample.world.navigationChunks}/{sample.world.navigationCapacity} · 等待 {sample.world.navigationWaiting} · 寻路 {sample.world.navigationPending}</p>
      {sample.world.living&&<>
        <p>具名 NPC {sample.world.living.actors}/{sample.world.living.populationTarget} · 近/远 {sample.world.living.nearActors}/{sample.world.living.farActors}</p>
        <p>近/远轮询 {sample.world.living.nearPolls}/{sample.world.living.farPolls} · 边界帧 {sample.world.living.heldFrames}</p>
        <p>身体待几何 {sample.world.living.bodyWaiting} · 地形受阻 {sample.world.living.bodyBlocked} · 等待让位 {sample.world.living.bodyOverlap}</p>
        <p>保存 {sample.world.living.saveCount}次 · 失败 {sample.world.living.saveFailures}次 · 最近 {sample.world.living.saveLastMs===null?'暂无数据':`${sample.world.living.saveLastMs.toFixed(1)} ms`}</p>
        <p>平均/最慢 {sample.world.living.saveMeanMs===null?'暂无数据':`${sample.world.living.saveMeanMs.toFixed(1)}/${sample.world.living.saveMaxMs.toFixed(1)} ms`}{sample.world.living.savePendingMs!==null?` · 等待 ${sample.world.living.savePendingMs.toFixed(0)} ms`:''}</p>
        <p>活跃请求 {sample.world.living.activeRequests} · 归档 {sample.world.living.archivePages}页 / {sample.world.living.archivedRequests}条</p>
      </>}
    </>}
    <p>{sample.width} × {sample.height}</p>
    <div className="pointer-events-auto mt-2 flex gap-2">
      <button className="rounded border border-white/20 px-2 disabled:opacity-40" disabled={capture?.status!=='recording'&&(sample.phase!=='playing'||sample.world?.living?.actors!==sample.world?.living?.populationTarget||!sample.world?.living)}
        onClick={()=>capture?.status==='recording'?usePerformanceStore.getState().stopCapture():usePerformanceStore.getState().startCapture()}>{capture?.status==='recording'?'停止采集':'采集60秒'}</button>
      {capture?.status!=='recording'&&capture?.samples.length>0&&<button className="rounded border border-white/20 px-2" onClick={download}>导出记录</button>}
    </div>
    {capture&&<p>{capture.status==='recording'?`已采集${capture.samples.length}份`:'采集结束'}{capture.conditionsChanged||capture.interrupted?' · 条件变更或中断，请单独解释':''}</p>}
  </aside>
}
