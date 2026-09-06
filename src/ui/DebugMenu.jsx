import { useEffect, useRef } from 'react'
import { useDebugStore } from '../stores/useDebugStore.js'
import { useGameStore } from '../stores/useGameStore.js'
import { useSpawnStatsStore } from '../stores/useSpawnStatsStore.js'

export default function DebugMenu() {
  const debug = useDebugStore()
  const stats = useSpawnStatsStore()
  const close = useGameStore(state => state.closeDebug)
  const ref = useRef(null)
  useEffect(() => { ref.current?.querySelector('button')?.focus() }, [])
  const keyDown = event => {
    if (event.code === 'Escape' || event.code === 'F2') { event.preventDefault(); event.stopPropagation(); close() }
    if (event.key === 'Tab') {
      const controls = [...ref.current.querySelectorAll('button,input,select')]
      const index = controls.indexOf(document.activeElement)
      event.preventDefault()
      controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length]?.focus()
    }
  }
  return <section ref={ref} role="dialog" aria-modal="true" aria-labelledby="debug-title" onKeyDown={keyDown} className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
    <div className="max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-xl border border-white/15 bg-[#121c19] p-4 text-stone-200 shadow-xl">
      <header className="mb-4 flex items-center justify-between"><h2 id="debug-title" className="text-sm font-semibold">开发调试</h2><button onClick={close} className="rounded border border-white/15 px-2 py-1 text-xs hover:bg-white/10">关闭 · F2 / Esc</button></header>
      <div className="space-y-4 text-sm">
        <div className="rounded bg-white/5 p-2 text-xs leading-5 text-stone-400">感染者：已准备 {stats.active}/32 · 可见 {stats.visible}<br/>全图出生点 {stats.planned} · 视野内延迟 {stats.deferred}</div>
        <label className="flex items-center justify-between gap-4"><span>暂停新增感染者</span><input type="checkbox" checked={debug.pauseSpawning} onChange={event=>debug.setPauseSpawning(event.target.checked)}/></label>
        <label className="flex items-center justify-between gap-4"><span>地图显示出生点<small className="block text-xs text-stone-500">橙点是规划位置，不代表活怪；穿透迷雾</small></span><input type="checkbox" checked={debug.showSpawns} onChange={event=>debug.setShowSpawns(event.target.checked)}/></label>
        <label className="flex items-center justify-between gap-4"><span>地图全显 <small className="block text-xs text-stone-500">M 地图与雷达忽略迷雾</small></span><input type="checkbox" checked={debug.revealMap} onChange={event => debug.setRevealMap(event.target.checked)}/></label>
        <label className="flex items-center justify-between gap-4"><span>无限奔跑 <small className="block text-xs text-stone-500">冻结体力，忽略力竭与饥渴限跑</small></span><input type="checkbox" checked={debug.infiniteSprint} onChange={event => debug.setInfiniteSprint(event.target.checked)}/></label>
        <label className="flex items-center justify-between gap-4"><span>奔跑速度 <small className="block text-xs text-stone-500">按住 Shift 生效，步行不变</small></span><select className="rounded border border-white/15 bg-[#23342c] px-2 py-1" value={debug.sprintMultiplier} onChange={event => debug.setSprintMultiplier(event.target.value)}>{[1,2,3,4].map(value => <option key={value} value={value}>{value}×</option>)}</select></label>
      </div>
      <footer className="mt-5 border-t border-white/10 pt-3"><button onClick={debug.reset} className="rounded border border-white/15 px-3 py-1.5 text-xs hover:bg-white/10">恢复默认</button><p className="mt-3 text-[11px] leading-5 text-stone-500">菜单打开时世界暂停。设置仅本次页面会话有效；地图全显不会写入探索记录。调试移动仍会正常保存位置与沿途探索。</p></footer>
    </div>
  </section>
}
