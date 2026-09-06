import { usePlayerStatusStore } from '../stores/usePlayerStatusStore.js'
import { useWorldStore } from '../stores/useWorldStore.js'

const labels = { idle: '就绪', walking: '行走', running: '奔跑', recovering: '恢复中', exhausted: '力竭 · 恢复至 25 可奔跑' }

export default function PlayerStatusHud() {
  const { current, max, mode } = usePlayerStatusStore()
  const needs = useWorldStore(state => state.document?.progress.survival)
  const food = Math.ceil(needs?.food ?? 100), water = Math.ceil(needs?.water ?? 100)
  const low = current <= 25 || mode === 'exhausted'
  return (
    <aside aria-label="角色状态" className="pointer-events-none absolute bottom-24 left-3 w-48 rounded-xl border border-stone-400/20 bg-stone-950/85 p-3 shadow-xl lg:bottom-5 lg:left-5 lg:w-60">
      <div className="mb-3 flex items-center justify-between text-[10px] tracking-[0.2em] text-stone-400"><span>侠客</span><span className={low ? 'text-amber-300' : 'text-emerald-200'}>{labels[mode]}</span></div>
      <div className="mb-2 flex items-center justify-between text-xs text-stone-200"><span>体力</span><span className="font-mono tabular-nums">{current} <span className="text-stone-500">/ {max}</span></span></div>
      <div role="progressbar" aria-label="体力" aria-valuemin={0} aria-valuemax={max} aria-valuenow={current} className="h-1.5 overflow-hidden rounded-full bg-stone-700/70">
        <div className={`h-full rounded-full transition-[width] duration-100 motion-reduce:transition-none ${low ? 'bg-amber-400' : 'bg-emerald-300'}`} style={{ width: `${current / max * 100}%` }} />
      </div>
      {[['饱食',food,'bg-amber-300'],['水分',water,'bg-sky-300']].map(([label,value,color]) => <div key={label} className="mt-3">
        <div className="mb-1 flex justify-between text-xs text-stone-300"><span>{label}</span><span className={value <= 20 ? 'text-amber-300' : 'text-stone-400'}>{value} / 100</span></div>
        <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} className="h-1.5 overflow-hidden rounded bg-stone-700/70"><div className={`h-full transition-[width] ${value <= 20 ? 'bg-orange-400' : color}`} style={{ width: `${value}%` }} /></div>
      </div>)}
      <p className="mt-2 text-[10px] text-stone-500">{food === 0 || water === 0 ? '饥饿 / 脱水 · 无法奔跑' : food <= 20 ? '需要进食' : water <= 20 ? '需要补水' : 'Shift 奔跑'}</p>
    </aside>
  )
}
