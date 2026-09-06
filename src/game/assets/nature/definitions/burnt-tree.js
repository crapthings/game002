import { box, cylinder, sphere, defineNature } from '../primitives.js'

export default defineNature({
  assetId: 'nature.burnt-tree', name: '烧焦树干',
  zones: ["forest","wilderness","city"], tags: ["tree","burnt"],
  radius: .3,
}, {
  default: () => [cylinder([0.5,4.2,0.13],[0,2.1,0],'#363a32'), cylinder([0.17,1.6,0.04],[0.44,2.7,0],'#44453a',[0,0,-0.6]), cylinder([0.14,1.1,0.03],[-0.3,3.4,0.1],'#30362f',[0,0,0.65]), ...[-1,1].map(s=>box([0.16,0.16,0.8],[0,0.08,s*0.28],'#48473b',[0,s*0.7,0]))],
})
