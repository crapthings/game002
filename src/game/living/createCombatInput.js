import { useLivingStore } from '../../stores/useLivingStore.js'
export function createCombatInput(canvas,isPlaying,release) {
  const request=(kind,data)=>useLivingStore.getState().request(kind,data)
  const down=e=>{if(!isPlaying()||document.pointerLockElement!==canvas)return
    if(e.button===0){e.preventDefault();request('attack')}
    if(e.button===2){e.preventDefault();request('guard',{held:true})}}
  const up=e=>{if(e.button===2){release();request('guard',{held:false})}}
  const clear=()=>{release();useLivingStore.getState().clear()}
  const key=e=>{
    if(!isPlaying()||e.repeat||e.ctrlKey||e.altKey||e.metaKey||/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName)||e.target?.isContentEditable)return
    if(e.code==='Tab'){e.preventDefault();useLivingStore.getState().toggle();release();return}
    const kind={KeyE:'interact',KeyT:'threaten',KeyH:'mask',KeyJ:'attack',KeyK:'guard'}[e.code]
    if(kind){e.preventDefault();request(kind,kind==='guard'?{held:true}:{})}
  }
  const keyUp=e=>{if(e.code==='KeyK'){release();request('guard',{held:false})}}
  const unlock=()=>{if(document.pointerLockElement!==canvas)clear()}
  canvas.addEventListener('pointerdown',down);window.addEventListener('pointerup',up)
  window.addEventListener('keydown',key);window.addEventListener('keyup',keyUp)
  window.addEventListener('blur',clear);document.addEventListener('pointerlockchange',unlock)
  return {clear,dispose(){clear();canvas.removeEventListener('pointerdown',down);window.removeEventListener('pointerup',up);window.removeEventListener('keydown',key);window.removeEventListener('keyup',keyUp);window.removeEventListener('blur',clear);document.removeEventListener('pointerlockchange',unlock)}}
}
