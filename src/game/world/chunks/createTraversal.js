import { residenceFacades } from '../../assets/wuxia/residences.js'
import { fortificationBodies } from './collisionIndex.js'

// 解析碰撞只查询附近建筑，不对美术三角网格逐帧射线检测。
export function buildingBodies(def, placement) {
  const scale=placement.scale??1, rotation=placement.rotation??0,c=Math.cos(rotation),s=Math.sin(rotation)
  const courtyard=def.kind==='court'||def.layout==='court',wing=def.layout==='wing'
  const halls=courtyard||wing
    ? [[0,def.depth/2-2,def.width,4,def.wealth==='rich'?def.floors:1,0],[-def.width/2+1.75,-2,def.depth-4,3.5,1,-Math.PI/2],...(wing?[]:[[def.width/2-1.75,-2,def.depth-4,3.5,1,Math.PI/2]])]
    : [[0,0,def.width,def.depth,def.floors,0]]
  return halls.map(([ox,oz,w,d,floors,yaw])=>({
    x:placement.position[0]+(c*ox+s*oz)*scale,z:placement.position[2]+(-s*ox+c*oz)*scale,
    rotation:rotation+yaw,halfWidth:w/2*scale,halfDepth:d/2*scale,roofWidth:(w/2+.9)*scale,roofDepth:(d/2+.95)*scale,
    base:placement.position[1],roofBase:placement.position[1]+(.45+(floors-1)*3.4+3)*scale,
    rise:Math.min(2,(w+1.8)*.18)*(residenceFacades[def.kind]?.rise??1)*scale,scale,
  }))
}
function local(b,x,z) {
  const c=b.cosine??Math.cos(b.rotation??0),s=b.sine??Math.sin(b.rotation??0),dx=x-b.x,dz=z-b.z
  return {x:dx*c-dz*s,z:dx*s+dz*c,c,s}
}
function top(b,p) {
  if(b.roofBase===undefined)return (b.top??Infinity)+(b.parapet&&Math.abs(p.z)>3.3?.6:0)
  const t=Math.min(1,Math.abs(p.z)/b.roofDepth),u=Math.min(1,Math.abs(p.x)/b.roofWidth)
  // 与 6 段瓦面同样的纵向线性采样，脚底不会在瓦面下行走。
  const f=q=>b.rise*(1-q)**1.7+(.30*q**5+.22*u**8*q**4)*b.scale
  const lo=Math.min(5,Math.floor(t*6))/6,blend=(t-lo)*6
  return b.roofBase+f(lo)*(1-blend)+f(lo+1/6)*blend+.055*b.scale
}
export function createTraversal(loaded,fort,terrain,isLoaded,inside,groundBlocked=()=>false,collisionIndex=null) {
  const walls=collisionIndex?[]:fortificationBodies(fort)
  function* nearby(x,z,reach=1) {
    if(collisionIndex){yield* collisionIndex.nearby(x,z,reach);return}
    for(const b of walls)if(Math.abs(x-b.x)<Math.hypot(b.halfWidth,b.halfDepth)+reach&&Math.abs(z-b.z)<Math.hypot(b.halfWidth,b.halfDepth)+reach)yield b
    for(const entry of loaded.values()) {
      const b=entry.bounds
      if(x+reach<b.minX||x-reach>b.maxX||z+reach<b.minZ||z-reach>b.maxZ)continue
      yield* entry.colliders
    }
  }
  return {
    supportHeight(x,z,ceiling=Infinity) {
      let height=terrain.surfaceHeight(x,z)
      for(const b of nearby(x,z)) {
        if(b.radius!==undefined)continue
        const p=local(b,x,z)
        if(Math.abs(p.x)>(b.roofWidth??b.halfWidth)||Math.abs(p.z)>(b.roofDepth??b.halfDepth))continue
        const y=top(b,p)
        if(y<=ceiling&&y>height)height=y
      }
      return height
    },
    canTraverse(x,z,y,radius=.32) {
      if(!inside(x,z)||!isLoaded(x,z))return false
      if(y<terrain.surfaceHeight(x,z)+.6&&groundBlocked(x,z,radius))return false
      for(const b of nearby(x,z,radius)) {
        if(b.radius!==undefined){if(Math.hypot(x-b.x,z-b.z)<b.radius+radius&&y<(b.top??Infinity))return false;continue}
        const p=local(b,x,z)
        if(Math.abs(p.x)<b.halfWidth+radius&&Math.abs(p.z)<b.halfDepth+radius&&y<top(b,p)-.02)return false
      }
      return true
    },
    wallContact(x,z,y,radius=.65) {
      let best=null,distance=radius
      for(const b of nearby(x,z,radius)) {
        if(b.radius!==undefined)continue
        const p=local(b,x,z),qx=Math.max(-b.halfWidth,Math.min(b.halfWidth,p.x)),qz=Math.max(-b.halfDepth,Math.min(b.halfDepth,p.z))
        const dx=p.x-qx,dz=p.z-qz,dist=Math.hypot(dx,dz),height=top(b,p)
        if(dist<.001||dist>distance||y+1.2>=height||y+1.8<(b.base??-Infinity))continue
        distance=dist;best={x:(dx*p.c+dz*p.s)/dist,z:(-dx*p.s+dz*p.c)/dist,top:height}
      }
      return best
    },
  }
}
