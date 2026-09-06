export const FLASHLIGHT = Object.freeze({ capacity: 100, duration: 20 * 60, range: 22, halfAngle: Math.PI / 6 })
export const validFlashlight = value => value && typeof value.enabled === 'boolean' && Number.isFinite(value.battery) && value.battery >= 0 && value.battery <= FLASHLIGHT.capacity

export function createFlashlight(saved) {
  let battery = validFlashlight(saved) ? saved.battery : FLASHLIGHT.capacity
  let enabled = validFlashlight(saved) ? saved.enabled && battery > 0 : false
  return {
    update(dt, requested) {
      enabled = requested && battery > 0
      if (enabled) battery = Math.max(0, battery - dt * FLASHLIGHT.capacity / FLASHLIGHT.duration)
      if (!battery) enabled = false
    },
    snapshot: () => ({ battery, enabled }),
    hud: () => ({ battery: Math.ceil(battery), enabled }),
  }
}
