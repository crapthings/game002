import { useEffect, useRef } from 'react'
import { drawMap } from '../../game/map/drawMap.js'
import { useDebugStore } from '../../stores/useDebugStore.js'

export default function MapCanvas({ center, span, navigation, plan, radar = false, onPointerDown, onPointerMove, onPointerUp, onWheel }) {
  const ref = useRef(null)
  const revealMap = useDebugStore(state => state.revealMap)
  useEffect(() => {
    const canvas = ref.current
    const render = () => {
      const rect = canvas.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      const w = Math.round(rect.width * ratio), h = Math.round(rect.height * ratio)
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
      const context = canvas.getContext('2d')
      if (!context) return
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      drawMap(context, rect.width, rect.height, { center, span, ...navigation, plan, radar, revealMap })
    }
    render()
    const observer = new ResizeObserver(render)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [center, span, navigation, plan, radar, revealMap])
  return <canvas ref={ref} className="block h-full w-full touch-none" aria-label={radar ? '附近探索雷达，北方为世界正 Z 方向' : '探索地图，深色为未探索区域'} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel} />
}
