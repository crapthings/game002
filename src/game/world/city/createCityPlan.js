import { createRandom } from '../generation/random.js'
import { wuxiaCatalog } from '../../assets/wuxia/catalog.js'
import { compileRoadNetwork } from '../roads/roadGeometry.js'
import { blocksRoad, overlapsPlacement } from '../settlements/frontage.js'

export function createCityPlan(seed, hierarchy, fort) {
  const roads=[], placements=[], parcels=[]
  const extent=160, elevation=fort.elevation
  // 2×2 决定四区主功能；4×4 用父区配方分配街坊，而非逐地块独立抽签。
  const roles=['residential','market','academy','garden']
  const rng=createRandom(seed,'city-composition-v1')
  const shift=Math.floor(rng()*4)
  const sectors=hierarchy.macros.map((m,i)=>({id:m.id,role:roles[(i+shift)%4]}))
  for(const district of hierarchy.districts) {
    const role=sectors.find(s=>s.id===district.macroId).role
    district.landUse=(district.column+district.row)%3===0?'residential':role
  }
  const road=(id,from,to,width,level)=>roads.push({id,from,to,width,level,markings:false,fadeStart:false,fadeEnd:false})
  // 四门十字主街连接城外；8×8 街区边界生成次街，保持连续拓扑。
  road('city/east-west',[-224,0],[224,0],10,2)
  road('city/north-south',[0,-224],[0,224],10,2)
  for(const p of [-128,-64,64,128]) {
    road(`city/street/x/${p}`,[p,-extent],[p,extent],6,8)
    road(`city/street/z/${p}`,[-extent,p],[extent,p],6,8)
  }
  const water={id:'jade-canal',name:'碧溪',minX:-160,maxX:160,minZ:26,maxZ:38,level:elevation-.7}
  const bridges=[-128,-64,0,64,128].map(x=>({id:`bridge/${x}`,x,z:32,width:x===0?12:8,length:18}))
  const segments=compileRoadNetwork(roads)
  const houses=wuxiaCatalog.filter(a=>a.tags.includes('home')||a.assetId.includes('house-'))
  const pools={
    residential:houses,
    market:wuxiaCatalog.filter(a=>['pawn','medicine','weapons','inn','tea','wine','cloth'].includes(a.kind)),
    academy:wuxiaCatalog.filter(a=>['books','shrine','escort','home'].includes(a.kind)),
    garden:houses.filter(a=>['garden','court','home','riverside'].includes(a.kind)),
  }
  for(const detail of hierarchy.details) {
    const [x,z]=detail.center
    if(Math.abs(x)>144 || Math.abs(z)>144) { detail.use='wilderness';continue }
    const district=hierarchy.districts.find(d=>d.id===detail.districtId)
    const random=createRandom(seed,'city-parcel-v1',detail.id)
    const waterside=Math.abs(z-32)<24
    const park=(district.landUse==='garden' && random()<.42) || (Math.abs(x)<24&&Math.abs(z)<24)
    detail.use=park?'garden':waterside?'waterside':district.landUse
    const parcel={id:detail.id,bounds:detail.bounds,use:detail.use,placementIds:[]}
    parcels.push(parcel)
    if(park)continue
    const pool=waterside?houses:pools[district.landUse]
    const asset=pool[Math.floor(random()*pool.length)] || houses[0]
    // 面向相邻东西向街道；前院连线在 16×16 层生成，向父层道路接入。
    const streetZ=Math.round(z/64)*64
    const rotation=streetZ<z?0:Math.PI
    const candidate={id:`city/${detail.id}/home`,assetId:asset.assetId,position:[x,elevation,z],rotation,scale:1,
      footprint:{width:asset.size.width,depth:asset.size.depth},building:true,planned:true,parcelId:detail.id}
    const halfX=asset.size.width/2,halfZ=asset.size.depth/2
    if(Math.abs(x)+halfX>174 || Math.abs(z)+halfZ>174)continue
    if(x+halfX>water.minX-3&&x-halfX<water.maxX+3&&z+halfZ>water.minZ-3&&z-halfZ<water.maxZ+3)continue
    if(blocksRoad(candidate,segments,1)||placements.some(p=>p.building&&overlapsPlacement(candidate,p,2)))continue
    placements.push(candidate);parcel.placementIds.push(candidate.id)
    const entranceZ=z+(rotation===0?-1:1)*(asset.depth/2+2)
    road(`lane/${detail.id}`,[x,entranceZ],[x,streetZ],2.4,16)
  }
  // 桥面独立于建筑，不使用覆盖整个桥的实心碰撞体。
  for(const b of bridges)placements.push({id:b.id,assetId:b.x===0?'city.bridge-stone':'city.bridge-wood',position:[b.x,elevation,b.z],rotation:0,scale:1,infrastructure:true,planned:true})
  return {version:1,elevation,extent,sectors,parcels,gardenMask:hierarchy.details.map(d=>d.use==='garden'),roads,water,bridges,placements}
}

export function cityContains(city,x,z) { return Boolean(city&&Math.max(Math.abs(x),Math.abs(z))<=176) }
export function onBridge(city,x,z,radius=0) {
  return city?.bridges.some(b=>Math.abs(x-b.x)<=b.width/2-radius && Math.abs(z-b.z)<=b.length/2+radius) || false
}
export function inCanal(city,x,z,margin=0) {
  const b=city?.water
  return Boolean(b&&x>b.minX-margin&&x<b.maxX+margin&&z>b.minZ-margin&&z<b.maxZ+margin)
}
export function cityGround(city,x,z,natural) {
  if(!city)return natural
  const edge=Math.max(Math.abs(x),Math.abs(z)),t=Math.max(0,Math.min(1,(edge-176)/12))
  let h=city.elevation*(1-t*t*(3-2*t))+natural*t*t*(3-2*t)
  if(inCanal(city,x,z)&&!onBridge(city,x,z))h=city.elevation-2
  return h
}
export function cityGarden(city,x,z) {
  if(!cityContains(city,x,z))return true
  const column=Math.floor((x+256)/32),row=Math.floor((z+256)/32)
  return Boolean(city.gardenMask[row*16+column])
}
