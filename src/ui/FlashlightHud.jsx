import { useFlashlightStore } from '../stores/useFlashlightStore.js'
import { useGameStore } from '../stores/useGameStore.js'

export default function FlashlightHud() {
  const { battery, enabled, toggle } = useFlashlightStore()
  const playing = useGameStore(state => state.phase === 'playing')
  return <button disabled={!playing || battery === 0} onClick={toggle} aria-pressed={enabled} aria-label={`手电${enabled?'开启':'关闭'}，电量 ${battery}%`} className="absolute left-4 top-28 z-10 w-32 rounded-lg border border-white/10 bg-black/70 px-3 py-2 text-left disabled:cursor-default">
    <span className={`flex justify-between text-[10px] ${battery <= 15 ? 'text-amber-300' : 'text-stone-300'}`}><span>手电 · F {enabled?'开':'关'}</span><span>{battery}%</span></span>
    <span className="mt-1.5 block h-1 overflow-hidden rounded bg-white/10"><span className={`block h-full ${battery<=15?'bg-amber-400':'bg-emerald-300'}`} style={{width:`${battery}%`}}/></span>
  </button>
}
