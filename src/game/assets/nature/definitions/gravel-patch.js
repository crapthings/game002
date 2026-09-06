import { box, cylinder, sphere, defineNature } from '../primitives.js'

export default defineNature({
  assetId: 'nature.gravel-patch', name: '碎石散落',
  zones: ["wilderness","roadside","industrial"], tags: ["groundcover","rock"],
  radius: 0,
}, {
  default: () => [...Array.from({length:15},(_,i)=>sphere([0.16+(i%3)*0.06,0.09+(i%2)*0.05,0.2],[Math.sin(i*2.4)*(0.25+(i%4)*0.2),0.045+(i%2)*0.025,Math.cos(i*2.4)*(0.25+(i%3)*0.2)],i%2?'#989789':'#74776c'))],
})
