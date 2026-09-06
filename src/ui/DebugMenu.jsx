import { useEffect, useRef } from 'react'
import { useDebugStore } from '../stores/useDebugStore.js'
import { useGameStore } from '../stores/useGameStore.js'

export default function DebugMenu() {
  const debug = useDebugStore()
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
        <label className="flex items-center justify-between gap-4"><span>地图瞬移 <small className="block text-xs text-stone-500">M 地图点击落点，从安全高度落下；拖动仍为平移</small></span><input type="checkbox" checked={debug.teleportMode} onChange={event => debug.setTeleportMode(event.target.checked)}/></label>
        <label className="flex items-center justify-between gap-4"><span>地图全显 <small className="block text-xs text-stone-500">M 地图与雷达忽略迷雾</small></span><input type="checkbox" checked={debug.revealMap} onChange={event => debug.setRevealMap(event.target.checked)}/></label>
        <label className="flex items-center justify-between gap-4"><span>无限奔跑 <small className="block text-xs text-stone-500">冻结体力，忽略力竭限跑</small></span><input type="checkbox" checked={debug.infiniteSprint} onChange={event => debug.setInfiniteSprint(event.target.checked)}/></label>
        <label className="flex items-center justify-between gap-4"><span>奔跑速度 <small className="block text-xs text-stone-500">按住 Shift 生效，步行不变</small></span><select className="rounded border border-white/15 bg-[#23342c] px-2 py-1" value={debug.sprintMultiplier} onChange={event => debug.setSprintMultiplier(event.target.value)}>{[1,2,3,4].map(value => <option key={value} value={value}>{value}×</option>)}</select></label>
      </div>
      <footer className="mt-5 border-t border-white/10 pt-3"><button onClick={debug.reset} className="rounded border border-white/15 px-3 py-1.5 text-xs hover:bg-white/10">恢复默认</button><p className="mt-3 text-[11px] leading-5 text-stone-500">菜单打开时世界暂停。设置自动保存，刷新和重新进入后保留；地图全显不会写入探索记录。调试移动仍会正常保存位置与沿途探索。</p></footer>
    </div>
  </section>
}
