import { box, cylinder, sphere, defineNature } from '../primitives.js'

export default defineNature({
  assetId: 'nature.cattails', name: '香蒲丛',
  zones: ["wetland"], tags: ["groundcover"],
  radius: 0,
}, {
  default: () => [...Array.from({length:7},(_,i)=>{const x=Math.sin(i*2.4)*0.3,z=Math.cos(i*2.4)*0.3,h=1.1+(i%3)*0.17;return [cylinder([0.025,h,0.015],[x,h/2,z],'#747c4f'),cylinder([0.085,0.25,0.065],[x,h+0.08,z],'#65513b'),box([0.035,h*0.8,0.018],[x+0.08,h*0.4,z],'#63754c',[0,0,-0.15])] }).flat()],
})
