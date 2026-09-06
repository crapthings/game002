import { box, cylinder, sphere, defineNature } from '../primitives.js'

export default defineNature({
  assetId: 'nature.fern-clump', name: '蕨类丛',
  zones: ["forest","wetland"], tags: ["groundcover"],
  radius: 0,
}, {
  default: () => [...Array.from({length:8},(_,i)=>{ const a=i*Math.PI/4; return box([0.17,0.035,0.75],[Math.sin(a)*0.22,0.23,Math.cos(a)*0.22],i%2?'#576d47':'#677b50',[-0.35,a,0]) }), cylinder([0.04,0.3,0.025],[0,0.15,0],'#727951')],
})
