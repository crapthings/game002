import { box, cylinder, sphere, defineNature } from '../primitives.js'

export default defineNature({
  assetId: 'nature.birch', name: '白桦树',
  zones: ["forest","wilderness"], tags: ["tree"],
  radius: .22,
}, {
  default: () => [cylinder([0.35,5.3,0.16],[0,2.65,0],'#bebca3'), ...[1,2,3,4].map(y=>box([0.21,0.075,0.025],[0,y,0.15],'#555b4d')), ...[-1,1].map(s=>sphere([2.1,2.2,1.9],[s*0.55,4.6,0],'#647653')), sphere([1.6,1.7,1.6],[0,5.6,0],'#75835c')],
})
