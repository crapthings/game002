import { NPCS, validFirstLoop } from '../worldLedger/firstLoop.js'
import { merchantCash } from '../worldLedger/community.js'
export const LIVING_NPCS = [...NPCS,{id:'guard-2',name:'援捕林岳',home:[4,-32],heading:0,color:'#548be0'}]
export const LIVING_ITEMS = [
  {id:'medicine',name:'止血药',consumable:true,healing:25},
  {id:'ration',name:'干粮',consumable:true,healing:10},
  {id:'parcel',name:'陈掌柜的药包',tradable:false,giftable:false},
  {id:'sword',name:'铁剑',equipment:{slot:'weapon',attack:8}},
  {id:'vest',name:'布甲',equipment:{slot:'armor',defense:3}},
]
export const PRICES={medicine:[15,7],ration:[5,2],sword:[30,12],vest:[25,10]}
export function livingConfig(legacy,world) {
  if(legacy!==null && !validFirstLoop(legacy,world)) throw new Error('旧药包记录无效，已保留原档。')
  const ids=['player',...LIVING_NPCS.map(n=>n.id)]
  const actors=ids.map(id=>({id,containerId:`${id}-bag`,wallet:id==='player'?(legacy?.wallet??100):id==='merchant'?(legacy?merchantCash(legacy.community):60):id==='resident-1'?(legacy?.community.rewardTreasury??40):30,
    health:id==='player'?(legacy?.community.health??60):id==='resident-1'?(legacy?.community.aid.eventId?100:60):100,
    maxHealth:100,attack:id.startsWith('guard')?16: id==='player'?20:12,defense:id.startsWith('guard')?3:0,courage:id.startsWith('guard')?90:id==='resident-2'?80:20}))
  const lots=[]
  for(const item of ['medicine','ration']) {
    const own=legacy?.community.inventory[item]??(item==='ration'?1:0),stock=legacy?.community.stock[item]??(item==='medicine'?4:6)
    if(own)lots.push({id:`own-${item}`,itemType:item,quantity:own,ownerId:'player',holderId:'player-bag'})
    if(stock)lots.push({id:`stock-${item}`,itemType:item,quantity:stock,ownerId:'merchant',holderId:'merchant-bag'})
  }
  for(const item of ['sword','vest'])lots.push({id:`stock-${item}`,itemType:item,quantity:1,ownerId:'merchant',holderId:'merchant-bag'})
  const holder=legacy?.item.holderId??'stall'
  lots.push({id:'medicine-parcel',itemType:'parcel',quantity:1,ownerId:'merchant',holderId:holder==='stall'?'stall':`${holder}-bag`})
  for(const id of ['guard','guard-2','resident-2'])lots.push({id:`${id}-gear`,itemType:id==='resident-2'?'vest':'sword',quantity:1,ownerId:id,holderId:`${id}-bag`})
  const events=(legacy?.events??[]).filter(e=>['take','settle','return','aid','reward'].includes(e.kind)).map(e=>({id:`village:legacy:${e.id}`,kind:e.kind,at:e.at,actorId:e.details.actorId,targetId:e.kind==='take'?'merchant':e.kind==='aid'?'resident-1':e.kind==='reward'?'player':e.kind==='settle'?'guard':'merchant',cause:e.cause?`village:legacy:${e.cause}`:null,requestId:`legacy:${e.id}`}))
  const aid=legacy?.community.aid
  return {id:'living-street-v1',combat:true,authorities:['guard','guard-2'],items:LIVING_ITEMS,actors,
    containers:[...ids.map(id=>({id:`${id}-bag`,capacity:id==='player'?6:null})),{id:'stall',capacity:null}],lots,
    village:{masked:legacy?.masked??false,aid:aid?{eventId:aid.eventId?`village:legacy:${aid.eventId}`:null,dueAt:aid.dueAt,subject:aid.subject,rewardEvent:aid.rewardEvent?`village:legacy:${aid.rewardEvent}`:null}:{eventId:null,dueAt:null,subject:null,rewardEvent:null},
      events,settled:events.filter(e=>e.kind==='settle').map(e=>e.cause),
      knowledge:(legacy?.events??[]).filter(e=>['witness','report','aid'].includes(e.kind)).map(e=>({
        kind:e.kind==='report'?'report':'witness',actorId:e.kind==='report'?e.details.reporterId:e.kind==='aid'?'resident-1':e.details.observerId,
        sourceId:`village:legacy:${e.kind==='report'?legacy.events.find(w=>w.id===e.cause).cause:e.kind==='aid'?e.id:e.cause}`,
        subjectId:e.details.subject,proofId:`legacy:${e.id}`,
        position:{x:(e.details.observedPosition??e.details.lastKnown??e.details.position)[0],y:world.city?.elevation??0,z:(e.details.observedPosition??e.details.lastKnown??e.details.position)[1]}})),
      trust:legacy?.community.relationship.trust??0,at:legacy?.nowMs??0}}
}
