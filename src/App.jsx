import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import MenuPage from './pages/MenuPage.jsx'
import { useGameStore } from './stores/useGameStore.js'

const GamePage = lazy(() => import('./pages/GamePage.jsx'))
const AssetGalleryPage = lazy(() => import('./pages/AssetGalleryPage.jsx'))
const WorldPlanPage = lazy(() => import('./pages/WorldPlanPage.jsx'))

function LoadingScreen({ title = '进入江湖', label = '正在载入游戏模块' }) {
  return <main className="flex h-dvh min-h-96 items-center justify-center bg-slate-950 p-6"><div className="w-full max-w-sm"><p className="text-xs font-semibold tracking-[0.25em] text-emerald-300">GAME002</p><h1 className="mt-3 text-2xl font-semibold text-stone-100">{title}</h1><div className="mt-7 h-1.5 overflow-hidden rounded-full bg-stone-800" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={12}><div className="h-full w-[12%] rounded-full bg-emerald-300" /></div><div className="mt-3 flex justify-between text-xs text-stone-500"><span>{label}</span><span className="font-mono">12%</span></div></div></main>
}

function GameRoute() {
  const location = useLocation()
  const sessionAuthorized = useGameStore((state) => state.sessionAuthorized)
  if (!location.state?.started || !sessionAuthorized) return <Navigate to="/" replace />
  return <Suspense fallback={<LoadingScreen />}><GamePage seed={location.state.seed} /></Suspense>
}

export default function App() {
  return <HashRouter><Routes><Route path="/" element={<MenuPage />} /><Route path="/game" element={<GameRoute />} /><Route path="/assets" element={<Suspense fallback={<LoadingScreen title="打开资产目录" label="正在载入预览工具" />}><AssetGalleryPage /></Suspense>} /><Route path="/world-plan" element={<Suspense fallback={<LoadingScreen title="世界规划调试" label="正在载入规划工具" />}><WorldPlanPage /></Suspense>} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></HashRouter>
}
