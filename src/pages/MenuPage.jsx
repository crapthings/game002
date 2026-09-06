import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useGameStore } from '../stores/useGameStore.js'
import { useWorldStore } from '../stores/useWorldStore.js'

const buttonClass = 'rounded-xl border border-white/15 bg-slate-800 px-5 py-3 text-sm font-medium transition hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300'

export default function MenuPage() {
  const navigate = useNavigate()
  const initialize = useWorldStore((state) => state.initialize)
  const seed = useWorldStore((state) => state.seed)
  const error = useWorldStore((state) => state.error)
  const beginLoading = useGameStore((state) => state.beginLoading)
  const [seedInput, setSeedInput] = useState(seed)
  useEffect(() => { initialize() }, [initialize])
  useEffect(() => { setSeedInput(seed) }, [seed])
  return (
    <main className="flex h-dvh min-h-96 items-center justify-center overflow-y-auto bg-slate-950 p-6">
      <section className="my-auto w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900/90 p-8 shadow-2xl" aria-label="开始菜单">
        <p className="text-xs font-semibold tracking-widest text-emerald-300">GAME001</p>
        <h1 className="mt-3 text-3xl font-semibold">余生 · 失落之地</h1>
        <p className="mt-4 text-sm leading-6 text-slate-400">在 512 × 512 米的土地上，从中央城镇出发，沿街巷向城郊与野外探索。</p>
        <form className="mt-6 flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); const nextSeed = seedInput.trim(); if (!nextSeed) return; beginLoading(); navigate('/game', { state: { started: true, seed: nextSeed } }) }}>
          <label htmlFor="world-seed" className="text-sm text-slate-300">世界种子</label>
          <div className="flex items-stretch gap-2">
            <input id="world-seed" value={seedInput} onChange={(event) => setSeedInput(event.target.value)} maxLength={80} required className="min-w-0 flex-1 rounded-xl border border-white/15 bg-slate-950 px-4 py-3 text-sm" autoComplete="off" />
            <button type="button" aria-label="随机生成世界种子" title="随机生成世界种子" onClick={() => setSeedInput(Array.from(crypto.getRandomValues(new Uint32Array(2)), value => value.toString(36)).join('-'))} className="flex w-12 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-slate-800 text-emerald-300 transition hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <rect x="3" y="3" width="18" height="18" rx="4" />
                <circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" /><circle cx="16" cy="8" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="8" cy="16" r="1" fill="currentColor" stroke="none" /><circle cx="16" cy="16" r="1" fill="currentColor" stroke="none" />
              </svg>
            </button>
          </div>
          <p className="text-xs leading-5 text-slate-500">世界数据与 3D 素材只会在点击进入后加载。刷新页面会回到此菜单。</p>
          {error && <p role="alert" className="rounded-xl bg-red-950 p-3 text-sm text-red-100">{error}</p>}
          <button type="submit" className={buttonClass}>进入世界</button>
        </form>
        <div className="mt-5 border-t border-white/10 pt-5 text-center"><Link to="/assets" className="text-xs text-stone-500 underline-offset-4 hover:text-emerald-300 hover:underline">开发者资产目录</Link><Link to="/world-plan" className="ml-4 text-xs text-stone-500 underline-offset-4 hover:text-emerald-300 hover:underline">世界规划调试</Link></div>
      </section>
    </main>
  )
}
