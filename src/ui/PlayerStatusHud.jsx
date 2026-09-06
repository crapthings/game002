import { usePlayerStatusStore } from '../stores/usePlayerStatusStore.js'

const labels = { idle: '就绪', walking: '行走', running: '奔跑', recovering: '恢复中', exhausted: '力竭 · 恢复至 25 可奔跑' }

export default function PlayerStatusHud() {
  const { current, max, mode } = usePlayerStatusStore()
  const low = current <= 25 || mode === 'exhausted'
  return (
    <aside aria-label="角色状态" className="pointer-events-none absolute bottom-24 left-3 w-48 rounded-xl border border-stone-400/20 bg-stone-950/85 p-3 shadow-xl lg:bottom-5 lg:left-5 lg:w-60">
      <div className="mb-3 flex items-center justify-between text-[10px] tracking-[0.2em] text-stone-400"><span>侠客</span><span className={low ? 'text-amber-300' : 'text-emerald-200'}>{labels[mode]}</span></div>
      <div className="mb-2 flex items-center justify-between text-xs text-stone-200"><span>体力</span><span className="font-mono tabular-nums">{current} <span className="text-stone-500">/ {max}</span></span></div>
      <div role="progressbar" aria-label="体力" aria-valuemin={0} aria-valuemax={max} aria-valuenow={current} className="h-1.5 overflow-hidden rounded-full bg-stone-700/70">
        <div className={`h-full rounded-full transition-[width] duration-100 motion-reduce:transition-none ${low ? 'bg-amber-400' : 'bg-emerald-300'}`} style={{ width: `${current / max * 100}%` }} />
      </div>
      <p className="mt-2 text-[10px] text-stone-500">Shift 奔跑 · 空格两段跳</p>
    </aside>
  )
}
