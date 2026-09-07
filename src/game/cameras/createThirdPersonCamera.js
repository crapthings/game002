import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { Ray } from '@babylonjs/core/Culling/ray'

export function createThirdPersonCamera(scene, canvas, isPlaying, onRelease = () => {}) {
  const camera = new ArcRotateCamera('third-person', -Math.PI / 2, 1.22, 6, Vector3.Zero(), scene)
  camera.inputs.clear()
  camera.minZ = 0.08
  camera.fov = Math.PI / 3
  let distance = 6, followHeight = null, wasLocked = false, intentionalRelease = false, drag = null
  const releaseDrag = () => {
    if (drag !== null && canvas.hasPointerCapture(drag)) canvas.releasePointerCapture(drag)
    drag = null
  }
  const lockFailed = () => document.dispatchEvent(new CustomEvent('game-pointer-status', {detail:'当前浏览器未能锁定鼠标，可用中键拖动视角'}))
  function clear() {
    releaseDrag()
    intentionalRelease = true
    if (document.pointerLockElement === canvas) document.exitPointerLock()
  }
  const down = event => {
    if (!isPlaying()) return
    if (event.button === 1 && document.pointerLockElement !== canvas) { event.preventDefault(); drag = event.pointerId; canvas.setPointerCapture(drag); return }
    if (event.button !== 0 || document.pointerLockElement === canvas) return
    event.preventDefault()
    // Acquiring the pointer is a separate gesture; combat input only accepts an
    // already locked canvas. Rejected permission leaves the interface usable.
    try { canvas.requestPointerLock()?.catch(lockFailed) } catch { lockFailed() }
  }
  const lockChanged = () => {
    const locked = document.pointerLockElement === canvas
    if (locked) intentionalRelease = false
    if (wasLocked && !locked && !intentionalRelease) onRelease()
    wasLocked = locked
  }
  const move = event => {
    if ((document.pointerLockElement !== canvas && drag === null) || !isPlaying()) return
    camera.alpha -= event.movementX * 0.005
    camera.beta = Math.max(0.3, Math.min(1.5, camera.beta - event.movementY * 0.005))
  }
  const key = event => {
    if (event.code !== 'Tab' || !isPlaying() || event.ctrlKey || event.altKey || event.metaKey) return
    if (/INPUT|TEXTAREA|SELECT/.test(event.target?.tagName) || event.target?.isContentEditable) return
    if (document.pointerLockElement === canvas) { event.preventDefault(); clear() }
  }
  const wheel = event => {
    if (!isPlaying()) return
    event.preventDefault()
    distance = Math.max(2.5, Math.min(10, distance + Math.sign(event.deltaY) * 0.5))
  }
  const context = event => event.preventDefault()
  canvas.addEventListener('pointerdown', down)
  canvas.addEventListener('pointerup', releaseDrag)
  canvas.addEventListener('pointercancel', releaseDrag)
  canvas.addEventListener('lostpointercapture', releaseDrag)
  document.addEventListener('pointerlockerror', lockFailed)
  document.addEventListener('mousemove', move)
  document.addEventListener('pointerlockchange', lockChanged)
  window.addEventListener('keydown', key)
  canvas.addEventListener('wheel', wheel, { passive: false })
  canvas.addEventListener('contextmenu', context)
  window.addEventListener('blur', clear)
  return {
    camera, clear,
    follow(player, terrain, dt = 0) {
      const desiredHeight = player.position.y + 1.35
      followHeight = followHeight === null || dt === 0 ? desiredHeight : followHeight + (desiredHeight - followHeight) * (1 - Math.exp(-dt * 10))
      const target = new Vector3(player.position.x, followHeight, player.position.z)
      camera.setTarget(target, false, false, true)
      const offset = new Vector3(Math.cos(camera.alpha) * Math.sin(camera.beta), Math.cos(camera.beta), Math.sin(camera.alpha) * Math.sin(camera.beta))
      // 从角色向镜头探测遮挡，避免第三人称镜头穿过房屋和山坡。
      const hit = scene.pickWithRay(new Ray(target, offset, distance + 0.25), mesh => mesh.isEnabled() && mesh.isVisible && (mesh.metadata?.ground || mesh.metadata?.assetId) && !mesh.isDescendantOf(player))
      camera.radius = hit?.hit ? Math.max(0.2, Math.min(distance, hit.distance - 0.25)) : distance
      const eye = target.add(offset.scale(camera.radius))
      const floor = terrain.surfaceHeight(eye.x, eye.z) + 0.25
      if (eye.y < floor) camera.beta = Math.max(0.3, camera.beta - 0.06)
    },
    dispose() {
      clear()
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointerup', releaseDrag)
      canvas.removeEventListener('pointercancel', releaseDrag)
      canvas.removeEventListener('lostpointercapture', releaseDrag)
      document.removeEventListener('pointerlockerror', lockFailed)
      document.removeEventListener('mousemove', move)
      document.removeEventListener('pointerlockchange', lockChanged)
      window.removeEventListener('keydown', key)
      canvas.removeEventListener('wheel', wheel)
      canvas.removeEventListener('contextmenu', context)
      window.removeEventListener('blur', clear)
    },
  }
}
