import '@babylonjs/core/Culling/ray'

const sprintKeys = new Set(['ShiftLeft', 'ShiftRight'])
const controls = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

export function createMovementInput(canvas, scene, isPlaying) {
  const keys = new Set()
  let destination = null, jumpQueued = false
  const clear = () => { keys.clear(); destination = null; jumpQueued = false }
  const onDown = (event) => {
    if (!isPlaying() || (!controls.has(event.code) && !sprintKeys.has(event.code) && event.code !== 'Space') || event.ctrlKey || event.metaKey || event.altKey || event.target?.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(event.target?.tagName)) return
    event.preventDefault()
    if (event.code === 'Space' && !event.repeat && !keys.has('Space')) jumpQueued = true
    keys.add(event.code)
    if (controls.has(event.code)) destination = null
  }
  const onUp = (event) => keys.delete(event.code)
  const onPointer = (event) => {
    if (!isPlaying() || event.button !== 0) return
    const rect = canvas.getBoundingClientRect()
    const hit = scene.pick(event.clientX - rect.left, event.clientY - rect.top, (mesh) => mesh.metadata?.ground)
    if (hit?.hit) destination = { x: hit.pickedPoint.x, z: hit.pickedPoint.z }
  }
  window.addEventListener('keydown', onDown)
  window.addEventListener('keyup', onUp)
  window.addEventListener('blur', clear)
  canvas.addEventListener('pointerdown', onPointer)
  return {
    clear,
    consumeJump() { const pressed = jumpQueued; jumpQueued = false; return pressed },
    jumpHeld: () => keys.has('Space'),
    wantsSprint: () => keys.has('ShiftLeft') || keys.has('ShiftRight'),
    direction(position) {
      const horizontal = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'))
      const vertical = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'))
      if (horizontal || vertical) {
        const alpha = scene.activeCamera.alpha
        const x = -Math.sin(alpha) * horizontal - Math.cos(alpha) * vertical
        const z = Math.cos(alpha) * horizontal - Math.sin(alpha) * vertical
        const length = Math.hypot(x, z)
        return { x: x / length, z: z / length }
      }
      if (destination) {
        const x = destination.x - position.x, z = destination.z - position.z
        const length = Math.hypot(x, z)
        if (length > 0.2) return { x: x / length, z: z / length, distance: length }
        destination = null
      }
      return { x: 0, z: 0 }
    },
    dispose() {
      clear()
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', clear)
      canvas.removeEventListener('pointerdown', onPointer)
    },
  }
}
