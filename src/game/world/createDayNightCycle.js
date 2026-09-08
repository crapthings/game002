export const DAY_LENGTH_SECONDS = 24 * 60
export const START_TIME = 7.5

const clamp = (value) => Math.max(0, Math.min(1, value))
const smooth = (value) => {
  const t = clamp(value)
  return t * t * (3 - 2 * t)
}
const mix = (from, to, t) => from.map((value, index) => value + (to[index] - value) * t)

export function validWorldTime(value) {
  return Number.isFinite(value) && value >= 0 && value < 24
}

export function createDayNightCycle(savedTime = START_TIME) {
  let time = validWorldTime(savedTime) ? savedTime : START_TIME
  return {
    setTime(value) { if(!validWorldTime(value))throw new Error('INVALID_WORLD_TIME');time=value },
    update(dt) {
      time = (time + dt * 24 / DAY_LENGTH_SECONDS) % 24
    },
    snapshot: () => time,
    lighting() {
      const sunHeight = Math.sin((time - 6) / 24 * Math.PI * 2)
      const daylight = smooth((sunHeight + 0.12) / 0.45)
      const sunset = Math.max(0, 1 - Math.abs(sunHeight) / 0.28) * (time >= 12 ? 1 : 0.65)
      const nightSky = [0.025, 0.045, 0.075]
      const daySky = [0.58, 0.73, 0.77]
      const sky = mix(mix(nightSky, daySky, daylight), [0.38, 0.20, 0.13], sunset * 0.55)
      const fog = mix(mix([0.035, 0.06, 0.075], daySky, daylight), [0.25, 0.13, 0.09], sunset * 0.35)
      const angle = (time - 6) / 24 * Math.PI * 2
      return {
        time,
        period: time < 5 ? '深夜' : time < 7 ? '黎明' : time < 17 ? '白天' : time < 19 ? '黄昏' : time < 22 ? '夜晚' : '深夜',
        daylight,
        sky,
        fog,
        ambient: 0.22 + daylight * 0.58,
        sun: 0.08 + daylight * 0.82,
        sunColor: mix([0.48, 0.58, 0.76], [1, 0.88, 0.7], daylight),
        direction: [Math.cos(angle) * 0.65, -Math.max(0.18, Math.abs(sunHeight)), Math.sin(angle) * 0.65],
      }
    },
  }
}
