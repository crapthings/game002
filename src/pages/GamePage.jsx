import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import GameCanvas from '../components/GameCanvas.jsx'
import GameOverlay from '../ui/GameOverlay.jsx'
import { useGameStore } from '../stores/useGameStore.js'
import { useWorldStore } from '../stores/useWorldStore.js'

export default function GamePage({ seed }) {
  const navigate = useNavigate()
  const phase = useGameStore((state) => state.phase)
  const [prepared, setPrepared] = useState(false)
  const [loading, setLoading] = useState({ progress: 24, label: '正在读取世界规划' })
  useEffect(() => {
    let cancelled = false
    useWorldStore.getState().openWorld(seed).then((opened) => {
      if (cancelled) return
      if (!opened) { useGameStore.getState().returnToMenu(); navigate('/', { replace: true }); return }
      setPrepared(true)
    })
    return () => { cancelled = true }
  }, [navigate, seed])
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || /INPUT|TEXTAREA|SELECT/.test(event.target?.tagName) || event.target?.isContentEditable) return
      const state = useGameStore.getState()
      if (event.code === 'F2' && ['playing', 'paused', 'debug'].includes(state.phase)) {
        event.preventDefault()
        if (state.phase === 'debug') state.closeDebug()
        else state.openDebug()
      } else if (event.code === 'KeyM' && (state.phase === 'playing' || state.phase === 'map')) {
        event.preventDefault()
        if (state.phase === 'map') state.closeMap()
        else state.openMap()
      } else if (event.code === 'Escape') {
        event.preventDefault()
        if (state.phase === 'map') state.closeMap()
        else if (state.phase === 'playing') state.pauseGame()
        // Escape may also trigger pointerlockchange: it must never resume a
        // pause caused by the same browser gesture.
      }
    }
    const onVisibilityChange = () => { if (document.hidden) useGameStore.getState().pauseGame() }
    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => { window.removeEventListener('keydown', onKeyDown); document.removeEventListener('visibilitychange', onVisibilityChange) }
  }, [])
  return (
    <main className="relative h-dvh min-h-96 overflow-hidden bg-slate-950">
      {prepared && <GameCanvas onLoading={setLoading} onReady={() => useGameStore.getState().startGame()} onError={(label) => setLoading({ progress: 0, label, error: true })} />}
      {(phase === 'loading' || loading.error) && <LoadingOverlay {...loading} />}
      {prepared && <GameOverlay />}
    </main>
  )
}

function LoadingOverlay({ progress, label, error }) {
  return <section className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950 p-6" aria-label="载入游戏"><div className="w-full max-w-sm"><p className="text-xs font-semibold tracking-[0.25em] text-emerald-300">WORLD STREAM</p><h1 className="mt-3 text-2xl font-semibold">{error ? '无法进入世界' : '正在准备世界'}</h1><div className="mt-7 h-1.5 overflow-hidden rounded-full bg-stone-800" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div className={`h-full rounded-full transition-[width] duration-150 ${error ? 'bg-red-400' : 'bg-emerald-300'}`} style={{ width: `${progress}%` }} /></div><div className={`mt-3 flex justify-between text-xs ${error ? 'text-red-200' : 'text-stone-500'}`}><span>{label}</span><span className="font-mono">{Math.round(progress)}%</span></div>{error && <button type="button" className="mt-6 rounded-lg border border-white/15 px-4 py-2 text-sm text-stone-200" onClick={() => window.location.hash = '/'}>返回菜单</button>}</div></section>
}
