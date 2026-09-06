import { box, cylinder, sphere, defineNature } from '../primitives.js'

export default defineNature({
  assetId: 'nature.thorn-bush', name: '荆棘灌丛',
  zones: ["wilderness","farmland","village"], tags: ["shrub"],
  radius: .48,
}, {
  default: () => [...Array.from({length:9},(_,i)=>{const a=i*2.4;return [box([0.04,0.85,0.04],[Math.sin(a)*0.25,0.4,Math.cos(a)*0.25],'#786b50',[0.3,a,0.4]),sphere([0.4,0.24,0.35],[Math.sin(a)*0.38,0.55,Math.cos(a)*0.38],'#68704d')] }).flat()],
})
