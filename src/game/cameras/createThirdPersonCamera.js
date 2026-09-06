import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { Ray } from '@babylonjs/core/Culling/ray'

export function createThirdPersonCamera(scene, canvas, isPlaying) {
  const camera = new ArcRotateCamera('third-person', -Math.PI / 2, 1.22, 6, Vector3.Zero(), scene)
  camera.inputs.clear()
  camera.minZ = 0.08
  camera.fov = Math.PI / 3
  let drag = null, distance = 6, followHeight = null
  function clear() {
    if (drag !== null && canvas.hasPointerCapture(drag)) canvas.releasePointerCapture(drag)
    drag = null
  }
  const down = event => {
    if (!isPlaying() || event.button !== 2) return
    event.preventDefault()
    drag = event.pointerId
    canvas.setPointerCapture(drag)
  }
  const move = event => {
    if (drag !== event.pointerId || !isPlaying()) return
    camera.alpha -= event.movementX * 0.005
    camera.beta = Math.max(0.3, Math.min(1.5, camera.beta - event.movementY * 0.005))
  }
  const wheel = event => {
    if (!isPlaying()) return
    event.preventDefault()
    distance = Math.max(2.5, Math.min(10, distance + Math.sign(event.deltaY) * 0.5))
  }
  const context = event => event.preventDefault()
  canvas.addEventListener('pointerdown', down)
  canvas.addEventListener('pointermove', move)
  canvas.addEventListener('pointerup', clear)
  canvas.addEventListener('pointercancel', clear)
  canvas.addEventListener('lostpointercapture', clear)
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
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', clear)
      canvas.removeEventListener('pointercancel', clear)
      canvas.removeEventListener('lostpointercapture', clear)
      canvas.removeEventListener('wheel', wheel)
      canvas.removeEventListener('contextmenu', context)
      window.removeEventListener('blur', clear)
    },
  }
}
