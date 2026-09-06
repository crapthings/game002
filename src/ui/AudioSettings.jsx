import { useAudioStore } from '../stores/useAudioStore.js'
export default function AudioSettings() {
  const {volume,muted,setVolume,setMuted}=useAudioStore()
  return <fieldset className="mt-4 rounded-xl border border-white/10 p-3">
    <legend className="px-1 text-sm text-slate-300">声音</legend>
    <label className="flex items-center justify-between text-sm text-slate-300">静音<input type="checkbox" checked={muted} onChange={event=>setMuted(event.target.checked)} /></label>
    <label className="mt-3 block text-xs text-slate-400">音效音量 · {Math.round(volume*100)}%<input aria-label="音效音量" className="mt-2 block w-full accent-emerald-400" type="range" min="0" max="100" step="1" value={Math.round(volume*100)} onChange={event=>setVolume(Number(event.target.value)/100)} /></label>
  </fieldset>
}
