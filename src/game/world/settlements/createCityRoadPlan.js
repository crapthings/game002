import { roundRoadPath } from '../roads/roadGeometry.js'
import { defineRoad } from '../roads/roadProfiles.js'
import { cityProfiles } from './cityProfiles.js'

export function createCityRoadPlan(region, id) {
  const profile = cityProfiles[region.citySize] || cityProfiles.medium
  const { cuts, span } = profile, half = span / 2
  const [cx, cz] = region.center
  const p = (x, z) => [cx + x, cz + z]
  const roads = []
  const add = (name, points, type, options) => roads.push(defineRoad(`${id}/${name}`, points, type, options))
  add('arterial-ew', [p(-half,0),p(half,0)], 'arterial')
  add('arterial-ns', [p(0,-half),p(0,half)], 'arterial')
  const innerOffsets = cuts.slice(1,-1).filter(value => value !== 0).sort((a, b) => Math.abs(a) - Math.abs(b) || a - b)
  for (const offset of innerOffsets) {
    add(`street-ew:${offset}`, [p(-half,offset),p(half,offset)], 'street')
    // 中心扩展布局使用贯通支路连接内外街区；其他布局保留 T 字路口。
    add(`street-ns:${offset}`, [p(offset, region.growth === 'center-out' ? -half : offset < 0 ? -half : 0),p(offset,half)], 'street')
  }
  add('ring', roundRoadPath([p(-half,-half),p(half,-half),p(half,half),p(-half,half)], 24, true), 'ring', { closed: true })
  // 在西南街区形成弯曲住宅回路；端点精确接在已有道路上。
  const inner = cuts[1]
  const mid = (-half + inner) / 2
  add('residential-loop', roundRoadPath([p(-half,mid),p(mid,mid),p(mid,0)], 12), 'street')
  if (span >= 256) {
    const last = cuts.at(-2), center = (last + half) / 2
    add('service-alley', [p(last,center),p(half,center)], 'service')
  }
  const gates = [p(-half,0),p(half,0),p(0,-half),p(0,half)]
  return { profile, roads, gates }
}
