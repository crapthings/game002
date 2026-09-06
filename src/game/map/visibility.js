import { FLASHLIGHT } from '../entities/createFlashlight.js'

export function createVisibility(daylight, flashlight = false) {
  return { radius: 8 + 16 * daylight, beamRange: flashlight ? FLASHLIGHT.range : 0, halfAngle: FLASHLIGHT.halfAngle }
}

export function isVisible(dx, dz, heading, vision) {
  const distance = Math.hypot(dx, dz)
  if (distance <= vision.radius) return true
  return distance <= vision.beamRange && (dx * Math.sin(heading) + dz * Math.cos(heading)) / distance >= Math.cos(vision.halfAngle)
}

// 逆时针完整视域边界：圆形近视域与手电扇形的并集，避免重叠区被重复压暗。
export function traceVisibility(ctx, x, y, scale, heading, vision) {
  const radius = vision.radius * scale, beam = vision.beamRange * scale
  if (beam <= radius) {
    ctx.moveTo(x + radius, y); ctx.arc(x, y, radius, 0, Math.PI * 2, true)
  } else {
    const direction = heading - Math.PI / 2, left = direction - vision.halfAngle, right = direction + vision.halfAngle
    ctx.moveTo(x + Math.cos(right) * radius, y + Math.sin(right) * radius)
    ctx.lineTo(x + Math.cos(right) * beam, y + Math.sin(right) * beam)
    ctx.arc(x, y, beam, right, left, true)
    ctx.lineTo(x + Math.cos(left) * radius, y + Math.sin(left) * radius)
    ctx.arc(x, y, radius, left, right - Math.PI * 2, true)
  }
  ctx.closePath()
}
