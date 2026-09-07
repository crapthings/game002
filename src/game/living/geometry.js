export const CONTACT_RANGE=2
export const ATTACK_REACH=1.65
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)
export function facingAngle(actor,target) {
  return Math.atan2(Math.sin(Math.atan2(target.x-actor.x,target.z-actor.z)-actor.heading),Math.cos(Math.atan2(target.x-actor.x,target.z-actor.z)-actor.heading))*180/Math.PI
}
function segmentDistance(p,a,b) {
  const dx=b.x-a.x,dz=b.z-a.z,length=dx*dx+dz*dz
  const t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/length)):0
  return Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t)
}
export function sweptContact(actor,target,from,to,clear) {
  if(Math.abs(actor.y-target.y)>1.1 || distance(actor,target)>ATTACK_REACH+.35 || !clear(actor,target)) return false
  const lo=Math.max(0,Math.min(1,from)),hi=Math.max(lo,Math.min(1,to))
  const count=Math.max(1,Math.ceil((hi-lo)*26))
  let previous=null
  for(let i=0;i<=count;i++) {
    const theta=actor.heading+(-65+130*(lo+(hi-lo)*i/count))*Math.PI/180
    const start={x:actor.x+Math.sin(theta)*.25,z:actor.z+Math.cos(theta)*.25}
    const tip={x:actor.x+Math.sin(theta)*ATTACK_REACH,z:actor.z+Math.cos(theta)*ATTACK_REACH}
    if(segmentDistance(target,start,tip)<=.35 || previous&&segmentDistance(target,previous,tip)<=.35)return true
    previous=tip
  }
  return false
}
// Bounded local route, using loaded walkable space only. No teleport fallback.
export function localRoute(start,target,walkable) {
  const cell=.8,key=(x,z)=>`${x},${z}`,queue=[{x:0,z:0,parent:-1}],seen=new Set(['0,0'])
  for(let index=0;index<queue.length && index<1800;index++) {
    const n=queue[index],p={x:start.x+n.x*cell,z:start.z+n.z*cell}
    if(distance(p,target)<1.2) {
      const path=[]; let cursor=index
      while(cursor>0){const q=queue[cursor];path.push({x:start.x+q.x*cell,z:start.z+q.z*cell});cursor=q.parent}
      return path.reverse()
    }
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]) {
      const x=n.x+dx,z=n.z+dz,k=key(x,z)
      if(seen.has(k))continue
      seen.add(k)
      if(!walkable(start.x+x*cell,start.z+z*cell) || dx&&dz&&(!walkable(start.x+x*cell,p.z)||!walkable(p.x,start.z+z*cell)))continue
      queue.push({x,z,parent:index})
    }
  }
  return []
}
