import { useGraphicsStore, VIEW_DISTANCE, RENDER_SCALE } from '../stores/useGraphicsStore.js'

export default function GraphicsSettings() {
  const distance = useGraphicsStore(state => state.viewDistance)
  const setDistance = useGraphicsStore(state => state.setViewDistance)
  const scale = useGraphicsStore(state => state.renderScale)
  const setScale = useGraphicsStore(state => state.setRenderScale)
  const showPerformance = useGraphicsStore(state => state.showPerformance)
  const setShowPerformance = useGraphicsStore(state => state.setShowPerformance)
  return <fieldset className="mt-5 rounded-xl border border-white/10 p-4">
    <legend className="px-2 text-sm text-emerald-300">图形配置</legend>
    <label htmlFor="view-distance" className="flex justify-between text-sm text-slate-200"><span>可视范围</span><output>{distance} 米</output></label>
    <input id="view-distance" type="range" min={VIEW_DISTANCE.min} max={VIEW_DISTANCE.max} step={VIEW_DISTANCE.step} value={distance} onChange={event => setDistance(event.target.value)} className="mt-3 w-full accent-emerald-300" aria-valuetext={`${distance} 米`} />
    <p className="mt-2 text-xs leading-5 text-slate-400">即时生效并自动保存。调低可减少远处地形和自然素材的加载与计算。</p>
    <label htmlFor="render-scale" className="mt-4 flex justify-between text-sm text-slate-200"><span>场景渲染精度</span><output>{Math.round(scale * 100)}%</output></label>
    <input id="render-scale" type="range" min={RENDER_SCALE.min} max={RENDER_SCALE.max} step={RENDER_SCALE.step} value={scale} onChange={event => setScale(event.target.value)} className="mt-3 w-full accent-emerald-300" aria-valuetext={`${Math.round(scale * 100)}%`} />
    <p className="mt-2 text-xs leading-5 text-slate-400">默认 100%。降低可提升流畅度，提高可让画面更细腻；菜单文字保持清晰。</p>
    <label className="mt-4 flex items-center justify-between text-sm text-slate-200"><span>显示帧率与性能</span><input type="checkbox" checked={showPerformance} onChange={event => setShowPerformance(event.target.checked)} className="accent-emerald-300" /></label>
  </fieldset>
}
