import { createNpcModel } from './createNpcModel.js'
import { wuxiaDefinitions } from '../assets/wuxia/catalog.js'
export function createNpcCrowd(scene,plan,world) {
  const entries=[],active=new Map()
  const add=(role,x,z,route=null,heading=0)=>entries.push({id:entries.length,assetId:`npc.${role}`,x,z,route,heading,direction:1})
  for(let i=0;i<12;i++) {const z=[0,-64,64,-128][i%4];const x=-120+i*21;add(i%2?'citizen-woman':'citizen',x,z,[[-146,z],[146,z]])}
  for(let i=0;i<6;i++){const z=i%2?-64:0;add('porter',-110+i*42,z+1.2,[[-148,z+1.2],[148,z+1.2]])}
  for(const z of [64,128])for(const x of [-22,22])add('guard',x,z,[[-44,z],[44,z]])
  const stalls=plan.city?.placements.filter(p=>p.assetId.startsWith('wuxia.market-')) || []
  for(const p of stalls.slice(0,10)) {
    const d=wuxiaDefinitions[p.assetId].depth/2+3.4,c=Math.cos(p.rotation),s=Math.sin(p.rotation)
    add('vendor',p.position[0]-s*d,p.position[2]-c*d,null,p.rotation+Math.PI)
  }
  return {update(dt,px,pz,viewDistance){
    let created=false
    for(const e of entries) {
      const distance=Math.hypot(e.x-px,e.z-pz)
      if(distance>viewDistance+8){active.get(e.id)?.dispose();active.delete(e.id);continue}
      if(!active.has(e.id)) {
        if(created || !world.isLoaded(e.x,e.z) || !world.canMove(e.x,e.z,.22))continue
        active.set(e.id,createNpcModel(scene,e.assetId));created=true
      }
      const model=active.get(e.id)
      let moving=false
      if(e.route) {
        const target=e.route[e.direction===1?1:0],dx=target[0]-e.x,dz=target[1]-e.z,length=Math.hypot(dx,dz)
        const step=Math.min(length,dt*(e.assetId==='npc.porter' ? .85 : 1.1))
        if(length<.2)e.direction*=-1
        else if(world.canMove(e.x+dx/length*step,e.z+dz/length*step,.32)) {e.x+=dx/length*step;e.z+=dz/length*step;e.heading=Math.atan2(dx,dz);moving=true}
        else e.direction*=-1
      }
      model.root.position.set(e.x,world.terrain.surfaceHeight(e.x,e.z),e.z);model.root.rotation.y=e.heading
      // 远处仅更新位置；近处执行关节动画。
      if(distance<28)model.update(dt,moving)
    }
  },dispose(){for(const m of active.values())m.dispose();active.clear()}}
}
