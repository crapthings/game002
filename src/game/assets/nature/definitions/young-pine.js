import { box, cylinder, sphere, defineNature } from '../primitives.js'

export default defineNature({
  assetId: 'nature.young-pine', name: '幼松',
  zones: ["forest","wilderness"], tags: ["tree"],
  radius: .12,
}, {
  default: () => [cylinder([0.15,2.5,0.06],[0,1.25,0],'#77654f'), ...[0,1,2].map(i=>cylinder([1.5-i*0.35,1.15,0.04],[0,1.1+i*0.6,0],i%2?'#4d664a':'#405941'))],
})
