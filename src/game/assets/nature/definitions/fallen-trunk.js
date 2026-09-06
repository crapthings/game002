import { box, cylinder, sphere, defineNature } from '../primitives.js'

export default defineNature({
  assetId: 'nature.fallen-trunk', name: '倒伏树干',
  zones: ["forest","wetland"], tags: ["wood","decay"],
  footprint: { width: 3.2, depth: 0.6 },
}, {
  default: () => [cylinder([0.5,3.1,0.35],[0,0.25,0],'#685a47',[0,0,Math.PI/2]), cylinder([0.37,0.025,0.37],[-1.56,0.25,0],'#a08965',[0,0,Math.PI/2]), sphere([0.85,0.15,0.3],[0.4,0.46,0],'#57664a')],
})
