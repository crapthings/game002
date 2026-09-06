import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useWorldStore } from '../stores/useWorldStore.js'
import WorldPlanView, { zoneColors, zoneLabels } from '../components/WorldPlanView.jsx'
import { terrainLayers } from '../game/debug/terrainLayers.js'

const control='rounded-md border border-white/15 bg-white/5 px-3 py-2 text-xs text-stone-200 hover:bg-white/10 disabled:opacity-40'
export default function WorldPlanPage() {
  const [params,setParams]=useSearchParams()
  const current=useWorldStore(state=>state.document?.world)
  const storedSeed=useWorldStore(state=>state.seed)
  const [seed,setSeed]=useState(()=>params.get('seed') || current?.seed || storedSeed)
  const [plan,setPlan]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const [selected,setSelected]=useState(null),[focus,setFocus]=useState(null)
  const [source,setSource]=useState('当前算法')
  const [layers,setLayers]=useState({macros:false,regions:false,details:false,settlements:true,roads:true,labels:true,spawns:false})
  const [baseMap,setBaseMap]=useState('ecology')
  const visibleBase = !plan?.topography && !['ecology','regions'].includes(baseMap) ? 'ecology' : baseMap
  const worker=useRef(null)
  const timeout=useRef(null)
  const stopWorker=()=>{
    clearTimeout(timeout.current)
    timeout.current=null
    worker.current?.terminate()
    worker.current=null
  }
  const generate=(value)=>{
    const next=value.trim()
    if(!next){setError('请输入种子');return}
    stopWorker()
    setBusy(true);setError('');setSeed(next)
    setParams({seed:next},{replace:true})
    let task
    try { task=new Worker(new URL('../game/debug/worldPlan.worker.js',import.meta.url),{type:'module'}) }
    catch(error) {setBusy(false);setError(`无法启动规划：${error.message}`);return}
    worker.current=task
    task.onmessage=({data})=>{
      if(worker.current!==task)return
      setBusy(false)
      if(data.error)setError(data.error)
      else {setPlan(data.plan);setSelected(null);setFocus(null);setSource('当前算法')}
      stopWorker()
    }
    task.onerror=(event)=>{if(worker.current!==task)return;setBusy(false);setError(event.message || '规划 Worker 启动失败，请刷新后重试。');stopWorker()}
    task.onmessageerror=()=>{if(worker.current!==task)return;setBusy(false);setError('无法读取规划结果，请重新生成。');stopWorker()}
    timeout.current=setTimeout(()=>{
      if(worker.current!==task)return
      setBusy(false);setError('规划生成超时，请重试或更换种子。');stopWorker()
    },30000)
    task.postMessage({seed:next})
  }
  useEffect(()=>{generate(seed);return stopWorker},[])
  const region=plan?.regions.find(item=>item.id===selected)
  const town=plan?.settlements.find(item=>item.regionId===selected)
  const area=region?(region.bounds.maxX-region.bounds.minX)*(region.bounds.maxZ-region.bounds.minZ):0
  const routedRoads = plan?.roads.filter(road => road.routing) || []
  return <main className="flex h-dvh min-h-96 flex-col bg-[#0c1314] text-stone-200">
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
      <div><h1 className="text-sm font-semibold">世界规划调试</h1><p className="mt-1 text-[10px] text-stone-500">2048 × 2048 m · 北 +Z · 平面覆盖预览</p></div>
      <form className="flex min-w-0 flex-wrap gap-2" onSubmit={event=>{event.preventDefault();generate(seed)}}>
        <input aria-label="世界种子" value={seed} maxLength={80} onChange={event=>setSeed(event.target.value)} className="min-w-0 flex-1 rounded-md border border-white/15 bg-black/30 px-3 py-2 text-xs sm:w-48"/>
        <button type="button" title="随机种子并生成" aria-label="随机种子并生成" className={control} onClick={()=>generate(Array.from(crypto.getRandomValues(new Uint32Array(2)),value=>value.toString(36)).join('-'))}>⚄</button>
        <button className={control} type="submit">{busy?'重新生成':'生成预览'}</button>
        <Link className={control} to="/">菜单</Link>
      </form>
    </header>
    <div className="flex shrink-0 flex-wrap items-center gap-4 border-b border-white/10 px-4 py-2 text-xs">
      <select aria-label="底图图层" className="rounded border border-white/15 bg-[#172321] px-2 py-1.5 text-xs" value={visibleBase} onChange={event=>setBaseMap(event.target.value)}>{Object.entries(terrainLayers).map(([key,value])=><option key={key} value={key} disabled={!plan?.topography && !['ecology','regions'].includes(key)}>{value.label}</option>)}</select>
      {Object.entries({macros:'2×2 大板块',regions:'4×4 区域',details:'8×8 细分',settlements:'聚落 / 街区',roads:'道路中心线',labels:'区域名称',spawns:'感染者出生点'}).map(([key,label])=><label key={key} className="flex items-center gap-1.5"><input type="checkbox" checked={layers[key]} onChange={event=>setLayers(value=>({...value,[key]:event.target.checked}))}/>{label}</label>)}
      <button className={control} onClick={()=>setFocus(null)}>全世界</button>
      <button className={control} disabled={!region} onClick={()=>setFocus(region.bounds)}>聚焦所选区域</button>
      {current && <button className={control} onClick={()=>{stopWorker();setBusy(false);setError('');setPlan(current);setSource('本次游戏快照');setSelected(null);setFocus(null)}}>查看本次游戏快照</button>}
    </div>
    <div className="grid min-h-0 flex-1 grid-rows-[minmax(240px,1fr)_180px] md:grid-cols-[minmax(0,1fr)_250px] md:grid-rows-1">
      <section className="relative min-h-0 overflow-hidden" aria-label="世界平面图">
        {plan && <WorldPlanView plan={plan} selected={selected} onSelect={setSelected} focus={focus} layers={layers} baseMap={visibleBase}/>}
        {(busy || error) && <p role="status" className="absolute left-4 top-4 rounded bg-black/80 px-3 py-2 text-xs text-amber-200">{error || '正在计算当前算法…'}</p>}
        {plan && <p className="pointer-events-none absolute bottom-3 left-4 text-[10px] text-stone-400">{source} · seed: {plan.seed} · 点击色块查看区域</p>}
      </section>
      <aside className="min-h-0 overflow-y-auto border-t border-white/10 bg-[#111b1a] p-4 md:border-l md:border-t-0">
        <h2 className="text-xs font-semibold">{region?.name || '世界概览'}</h2>
        <p className="mt-2 text-[10px] leading-5 text-stone-400">{terrainLayers[visibleBase].legend}</p>
        {plan?.topography && <p className="mt-1 text-[10px] leading-5 text-stone-500">地形图层为聚落整地前数据。游戏内聚落按选址标高整平，道路贴合地面。</p>}
        {routedRoads.length > 0 && <div className="mt-3 rounded border border-white/10 p-2 text-[10px] leading-5 text-stone-400">
          <p>区域公路 {routedRoads.length} 条 · {(routedRoads.reduce((sum, road) => sum + road.routing.length, 0)/1000).toFixed(2)} km</p>
          <p>潮湿路段约 {Math.round(routedRoads.reduce((sum, road) => sum + road.routing.wetLength, 0))} m</p>
          <p>16 m 寻路 · 绕坡 / 避湿地 · 聚落占地避让</p>
          <p className="text-stone-500">潮湿段按湿度 &gt; 0.72 统计。地形为软约束，尚无桥梁或道路纵坡工程。</p>
        </div>}
        {region?.site && <div className="mt-3 rounded border border-white/10 p-2 text-[10px] leading-5 text-stone-400">
          <p className={region.site.qualified?'text-emerald-300':'text-amber-300'}>{region.site.qualified?'选址达标':'备选位置 · 需要额外整地'}</p>
          <p>比较 {region.site.candidateCount} 个位置 · 标高 {region.site.elevation.toFixed(1)} m</p>
          <p>连通可建率 {(region.site.coverage*100).toFixed(0)}% · 约 {Math.round(region.site.buildableArea)} m²</p>
          <p>平均坡度 {region.site.meanSlope.toFixed(1)}° · 占地高差 {region.site.relief.toFixed(1)} m</p>
          <p>要求：坡度 ≤ {region.site.policy.slope}°，连通率 ≥ {region.site.policy.coverage*100}%，高差 ≤ {region.site.policy.relief} m</p>
        </div>}
        <p className="mt-2 text-xs leading-6 text-stone-400">{region?`${Math.round(area)} m² · 占全图 ${(area/(plan.size*plan.size)*100).toFixed(1)}%`:'4.19 km² · 16 个规划区域'}<br/>{town?`${town.placements.length} 栋建筑 · ${town.blocks?.length || 0} 个街区`:region?'自然生态区域':'城市小 / 中 / 大各一座，另有四个村庄'}</p>
        {region && <p className="mt-2 font-mono text-[10px] leading-5 text-stone-500">X {region.bounds.minX} ～ {region.bounds.maxX}<br/>Z {region.bounds.minZ} ～ {region.bounds.maxZ}</p>}
        <h2 className="mb-2 mt-5 text-xs">区域图例</h2>
        <div className="grid grid-cols-2 gap-2">{Object.entries(zoneLabels).map(([key,label])=><span key={key} className="flex items-center gap-2 text-[10px] text-stone-400"><i className="h-2.5 w-2.5 rounded-sm" style={{background:zoneColors[key]}}/>{label}</span>)}</div>
        <p className="mt-4 text-[10px] leading-5 text-stone-500">街区：绿为住宅，黄为商业，紫为工业，蓝为公共设施，深绿为公园。新世界按 1024 / 512 / 256 m 分层管理；生态底色以 32 m 精度采样游戏算法，边界线仅表示管理范围。旧快照保留原生态圈。</p>
        <div className="mt-4 space-y-1">{plan?.regions.map(item=><button key={item.id} className={`block w-full rounded px-2 py-1.5 text-left text-xs ${selected===item.id?'bg-emerald-900/50 text-emerald-200':'text-stone-400 hover:bg-white/5'}`} onClick={()=>{setSelected(item.id);if(focus)setFocus(item.bounds)}}>{item.name}</button>)}</div>
        <p className="mt-4 text-[10px] leading-5 text-stone-500">当前算法预览不读取或覆盖存档。旧世界的布局可能不同，可用本次游戏快照对比。道路为规划线形，不是破损路面贴图。</p>
      </aside>
    </div>
  </main>
}
