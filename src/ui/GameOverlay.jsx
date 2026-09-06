import AudioSettings from './AudioSettings.jsx'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../stores/useGameStore.js'
import { useWorldStore } from '../stores/useWorldStore.js'
import RadarHud from './map/RadarHud.jsx'
import WorldMap from './map/WorldMap.jsx'
import PlayerStatusHud from './PlayerStatusHud.jsx'
import WorldTimeHud from './WorldTimeHud.jsx'
import DebugMenu from './DebugMenu.jsx'
import { useDebugStore } from '../stores/useDebugStore.js'
import GraphicsSettings from './GraphicsSettings.jsx'

const buttonClass = 'rounded-xl border border-white/15 bg-slate-800 px-5 py-3 text-sm font-medium transition hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300'

export default function GameOverlay() {
  const navigate = useNavigate()
  const phase = useGameStore((state) => state.phase)
  const resumeGame = useGameStore((state) => state.resumeGame)
  const returnToMenu = useGameStore((state) => state.returnToMenu)
  const error = useWorldStore((state) => state.error)
  const debugActive = useDebugStore(state => state.teleportMode || state.revealMap || state.infiniteSprint || state.sprintMultiplier !== 1)
  const errorMessage = error && <p role="alert" className="rounded-xl bg-red-950 p-3 text-sm text-red-100">{error}</p>

  if (phase === 'loading') return null
  if (phase === 'debug') return <DebugMenu />
  if (phase === 'playing' || phase === 'map') {
    return (
      <>
        <RadarHud />
        <PlayerStatusHud />
        <WorldTimeHud />
        {phase === 'playing' && <button type="button" onClick={() => useGameStore.getState().openDebug()} className={`absolute left-4 top-20 z-10 rounded border border-white/10 bg-black/65 px-2 py-1 text-[10px] hover:text-emerald-200 ${debugActive ? 'text-amber-300' : 'text-stone-400'}`}>{debugActive ? '调试已启用' : '开发'} · F2</button>}
        {phase === 'map' && <WorldMap />}

        {error && <div className="absolute bottom-4 right-4 z-30 max-w-sm">{errorMessage}</div>}
      </>
    )
  }

  return (
    <section className="absolute inset-0 flex items-center justify-center overflow-y-auto bg-slate-950/55 p-6 backdrop-blur-sm" aria-label="暂停菜单">
      <div className="my-auto w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900/90 p-8 shadow-2xl">
        <p className="text-xs font-semibold tracking-widest text-emerald-300">GAME002</p>
        <h1 className="mt-3 text-3xl font-semibold">游戏已暂停</h1>
        <p className="mt-4 text-sm leading-6 text-slate-400">旅途暂歇。继续探索，或返回菜单切换世界。</p>
        <p className="mt-3 text-xs leading-5 text-slate-400">WASD 移动 · Shift 奔跑 · 空格轻功 / 再按二段跳 · 贴墙按住空格＋方向攀跑 / 松开再按蹬墙 · 双击方向冲刺 · 左键拖动视角 · 滚轮缩放</p>
        <GraphicsSettings />
        <AudioSettings />
        <div className="mt-6 flex flex-col gap-3">
          {errorMessage}
          <button type="button" className={buttonClass} onClick={resumeGame}>继续游戏</button>
          <button type="button" className={buttonClass} onClick={() => useGameStore.getState().openDebug()}>开发调试 · F2</button>
          <button type="button" className={buttonClass} onClick={() => { returnToMenu(); navigate('/', { replace: true }) }}>返回主菜单</button>
        </div>
      </div>
    </section>
  )
}
