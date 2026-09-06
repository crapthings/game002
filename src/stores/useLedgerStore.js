import { create } from 'zustand'

export const useLedgerStore = create((set, get) => ({
  view: null, message: '', commands: [],
  publish: view => set({ view }),
  notify: message => set({ message }),
  request: kind => {
    if (!['take','settle','mask','buy-medicine','buy-ration','sell-medicine','sell-ration','use-medicine','use-ration','aid'].includes(kind) || get().commands.length >= 4) return
    set(state => ({ commands: [...state.commands, kind] }))
  },
  drain: () => { const commands = get().commands; set({ commands: [] }); return commands },
  clearCommands: () => set({ commands: [] }),
  reset: () => set({ view: null, message: '', commands: [] }),
}))
