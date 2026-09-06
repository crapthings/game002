import { create } from 'zustand'

export const useGameStore = create((set) => ({
  phase: 'menu',
  sessionAuthorized: false,
  debugReturnPhase: 'playing',
  openDebug: () => set(state => ['playing', 'paused'].includes(state.phase) ? { phase: 'debug', debugReturnPhase: state.phase } : state),
  closeDebug: () => set(state => state.phase === 'debug' ? { phase: state.debugReturnPhase } : state),
  beginLoading: () => set({ phase: 'loading', sessionAuthorized: true }),
  openMap: () => set((state) => state.phase === 'playing' ? { phase: 'map' } : state),
  closeMap: () => set((state) => state.phase === 'map' ? { phase: 'playing' } : state),
  startGame: () => set((state) => state.phase === 'loading' ? { phase: 'playing' } : state),
  pauseGame: () => set((state) => state.phase === 'playing' ? { phase: 'paused' } : state),
  resumeGame: () => set((state) => state.phase === 'paused' ? { phase: 'playing' } : state),
  returnToMenu: () => set({ phase: 'menu', sessionAuthorized: false }),
}))
