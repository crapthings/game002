import { useGraphicsStore, VIEW_DISTANCE } from '../stores/useGraphicsStore.js'

export default function GraphicsSettings() {
  const distance = useGraphicsStore(state => state.viewDistance)
  const setDistance = useGraphicsStore(state => state.setViewDistance)
  return <fieldset className="mt-5 rounded-xl border border-white/10 p-4">
    <legend className="px-2 text-sm text-emerald-300">图形配置</legend>
    <label htmlFor="view-distance" className="flex justify-between text-sm text-slate-200"><span>可视范围</span><output>{distance} 米</output></label>
    <input id="view-distance" type="range" min={VIEW_DISTANCE.min} max={VIEW_DISTANCE.max} step={VIEW_DISTANCE.step} value={distance} onChange={event => setDistance(event.target.value)} className="mt-3 w-full accent-emerald-300" aria-valuetext={`${distance} 米`} />
    <p className="mt-2 text-xs leading-5 text-slate-400">即时生效并自动保存。调低可减少远处地形和自然素材的加载与计算。</p>
  </fieldset>
}
