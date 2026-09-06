const dashDirections = { KeyW:[0,1], ArrowUp:[0,1], KeyS:[0,-1], ArrowDown:[0,-1], KeyA:[-1,0], ArrowLeft:[-1,0], KeyD:[1,0], ArrowRight:[1,0] }
const sprintKeys = new Set(['ShiftLeft', 'ShiftRight'])
const controls = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

export function createMovementInput(scene, isPlaying) {
  const keys = new Set()
  let jumpQueued = false, dashQueued = null
  const taps = new Map()
  const clear = () => { keys.clear(); jumpQueued = false; dashQueued = null; taps.clear() }
  const onDown = (event) => {
    if (!isPlaying() || (!controls.has(event.code) && !sprintKeys.has(event.code) && event.code !== 'Space') || event.ctrlKey || event.metaKey || event.altKey || event.target?.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(event.target?.tagName)) return
    event.preventDefault()
    if (event.code === 'Space' && !event.repeat && !keys.has('Space')) jumpQueued = true
    if (controls.has(event.code) && !event.repeat && !keys.has(event.code)) {
      const [horizontal,vertical]=dashDirections[event.code],key=`${horizontal},${vertical}`
      const aliasHeld=[...keys].some(code=>dashDirections[code]?.join(',')===key)
      if(!aliasHeld) {
        const now=performance.now(),last=taps.get(key)
        if(last!==undefined && now-last<=250) {
          const alpha=scene.activeCamera.alpha
          dashQueued={x:-Math.sin(alpha)*horizontal-Math.cos(alpha)*vertical,z:Math.cos(alpha)*horizontal-Math.sin(alpha)*vertical}
          taps.delete(key)
        } else taps.set(key,now)
      }
    }
    keys.add(event.code)
  }
  const onUp = (event) => keys.delete(event.code)
  window.addEventListener('keydown', onDown)
  window.addEventListener('keyup', onUp)
  window.addEventListener('blur', clear)
  return {
    clear,
    consumeDash() { const direction=dashQueued; dashQueued=null; return direction },
    consumeJump() { const pressed = jumpQueued; jumpQueued = false; return pressed },
    jumpHeld: () => keys.has('Space'),
    wantsSprint: () => keys.has('ShiftLeft') || keys.has('ShiftRight'),
    direction() {
      const horizontal = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'))
      const vertical = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'))
      if (horizontal || vertical) {
        const alpha = scene.activeCamera.alpha
        const x = -Math.sin(alpha) * horizontal - Math.cos(alpha) * vertical
        const z = Math.cos(alpha) * horizontal - Math.sin(alpha) * vertical
        const length = Math.hypot(x, z)
        return { x: x / length, z: z / length }
      }
      return { x: 0, z: 0 }
    },
    dispose() {
      clear()
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', clear)
    },
  }
}
