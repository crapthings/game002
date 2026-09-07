import { useEffect, useState } from 'react'
export default function MouseLookHint() {
  const [locked,setLocked] = useState(!!document.pointerLockElement)
  const [error,setError] = useState('')
  useEffect(() => {
    const failed = event => setError(event.detail)
    document.addEventListener('game-pointer-status',failed)
    const changed = () => setLocked(!!document.pointerLockElement)
    document.addEventListener('pointerlockchange',changed)
    return () => { document.removeEventListener('pointerlockchange',changed); document.removeEventListener('game-pointer-status',failed) }
  },[])
  return <p className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded bg-black/65 px-3 py-2 text-xs text-stone-200">{locked ? '鼠标转动视角 · Tab 操作面板 · Esc 暂停' : error || '点击场景控制视角 · 面板可直接点击'}</p>
}
