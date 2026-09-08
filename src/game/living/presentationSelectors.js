import { placeStatus } from '../gameplay/places.js'
import { pursuitFor } from '../gameplay/pursuit.js'
import { distance } from './geometry.js'

const time=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`
const activityWords={work:'忙着手头的活',rest:'正在休息',social:'在此歇脚',eat:'正在等候食物',patrol:'巡查中'}

/** Only visible bodies/places and previously known fixed addresses leave here. */
export function createPresentationSelectors() {
  let previous=null,index=null
  function indexed(state) {
    if(state===previous)return index
    index={actors:new Map(state.interactions.actors.map(a=>[a.id,a])),life:new Map((state.life?.actors??[]).map(a=>[a.actorId,a])),
      places:new Map((state.places?.definitions??[]).map(p=>[p.id,p])),entries:new Map((state.places?.entries??[]).map(p=>[p.placeId,p]))}
    previous=state;return index
  }
  return (state,{at,knownPlaces,seenActors,seenPlaceIds,fighters,targetId,trade})=>{
    const data=indexed(state),visible=new Map(seenActors.map(a=>[a.id,a.point])),inView=new Set(seenPlaceIds)
    const phases=new Map(fighters.map(f=>[f.id,f.phase])),actorStates={}
    for(const [id] of visible) {
      const actor=data.actors.get(id),life=data.life.get(id),phase=phases.get(id)
      if(actor.health<=0)actorStates[id]='已经倒下'
      else if(phase==='incapacitated')actorStates[id]='被制服，暂时不能行动'
      else if(phase==='custody')actorStates[id]='正在接受现场拘押'
      else if(['windup','active','recovery','guard','broken'].includes(phase))actorStates[id]=phase==='guard'?'正在招架':'正在交手'
      else if(life?.interruption)actorStates[id]=life.interruption.kind==='flee'?'正在避险':'正在处理事务'
      else if(life?.intent?.phase==='travelling')actorStates[id]='正在赶路'
      else if(life?.intent?.kind==='rest'&&actor.health<actor.maxHealth)actorStates[id]='受伤，正在休养'
      else if(id==='merchant'&&life?.intent?.phase==='interacting'&&state.opportunities?.entries.some(r=>r.issuerId===id&&r.requirements.kind==='procurement'&&r.status==='offered'&&r.deadlineAt>at))actorStates[id]='在铺前招呼帮手去采购'
      else actorStates[id]=activityWords[life?.intent?.kind]??(actor.health<actor.maxHealth?'身上有伤':'在此停留')
    }
    const places=knownPlaces.map(marker=>{
      const place=data.places.get(marker.id),entry=data.entries.get(marker.id)
      if(!place||!entry)return marker
      const opening=place.kind==='shop'?place.hours.map(h=>`${time(h.startMinute)}—${time(h.endMinute)}`).join(' / '):null
      const base={...marker,opening,presence:opening?`通常在此；营业 ${opening}`:marker.presence}
      if(!inView.has(place.id))return base
      const bodyHere=id=>visible.has(id)&&distance(visible.get(id),place.approach)<=4
      let presence='这里暂未看到本人'
      if(place.kind==='shop') {
        const status=placeStatus(state,place.id,at)
        if(!status.inHours)presence=`已打烊；营业 ${opening}`
        else if(!bodyHere(entry.operatorId))presence='门前暂未见掌柜，请稍后再来'
        else if(data.actors.get(entry.operatorId)?.health<=0)presence='掌柜倒下，暂时无人接待'
        else if(!status.open)presence='掌柜暂时忙，尚未营业'
        else if(targetId===entry.operatorId&&trade.available) {
          const businessId=entry.businessActorId??entry.operatorId,owner=data.actors.get(businessId)
          const stock=type=>state.interactions.inventory.lots.some(l=>l.itemType===type&&l.ownerId===businessId&&l.holderId===owner.containerId&&l.quantity>0)
          presence=!stock('medicine')?'正在营业；止血药售罄':!stock('ration')?'正在营业；干粮售罄':'正在营业，可以买卖'
        } else presence='掌柜在铺前，靠近可询问买卖'
      } else if(place.kind==='civic') {
        const guards=state.crime.authorities.filter(id=>bodyHere(id)&&data.actors.get(id)?.health>0)
        presence=guards.length?'这里有捕快，可以靠近询问':'门前暂未见捕快；报案需当面交代'
      } else if(place.kind==='home') {
        const resident=entry.residentIds.find(bodyHere)
        presence=resident?actorStates[resident]:'门前暂未见住户'
      } else if(marker.actorId&&bodyHere(marker.actorId))presence=actorStates[marker.actorId]
      return {...base,presence,observedAt:at}
    })
    const current=places.filter(p=>inView.has(p.id)&&p.distance<=8).sort((a,b)=>a.distance-b.distance)[0]
    const visiblePursuits=state.crime.authorities.filter(id=>visible.has(id)&&data.actors.get(id)?.health>0).map(id=>pursuitFor(state,id,'player',at))
    const pursuitText=phases.get('player')==='custody'?'捕快正在现场处理本次案件':phases.get('player')==='incapacitated'?'你被制服了，尚未被捕快实际控制':
      visiblePursuits.some(p=>p.mode==='follow')?'附近有捕快正在追你':visiblePursuits.some(p=>p.mode==='search')?'附近捕快正在搜查':'暂无可见追踪'
    return {places,actorStates,currentPlace:current?.label??null,targetStatus:actorStates[targetId]??null,pursuitText}
  }
}
