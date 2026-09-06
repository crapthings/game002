import { buildingCatalog } from '../../assets/buildings/catalog.js'
import { expandAssembly } from '../../assets/environment/catalog.js'
import { createRandom } from '../generation/random.js'
import { compileRoadNetwork, sampleRoad } from '../roads/roadGeometry.js'
import { createCityRoadPlan } from './createCityRoadPlan.js'
import { overlapsPlacement } from './frontage.js'
import { urbanProfiles, districtProfiles, createUrbanBlocks, frontageCandidates } from './urbanPlanning.js'
import { placeUrbanBuilding } from './placeUrbanBuilding.js'

export function createCityPlan(seed, region) {
  const [cx,cz]=region.center,id=`settlement.${region.id}`
  const {profile,roads,gates}=createCityRoadPlan(region,id)
  const policy=urbanProfiles[region.citySize] || urbanProfiles.medium
  const blocks=createUrbanBlocks(seed,region,profile,id)
  const placements=[],decorations=[],surfaces=[],facilities=[]
  const segments=compileRoadNetwork(roads)
  const catalog=new Map(buildingCatalog.map(model=>[model.id,model]))
  // 设施先占地，普通建筑后填充；大设施每街区最多一座，诊所/警务站可共享街区。
  const facilityIds=Object.entries(policy.facilities).flatMap(([modelId,count])=>Array(count).fill(modelId))
    .sort((a,b)=>catalog.get(b).width*catalog.get(b).depth-catalog.get(a).width*catalog.get(a).depth)
  for(const modelId of facilityIds) {
    const model=catalog.get(modelId),major=['hospital','school','fire-station'].includes(modelId)
    // 核心至少保留两个商业街区，避免公共设施占满城心。
    const preserveCommerce = region.growth === 'center-out' && blocks.filter(block => block.growthRing === 0 && block.kind === 'commercial').length <= 2
    const candidates=blocks.filter(block=>(!preserveCommerce || block.growthRing !== 0 || block.kind !== 'commercial') && block.kind!=='park' && !block.majorFacility && (major?block.parcels.length===0:block.parcels.length<2))
      .sort((a,b)=>{
        const score=block=>(block.centerDistance || 0)*100+(block.kind==='industrial'?10000:0)+block.parcels.length*5000-(block.bounds.maxX-block.bounds.minX)*(block.bounds.maxZ-block.bounds.minZ)
        return score(a)-score(b)||a.id.localeCompare(b.id)
      })
    let placed
    for(const block of candidates) {
      const b=block.bounds,x=(b.minX+b.maxX)/2,z=(b.minZ+b.maxZ)/2
      const anchors=[[x,b.minZ+12],[x,b.maxZ-12],[b.minX+12,z],[b.maxX-12,z],...frontageCandidates(block,createRandom(seed,block.id,modelId),18)]
      for(const anchor of anchors) {
        placed=placeUrbanBuilding({model,anchor,block,segments,placements,surfaces,id:`${id}/facility:${modelId}`,gap:5})
        if(placed)break
      }
      if(placed) {
        block.kind='civic';block.majorFacility=major;placed.facility=modelId
        facilities.push({id:placed.id,modelId,blockId:block.id})
        break
      }
    }
  }
  for(const block of blocks) {
    const b=block.bounds,x=(b.minX+b.maxX)/2,z=(b.minZ+b.maxZ)/2
    if(block.kind==='park') {
      for(const dx of [-10,10]) for(const dz of [-10,10]) decorations.push({id:`${block.id}/tree:${dx}:${dz}`,assetId:'nature.broadleaf',position:[x+dx,0,z+dz],rotation:0,scale:1})
      decorations.push(...expandAssembly(`${block.id}/rest`,'yard.rest-stop',[x,0,z]))
      continue
    }
    const settings=districtProfiles[block.kind]
    const random=createRandom(seed,block.id,'parcels-v2')
    const area=(b.maxX-b.minX)*(b.maxZ-b.minZ)
    let occupied=placements.filter(item=>item.blockId===block.id).reduce((sum,item)=>sum+item.footprint.width*item.footprint.depth,0)
    const anchors=frontageCandidates(block,random,settings.spacing)
    if(!block.majorFacility) for(let index=0;index<anchors.length && placements.length<policy.maxBuildings;index+=1) {
      if(random()<1-0.87*(block.density ?? 1))continue // 少量空地作为庭院与残缺街沿，随机流按街区隔离。
      const offset=Math.floor(random()*settings.models.length)
      const angle=(random()-0.5)*2*(block.kind==='industrial'?1:policy.jitter)*Math.PI/180
      const setback=random()*(block.kind==='commercial'?0.6:1.6)
      for(let attempt=0;attempt<3;attempt+=1) {
        const model=catalog.get(settings.models[(offset+attempt)%settings.models.length])
        const coverage=model.footprint.width*model.footprint.depth
        if(occupied+coverage>area*settings.coverage*(block.density ?? 1))continue
        const placed=placeUrbanBuilding({model,anchor:anchors[index],block,segments,placements,surfaces,id:`${block.id}/lot:${index}`,angle,setback,gap:settings.gap})
        if(placed){occupied+=coverage;break}
      }
    }
    block.coverage=occupied/area
    block.openSpace=block.majorFacility?'institution-yard':block.kind==='industrial'?'service-yard':'shared-courtyard'
    decorations.push(...expandAssembly(`${block.id}/yard`,block.kind==='industrial'?'yard.worksite':'yard.rest-stop',[x,0,z]))
  }
  const clearDecorations=decorations.filter(item=>{
    const road=sampleRoad(segments,item.position[0],item.position[2])
    return road.distance>road.width/2+3 && !placements.some(building=>overlapsPlacement({...item,footprint:{width:6,depth:6}},building,1))
  })
  const districts=['residential','commercial','industrial','civic','park'].map(kind=>({
    id:`${id}/district:${kind}`,kind,blockIds:blocks.filter(block=>block.kind===kind).map(block=>block.id),
  })).filter(district=>district.blockIds.length)
  for(const block of blocks)block.districtId=`${id}/district:${block.kind}`
  const extent=profile.span/2+12
  return {id,regionId:region.id,kind:'city',citySize:region.citySize||'medium',name:region.name,revision:2,catalogVersion:1,streetPlanVersion:3,frontageVersion:1,urbanPlanVersion:2,elevation:0,
    ...(region.growth ? { growth: region.growth, center: [cx, cz] } : {}),
    bounds:{minX:cx-extent,maxX:cx+extent,minZ:cz-extent,maxZ:cz+extent},gate:gates[0],gates,roads,districts,blocks,facilities,
    facilityQuotas:{...policy.facilities},placements,surfaces,decorations:clearDecorations}
}
