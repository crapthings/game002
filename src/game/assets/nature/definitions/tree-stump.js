import { box, cylinder, sphere, defineNature } from '../primitives.js'

export default defineNature({
  assetId: 'nature.tree-stump', name: '腐朽树桩',
  zones: ["forest","village"], tags: ["wood","decay"],
  radius: .45,
}, {
  default: () => [cylinder([0.8,0.65,0.64],[0,0.325,0],'#6a5945'), cylinder([0.56,0.025,0.56],[0,0.66,0],'#958063'), cylinder([0.23,0.027,0.23],[0,0.662,0],'#605340'), ...[0,1,2,3].map(i=>box([0.18,0.13,0.75],[Math.sin(i*1.57)*0.24,0.065,Math.cos(i*1.57)*0.24],'#6a5945',[0,i*1.57,0]))],
})
