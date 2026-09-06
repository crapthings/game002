import { box, cylinder, sphere, defineNature } from '../primitives.js'

export default defineNature({
  assetId: 'nature.dry-grass', name: '枯草丛',
  zones: ["farmland","wilderness","roadside"], tags: ["groundcover"],
  radius: 0,
}, {
  default: () => [...Array.from({length:13},(_,i)=>box([0.035,0.35+(i%4)*0.1,0.018],[Math.sin(i*2.4)*0.22,0.18+(i%4)*0.05,Math.cos(i*2.4)*0.22],i%2?'#8c8860':'#a29a70',[0.2*Math.sin(i),i,0.2*Math.cos(i)]))],
})
