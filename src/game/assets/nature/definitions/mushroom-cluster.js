import { box, cylinder, sphere, defineNature } from '../primitives.js'

export default defineNature({
  assetId: 'nature.mushroom-cluster', name: '蘑菇簇',
  zones: ["forest","wetland"], tags: ["groundcover","fungus"],
  radius: 0,
}, {
  default: () => [...Array.from({length:6},(_,i)=>{const x=Math.sin(i*2.4)*0.22,z=Math.cos(i*2.4)*0.22,h=0.12+(i%3)*0.045;return [cylinder([0.035,h,0.025],[x,h/2,z],'#b1a78b'),sphere([0.14,0.065,0.14],[x,h,z],i%2?'#887058':'#a18b6a')] }).flat()],
})
