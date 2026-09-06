import { box, cylinder, sphere, defineNature } from '../primitives.js'

export default defineNature({
  assetId: 'nature.mossy-boulder', name: '覆苔巨石',
  zones: ["forest","wetland"], tags: ["rock"],
  radius: 1.0,
}, {
  default: () => [sphere([2,1.4,1.6],[0,0.62,0],'#777b6e'),sphere([1.2,0.19,0.95],[-0.16,1.22,0],'#5c704b'),sphere([0.58,0.19,0.65],[0.69,0.75,0.15],'#687b50')],
})
