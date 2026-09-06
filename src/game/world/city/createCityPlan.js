import { createRandom } from '../generation/random.js'
import { wuxiaCatalog } from '../../assets/wuxia/catalog.js'
import { compileRoadNetwork } from '../roads/roadGeometry.js'
import { blocksRoad, overlapsPlacement } from '../settlements/frontage.js'

export function createCityPlan(seed, hierarchy, fort) {
  const roads=[], placements=[], parcels=[]
  const recentHomes=[]
  const choose=(pool,random)=>{const fresh=pool.filter(a=>!recentHomes.slice(-3).includes(a.assetId));const choices=fresh.length?fresh:pool;const a=choices[Math.floor(random()*choices.length)];if(a?.wealth)recentHomes.push(a.assetId);return a}
  const extent=160, elevation=fort.elevation
  // 2×2 决定四区主功能；4×4 用父区配方分配街坊，而非逐地块独立抽签。
  const roles=['residential','market','academy','garden']
  const rng=createRandom(seed,'city-composition-v1')
  const shift=Math.floor(rng()*4)
  const sectors=hierarchy.macros.map((m,i)=>({id:m.id,role:roles[(i+shift)%4]}))
  for(const district of hierarchy.districts) {
    const role=sectors.find(s=>s.id===district.macroId).role
    district.landUse=(district.column===1||district.column===2)&&(district.row===1||district.row===2)?'market':(district.column+district.row)%3===0?'residential':role
  }
  const road=(id,from,to,width,level)=>roads.push({id,from,to,width,level,markings:false,fadeStart:false,fadeEnd:false})
  // 四门十字主街连接城外；8×8 街区边界生成次街，保持连续拓扑。
  road('city/east-west',[-224,0],[224,0],7,2)
  road('city/north-south',[0,-224],[0,224],7,2)
  for(const p of [-128,-64,64,128]) {
    road(`city/street/x/${p}`,[p,-extent],[p,extent],4,8)
    road(`city/street/z/${p}`,[-extent,p],[extent,p],4,8)
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
    const marketStreet=Math.abs(x)<=112&&(z===-48||z===-80)
    const civic=Math.abs(x)<=16&&(z===80||z===112)
    const government=x===16&&z===112
    const central=Math.abs(x)<=80&&Math.abs(z)<=80
    const waterside=Math.abs(z-32)<24
    const park=(!central&&district.landUse==='garden' && random()<.14)
    detail.use=civic?'government':marketStreet?'bazaar':park?'garden':central?'market':waterside?'waterside':district.landUse
    const parcel={id:detail.id,bounds:detail.bounds,use:detail.use,placementIds:[]}
    parcels.push(parcel)
    if(park || (civic&&!government))continue
    let pool=government?wuxiaCatalog.filter(a=>a.kind==='government'):marketStreet?wuxiaCatalog.filter(a=>a.kind.startsWith('market-')):central?pools.market:waterside?houses:pools[district.landUse]
    let wealth=null
    if(pool.every(a=>a.wealth)) {
      const roll=random(),outer=Math.max(Math.abs(x),Math.abs(z))>128
      wealth=roll<(outer ? .38 : .12)?'poor':roll<(outer ? .76 : .48)?'common':roll<.85?'comfort':'rich'
      const tier=houses.filter(a=>a.wealth===wealth)
      if(tier.length)pool=tier
      parcel.wealth=wealth
    }
    // 32 米单元只管理归属；沿街双铺开间替代一格一栋。
    const streetZ=government?64:Math.round(z/64)*64
    const side=z>streetZ?1:-1,rotation=side===1?0:Math.PI
    const roadWidth=streetZ===0?7:4
    const compact=pool.filter(a=>a.width<=11)
    const count=government||wealth==='rich'||wealth==='comfort'?1:compact.length && (marketStreet || random()>.18)?2:1
    for(let slot=0;slot<count;slot++) {
      const choices=count===2?compact:pool
      const asset=choose(choices,random) || houses[0]
      const px=x+(count===2?(slot===0?-8:8):0)
      const pz=government?z:streetZ+side*(roadWidth/2+asset.depth/2+3.1)
      const candidate={id:`city/${detail.id}/${slot}`,assetId:asset.assetId,position:[px,elevation,pz],rotation,scale:1,
        footprint:{width:asset.width+3,depth:asset.depth+5.4},building:true,planned:true,parcelId:detail.id}
      const hx=candidate.footprint.width/2,hz=candidate.footprint.depth/2
      if(Math.abs(px)+hx>174 || Math.abs(pz)+hz>174)continue
      if(px+hx>water.minX-2&&px-hx<water.maxX+2&&pz+hz>water.minZ-2&&pz-hz<water.maxZ+2)continue
      if(blocksRoad(candidate,segments,.25)||placements.some(p=>p.building&&overlapsPlacement(candidate,p,.8)))continue
      placements.push(candidate);parcel.placementIds.push(candidate.id)
      const entranceZ=pz-side*(asset.depth/2+2)
      road(`lane/${detail.id}/${slot}`,[px,entranceZ],[px,streetZ],2.4,16)
    }
  }
  // 街坊内部补充背街住宅，短巷连接主街；不在水系和衙前广场填房。
  for(const laneZ of [-96,-32,96]) {
    road(`inner/${laneZ}`,[-156,laneZ],[156,laneZ],2.4,16)
  }
  const allSegments=compileRoadNetwork(roads)
  const smallHomes=houses.filter(a=>a.width<=10 && a.depth<=8)
  for(const laneZ of [-96,-32,96])for(const side of [-1,1])for(let x=-148;x<=148;x+=16) {
    if(laneZ===96&&Math.abs(x)<36)continue
    const random=createRandom(seed,'backstreet',laneZ,side,x)
    const asset=choose(smallHomes,random)
    const z=laneZ+side*(1.2+asset.depth/2+2.8)
    const item={id:`city/back/${laneZ}/${side}/${x}`,assetId:asset.assetId,position:[x,elevation,z],rotation:side===1?0:Math.PI,scale:1,footprint:{width:asset.width+3,depth:asset.depth+5.4},building:true,planned:true}
    if(blocksRoad(item,allSegments,.05)||placements.some(p=>p.building&&overlapsPlacement(item,p,.8)))continue
    const row=Math.floor((z+256)/32),column=Math.floor((x+256)/32)
    const detail=hierarchy.details[row*16+column],parcel=parcels.find(p=>p.id===detail.id)
    if(!parcel || parcel.use==='garden')continue
    item.parcelId=detail.id;placements.push(item);parcel.placementIds.push(item.id)
  }
  // 桥面独立于建筑，不使用覆盖整个桥的实心碰撞体。
  for(const b of bridges)placements.push({id:b.id,assetId:b.x===0?'city.bridge-stone':'city.bridge-wood',position:[b.x,elevation,b.z],rotation:0,scale:1,infrastructure:true,planned:true})
  return {version:4,plaza:{minX:4,maxX:28,minZ:80,maxZ:100},landmarks:[{name:'清平府衙',x:16,z:112},{name:'百业集市街',x:0,z:-64},{name:'中心商区',x:48,z:0}],elevation,extent,sectors,parcels,gardenMask:hierarchy.details.map(d=>d.use==='garden'),roads,water,bridges,placements}
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
  if(inCanal(city,x,z))h=city.elevation-2
  return h
}
export function cityGarden(city,x,z) {
  if(!cityContains(city,x,z))return true
  const column=Math.floor((x+256)/32),row=Math.floor((z+256)/32)
  return Boolean(city.gardenMask[row*16+column])
}
