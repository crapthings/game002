import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../../stores/useGameStore.js'
import { useWorldStore } from '../../stores/useWorldStore.js'
import { useNavigationStore } from '../../stores/useNavigationStore.js'
import MapCanvas from './MapCanvas.jsx'
import { useTeleportStore } from '../../stores/useTeleportStore.js'
import { insideWorld } from '../../game/world/worldConfig.js'
import { useDebugStore } from '../../stores/useDebugStore.js'
import { useLivingStore } from '../../stores/useLivingStore.js'

const buttonClass = 'rounded-lg border border-stone-500/30 bg-stone-900 px-3 py-2 text-sm text-stone-200 hover:bg-stone-800 focus-visible:outline-2 focus-visible:outline-emerald-300'

export default function WorldMap() {
  const navigation = useNavigationStore()
  const places=useLivingStore(state=>state.view?.places)
  const teleportMode = useDebugStore(state => state.teleportMode)
  const teleport = useTeleportStore()
  const revealMap = useDebugStore(state => state.revealMap)
  const plan = useWorldStore((state) => state.document?.world)
  const closeMap = useGameStore((state) => state.closeMap)
  const [center, setCenter] = useState(() => ({ x: navigation.position.x, z: navigation.position.z }))
  const [span, setSpan] = useState(256)
  const drag = useRef(null)
  const closeRef = useRef(null)
  const dialogRef = useRef(null)
  useEffect(() => { closeRef.current?.focus() }, [])
  if (!plan) return null
  const zoom = (factor) => setSpan((value) => Math.min(plan.size * 1.125, Math.max(64, value * factor)))
  const endDrag = (event) => {
    const gesture = drag.current
    drag.current = null
    if (gesture && event.type === 'pointerup' && !gesture.moved && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 6 && teleportMode && !teleport.request) {
      const rect = event.currentTarget.getBoundingClientRect()
      const scale = Math.min(rect.width, rect.height) / span
      const x = gesture.center.x + (event.clientX - rect.left - rect.width / 2) / scale
      const z = gesture.center.z - (event.clientY - rect.top - rect.height / 2) / scale
      if (insideWorld(plan.bounds, x, z, 3)) teleport.begin(x, z, plan.seed)
      else teleport.finish('请点击世界边界内的区域。')
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const onKeyDown = (event) => {
    if (event.key === 'Tab') {
      const buttons = [...dialogRef.current.querySelectorAll('button')]
      const index = buttons.indexOf(document.activeElement)
      const next = event.shiftKey ? (index - 1 + buttons.length) % buttons.length : (index + 1) % buttons.length
      event.preventDefault()
      buttons[next]?.focus()
    }
    if (event.target.tagName === 'CANVAS') event.preventDefault()
  }
  return (
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="world-map-title" onKeyDown={onKeyDown} className="absolute inset-0 z-20 flex items-center justify-center bg-black/65 p-3 backdrop-blur-sm sm:p-8">
      <div className="flex h-full max-h-[860px] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-stone-500/30 bg-[#101716] shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-stone-500/20 px-4 py-3 sm:px-6">
          <div><p className="text-[10px] tracking-[0.25em] text-emerald-300/70">江湖舆图</p><h1 id="world-map-title" className="mt-1 text-lg font-semibold text-stone-100">探索地图 · 512 × 512 m</h1></div>
          <button ref={closeRef} type="button" onClick={closeMap} className={buttonClass}>关闭 · M / Esc</button>
        </header>
        <div className="relative min-h-0 flex-1 cursor-grab active:cursor-grabbing">
          <MapCanvas center={center} span={span} navigation={navigation} plan={plan}
            onPointerDown={(event) => {
              if (event.button !== 0 || teleport.request) return
              event.currentTarget.setPointerCapture(event.pointerId)
              drag.current = { x: event.clientX, y: event.clientY, center, moved: false }
            }}
            onPointerMove={(event) => {
              if (!drag.current) return
              if (Math.hypot(event.clientX - drag.current.x, event.clientY - drag.current.y) >= 6) drag.current.moved = true
              if (!drag.current.moved) return
              const rect = event.currentTarget.getBoundingClientRect()
              const unitsPerPixel = span / Math.min(rect.width, rect.height)
              setCenter({ x: drag.current.center.x - (event.clientX - drag.current.x) * unitsPerPixel, z: drag.current.center.z + (event.clientY - drag.current.y) * unitsPerPixel })
            }} onPointerUp={endDrag} onWheel={(event) => { drag.current = null; zoom(event.deltaY > 0 ? 1.15 : 1 / 1.15) }} />
          <div className="absolute bottom-3 right-3 flex flex-wrap justify-end gap-2">
            <button type="button" className={buttonClass} onClick={() => { setCenter({ x: 0, z: 0 }); setSpan(plan.size * 1.125) }}>全域</button>
            <button type="button" className={buttonClass} aria-label="放大地图" onClick={() => zoom(0.75)}>＋</button>
            <button type="button" className={buttonClass} aria-label="缩小地图" onClick={() => zoom(1 / 0.75)}>－</button>
            <button type="button" className={buttonClass} onClick={() => setCenter({ x: navigation.position.x, z: navigation.position.z })}>定位自己</button>
          </div>
        </div>
        {(teleportMode || teleport.message) && <div role="status" aria-live="polite" className="border-t border-emerald-300/15 px-4 py-3 text-xs text-emerald-200">
          {teleport.message || '瞬移模式已开启：点击地图选择落点，拖动仍可平移。'}
          {teleport.request && <><progress className="ml-3 h-2 w-28 accent-emerald-300" max="100" value={teleport.progress} aria-label="落点准备进度" /><button type="button" className="ml-3 underline" onClick={() => teleport.finish('已取消瞬移。')}>取消</button></>}
        </div>}
        {!!places?.length&&<nav aria-label="已知地点" className="flex flex-wrap gap-2 border-t border-stone-500/20 px-4 py-2">
          {places.map(place=><button key={place.id} className={buttonClass} onClick={()=>{setCenter(place.point);setSpan(160);useLivingStore.getState().trackPlace(place.id)}}>{place.label} · {place.explored?'到访过':'已获知'}</button>)}
          <p className="w-full text-xs text-stone-400">空心点为告知的地址，周围仍待探索；人物可能正在外出办事。</p>
        </nav>}
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-500/20 px-4 py-3 text-xs text-stone-400">
          <span>{revealMap ? '开发调试：地图全显 · 真实探索记录不变' : `深黑：未探索 · 暗色：已探索 · 当前视域 ${Math.round(navigation.vision.radius)} m`}</span>
          <span className="font-mono tabular-nums">X {navigation.position.x.toFixed(1)} / Z {navigation.position.z.toFixed(1)}</span>
          <span>拖动平移 · 滚轮缩放 · 北 +Z · 世界已暂停</span>
        </footer>
      </div>
    </section>
  )
}
