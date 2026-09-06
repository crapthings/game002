export function createVisibility(daylight) {
  return { radius: 12 + 12 * daylight, beamRange: 0 }
}
export function isVisible(dx, dz, heading, vision) {
  return Math.hypot(dx, dz) <= vision.radius
}
export function traceVisibility(ctx, x, y, scale, heading, vision) {
  const radius = vision.radius * scale
  ctx.moveTo(x + radius, y)
  ctx.arc(x, y, radius, 0, Math.PI * 2, true)
  ctx.closePath()
}
