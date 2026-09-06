import { create } from 'zustand'
export const useSpawnStatsStore = create(set => ({ active:0,visible:0,planned:0,deferred:0,publish:value=>set(value) }))
