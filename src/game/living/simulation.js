import { createGameplay, createWorldSession, migrateWorldToV2, previewGameplayCombat, pursuitFor, tradeEligibility, servicePresence, meetingEligibility, dialogueTopics, dialogueAnswer, availableWallet, knownOpportunities, prepareCommitment } from '../gameplay/index.js'
import { shouldArchive } from '../gameplay/historyArchive.js'
import { createLivingStateIndex } from './createLivingStateIndex.js'
import { livingConfig, LIVING_NPCS, PRICES } from './config.js'
import { distance, facingAngle, sweptContact } from './geometry.js'
import { createClockOrigin, clockAt } from './clock.js'
import { sceneActorDefinitions } from './actorRegistry.js'
import { nextDailyActivity } from './dailySchedule.js'
import { spokenAnswer } from './dialoguePresentation.js'
import { createOpportunityDirector } from './opportunityDirector.js'
import { personalOpportunity,sameKnownProgress } from '../gameplay/opportunityKnowledge.js'
import { relationFor } from '../gameplay/relations.js'
import { createSocialController } from './socialController.js'
import { createEconomyController } from './economyController.js'
import { createPayrollController } from './payrollController.js'
import { createFactionController } from './factionController.js'
import { caseSettlementQuote } from '../gameplay/caseSettlement.js'
import { warningOptions } from '../gameplay/gangRequests.js'
import { captureForBounty } from '../gameplay/bounties.js'
import { createEscortController } from './escortController.js'
import { escortMemory } from '../gameplay/escorts.js'
import { standingQuote,completionRecords,hasStanding,standingPrice } from '../gameplay/standing.js'
import { activeLease,trainingFor,growthSafe } from '../gameplay/growth.js'
import { createGrowthController } from './growthController.js'
import { GROWTH_V1,STANDING_V1 } from '../gameplay/content/standingV1.js'
import { createRecoveryController } from './recoveryController.js'
import { createStaffingController } from './staffingController.js'
const copy=v=>structuredClone(v)
export function createLivingSimulation({world,legacy=null,saved,initialHour=7.5,save,space,notify=()=>{},effects=()=>{}}) {
  const config=livingConfig(legacy,world)
  let checkpoint=saved
  if(checkpoint?.gameplay.version!==2) {
    if(!checkpoint){const initial=createGameplay(config);checkpoint={version:1,sequence:0,simulationAt:initial.state.at,gameplay:initial.state}}
    const migrated=migrateWorldToV2(config,checkpoint,{clockOrigin:createClockOrigin(checkpoint.simulationAt,initialHour),bodyActorIds:config.actors.map(a=>a.id)})
    if(!migrated.ok)throw new Error(`江湖版本迁移失败：${migrated.code}，保留原档。`)
    checkpoint=migrated.checkpoint
  }
  const session=createWorldSession(config,{saved:checkpoint,save,archive:true})
  let state=session.snapshot().gameplay,clock=session.status().simulationAt,busy=false,stopped=false,guardDesired=false,checkpointDepth=0
  const stateIndex=createLivingStateIndex(config),indexed=()=>stateIndex(state)
  let npcState=null,npcCache=LIVING_NPCS
  const npcs=()=>{if(npcState!==state){npcState=state;npcCache=sceneActorDefinitions(state)}return npcCache}
  let remainder=0
  const priorRequests=[...(state.archive?.legacyCheckpoint.gameplay.journal??[]),...state.journal]
  let serial=[...priorRequests.map(r=>r.id),...Object.keys(state.archive.history?.requestIndex??{})]
    .reduce((n,id)=>/^live-\d+$/.test(id)?Math.max(n,Number(id.slice(5))):n,state.revision),sweep=new Map(),view=previewGameplayCombat(state,clock)
  for(const f of view)if(f.phase==='active')sweep.set(f.swing.id,(clock-f.swing.activeAt)/180)
  const actor=id=>indexed().actors.get(id)
  const routineDue=new Map()
  let servicesDue=0
  let conversation=null,meetingSerial=0
  const fighter=id=>view.find(a=>a.id===id)
  const alive=id=>actor(id)?.health>0
  const near=(a,b,r=2)=>distance(space.point(a),space.point(b))<=r && Math.abs(space.point(a).y-space.point(b).y)<1.5 && (space.contactClear??space.clear)(space.point(a),space.point(b))
  const contact=(a,b)=>near(a,b)&&Math.abs(facingAngle(space.point(a),space.point(b)))<=65
  const nearPlace=(id,placeId)=>{const place=state.places?.definitions.find(p=>p.id===placeId);return !!place&&distance(space.point(id),place.approach)<=3&&
    Math.abs(space.point(id).y-place.approach.y)<1.5&&(space.contactClear??space.clear)(space.point(id),place.approach)}
  const sees=(a,b,identify=false)=>alive(a)&&alive(b)&&space.visible(a,b,identify)&&!(identify&&b==='player'&&state.village.masked)
  const observers=(actorId,targetId=null)=>npcs().filter(n=>n.id!==actorId&&(sees(n.id,actorId)||n.id===targetId)).map(n=>({npcId:n.id,identified:sees(n.id,actorId,true),position:copy(space.point(actorId)),proofId:`sight-${serial+1}-${n.id}`}))
  // NPC meetings use verified ground geometry even outside rendered chunks.
  // This is not a crime-observation shortcut, and can also notice a body nearby.
  const noticesPerson=(a,b)=>alive(a)&&near(a,b,12)&&(near(a,b)||Math.abs(facingAngle(space.point(a),space.point(b)))<=65)
  const opportunityDirector=createOpportunityDirector({state:()=>state,clock:()=>clock,ids:()=>npcs().map(n=>n.id),
    point:space.point,notice:noticesPerson,contact:near,face:space.face,move:space.move,
    interrupt:interruptRoutine,send,talkingTo:()=>conversation?.speakerId,atPlace:space.atPlace})
  const socialController=createSocialController({state:()=>state,clock:()=>clock,ids:()=>npcs().map(n=>n.id),point:space.point,contact:near,
    face:space.face,send,talkingTo:()=>conversation?.speakerId})
  const economyController=createEconomyController({state:()=>state,clock:()=>clock,atPlace:space.atPlace,contact:near,point:space.point,
    face:space.face,tradeContext,send,talkingTo:()=>conversation?.speakerId})
  const payrollController=createPayrollController({state:()=>state,clock:()=>clock,atPlace:space.atPlace,send,talkingTo:()=>conversation?.speakerId})
  const factionController=createFactionController({state:()=>state,clock:()=>clock,point:space.point,notice:noticesPerson,contact:near,
    face:space.face,move:space.move,atPlace:space.atPlace,interrupt:interruptRoutine,send,talkingTo:()=>conversation?.speakerId})
  const escortController=createEscortController({state:()=>state,clock:()=>clock,point:space.point,notice:noticesPerson,contact:near,
    face:space.face,move:space.move,nearPlace,interrupt:interruptRoutine,send,talkingTo:()=>conversation?.speakerId})
  const growthController=createGrowthController({state:()=>state,clock:()=>clock,context:growthContext,nearPlace,send})
  const recoveryController=createRecoveryController({state:()=>state,clock:()=>clock,context:recoveryContext,send})
  const staffingController=createStaffingController({state:()=>state,clock:()=>clock,notice:noticesPerson,contact:near,atPlace:space.atPlace,send,talkingTo:()=>conversation?.speakerId})
  async function send(domain,command,extra={},observe=false,continuation=[]) {
    if(busy||stopped)return {ok:false,code:'BUSY'}
    busy=true
    const step={domain,command,context:{at:clock,allowed:true,...extra}}
    if(observe)step.observations=observers(command.actorId,['combat','robbery'].includes(domain)?command.targetId:command.kind==='aid'?'resident-1':null)
    try {
      const steps=[step,...continuation.map(s=>({...s,context:{at:clock,allowed:true,...s.context}}))]
      const result=await session.dispatch({id:`live-${++serial}`,expectedRevision:state.revision,steps})
      if(result.ok){state=result.state;view=previewGameplayCombat(state,clock);effects(result.events)}
      else {
        notify(result.code)
        if(['SAVE_OUTCOME_UNKNOWN','RECOVERY_REQUIRED','STORAGE_CONFLICT','HISTORY_FULL'].includes(result.code))stopped=true
      }
      return result
    } finally {busy=false}
  }
  function interruptRoutine(actorId,reason,priority,cause=null) {
    const row=state.life?.actors.find(a=>a.actorId===actorId)
    if(!row?.intent||row.interruption?.priority>=priority)return false
    send('life',{kind:'interrupt',actorId,reason,priority},{cause}).then(result=>{if(result.ok)space.suspendRoutine?.(actorId)})
    return true
  }
  function tradeContext(actorId,targetId) {
    const entry=state.places?.entries.find(e=>(e.businessActorId??e.operatorId)===targetId&&state.places.definitions.some(p=>p.id===e.placeId&&p.kind==='shop'))
    const provider=entry?.operatorId
    return {at:clock,placeId:entry?.placeId??null,operatorId:provider??null,
      withinRange:!!provider&&near(actorId,provider),clear:!!provider&&(space.contactClear??space.clear)(space.point(actorId),space.point(provider)),
      facing:!!provider&&(provider===actorId||Math.abs(facingAngle(space.point(actorId),space.point(provider)))<=65),
      operatorPresent:!!provider&&space.atPlace(provider,entry.placeId),proofId:`service-${serial+1}`}
  }
  const tradeStatus=()=>tradeEligibility(state,'player','merchant',tradeContext('player','merchant'))
  function refreshServices() {
    if(state.places?.serviceVersion!==1||clock<servicesDue)return false
    for(const entry of state.places.entries) {
      if(!entry.operatorId||!alive(entry.operatorId))continue
      const status=servicePresence(state,entry,{present:space.atPlace(entry.operatorId,entry.placeId),phase:fighter(entry.operatorId)?.phase})
      if(status===entry.status)continue
      send('places',{kind:'presence',actorId:entry.operatorId,placeId:entry.placeId,status},
        {present:space.atPlace(entry.operatorId,entry.placeId),proofId:`presence-${serial+1}`,cause:state.life.actors.find(a=>a.actorId===entry.operatorId)?.interruption?.sourceEventId??null})
      return true
    }
    servicesDue=clock+1000;return false
  }
  function meetingContext(speakerId) {
    return {at:clock,allowed:true,withinRange:near('player',speakerId),clear:space.clear(space.point('player'),space.point(speakerId)),
      facing:Math.abs(facingAngle(space.point('player'),space.point(speakerId)))<=65,
      identified:sees(speakerId,'player',true),
      meetingId:conversation?.id??'meeting-pending',proofId:`meeting-${serial+1}`}
  }
  function growthContext(id='player') {
    const mentor=GROWTH_V1.mentorId,placeId=state.places?.bindings.find(b=>b.actorId===mentor)?.homePlaceId
    const p=space.point(id),q=space.point(mentor)
    return {at:clock,allowed:true,withinRange:near(id,mentor),clear:(space.contactClear??space.clear)(p,q),facing:Math.abs(facingAngle(p,q))<=65,
      identified:id==='player'?sees(mentor,id,true):noticesPerson(mentor,id),placeId,present:!!placeId&&nearPlace(id,placeId),mentorPresent:!!placeId&&nearPlace(mentor,placeId),
      dangerFree:!npcs().some(n=>n.id!==id&&alive(n.id)&&near(id,n.id,12)&&['windup','active','recovery','broken'].includes(fighter(n.id)?.phase)),
      proofId:`practice:${id}:${serial+1}`}
  }
  function recoveryContext(id) {
    const rest=id==='player'?state.standing?.rests?.findLast(r=>r.holderId===id&&r.active):null
    const placeId=rest?.placeId??state.life?.actors.find(a=>a.actorId===id)?.intent?.placeId
    return {at:clock,allowed:true,placeId,present:!!placeId&&(id==='player'?nearPlace(id,placeId):space.atPlace(id,placeId)),
      dangerFree:conversation?.speakerId!==id&&!npcs().some(n=>n.id!==id&&alive(n.id)&&near(id,n.id,12)&&['windup','active','recovery','broken'].includes(fighter(n.id)?.phase)),
      proofId:`recovery:${id}:${serial+1}`}
  }
  function noticePlace() {
    const p=space.point('player'),law=state.factions?.entries.find(f=>f.kind==='law')
    return state.places?.definitions.find(place=>law?.servicePlaceIds.includes(place.id)&&distance(p,place.approach)<=2&&
      Math.abs(p.y-place.approach.y)<1.5&&Math.abs(facingAngle(p,place.approach))<=65&&(space.contactClear??space.clear)(p,place.approach))
  }
  function refreshConversation() {
    if(!conversation)return
    if(space.conversationOpen?.()===false){conversation=null;return}
    const eligible=meetingEligibility(state,conversation.speakerId,'player',meetingContext(conversation.speakerId))
    if(!eligible.available||clock-conversation.touchedAt>=30000) {
      conversation=null;notify(eligible.available?'对方先去忙了，之后还可以再问。':eligible.reason)
    }
  }
  function talk(kind,data) {
    if(kind==='talk_end'){conversation=null;return}
    if(!state.dialogue){notify('对方还在安顿，请稍等片刻。');return}
    if(kind==='talk_start') {
      refreshConversation()
      if(!actor(data.targetId)){notify('请靠近想交谈的人。');return}
      const eligible=meetingEligibility(state,data.targetId,'player',meetingContext(data.targetId))
      if(!eligible.available){notify(eligible.reason);return}
      if(conversation?.speakerId!==data.targetId)conversation={id:`meeting:${serial}:${++meetingSerial}`,speakerId:data.targetId,listenerId:'player',touchedAt:clock,lines:['你想问些什么？'],placeIds:[],opportunityIds:[]}
      conversation.touchedAt=clock
      space.face(data.targetId,space.point('player'));return
    }
    refreshConversation()
    if(!conversation||data.meetingId!==conversation.id){notify('MEETING_ENDED');return}
    const current=conversation,context=meetingContext(current.speakerId),answer=dialogueAnswer(state,current.speakerId,'player',data.topicId,context)
    if(!answer.ok){notify(answer.code);return}
    current.touchedAt=clock
    const knownPlaces=new Set([...(space.knownPlaceIds?.()??[]),...state.dialogue.addresses.filter(a=>a.listenerId==='player').map(a=>a.placeId)])
    const commands=answer.kind==='places'?answer.placeIds.filter(id=>!knownPlaces.has(id)).map(placeId=>({kind:'tell_place',actorId:current.speakerId,targetId:'player',placeId})):
      answer.kind==='news'&&!state.social.knowledge.some(k=>k.npcId==='player'&&k.factId===answer.factId&&(k.subjectId!==null||answer.subjectId===null))?[{kind:'share_news',actorId:current.speakerId,targetId:'player',factId:answer.factId}]:[]
    const steps=commands.map(command=>({domain:'dialogue',command,context}))
    if(answer.kind==='requests')for(const id of answer.opportunityIds) {
      const row=state.opportunities.entries.find(r=>r.id===id)
      if(!row.knownBy.includes('player'))steps.push({domain:'opportunities',command:{kind:'reveal',actorId:current.speakerId,targetId:'player',opportunityId:id},context})
      else if(!sameKnownProgress(personalOpportunity(state,row,current.speakerId,clock),personalOpportunity(state,row,'player',clock)))
        steps.push({domain:'opportunities',command:{kind:'tell_status',actorId:current.speakerId,targetId:'player',opportunityId:id},context})
    }
    const display=()=>{if(conversation?.id===current.id){current.lines=spokenAnswer(state,answer,Object.fromEntries(npcs().map(n=>[n.id,n.name])));current.placeIds=answer.placeIds??[];current.opportunityIds=answer.opportunityIds??[]}}
    if(!steps.length){display();return}
    send(steps[0].domain,steps[0].command,context,false,steps.slice(1)).then(result=>{if(result.ok)display()})
  }
  function command(kind,data={}) {
    if(kind==='guard'){guardDesired=data.held;return}
    if(kind==='talk_end'){conversation=null;return}
    if(busy||stopped||checkpointDepth)return
    const target=data.targetId
    if(!alive('player'))return
    if(['talk_start','talk_topic'].includes(kind))return talk(kind,data)
    if(['review_standing','present_record'].includes(kind)&&target&&contact('player',target))return send('standing',
      {kind:kind==='review_standing'?'review':kind,actorId:'player',targetId:target,...(kind==='present_record'?{eventId:data.eventId}:{})},meetingContext(target))
    if(['rent','start_training','resume_training','pause_training','cancel_training','start_rest','end_rest'].includes(kind))return send('standing',{kind,actorId:'player'},growthContext())
    if(['hear_escort','accept_escort','join_escort','collect_escort','cancel_escort'].includes(kind)) {
      const row=state.factions?.escorts.find(r=>r.id===data.escortId)
      if(!row)return
      if(kind==='cancel_escort')return send('factions',{kind,actorId:'player',escortId:row.id})
      const recipient=kind==='join_escort'?row.courierId:row.issuerId
      if(!contact('player',recipient)){notify('请与约定的当事人当面交谈。');return}
      const context=meetingContext(recipient)
      if(kind==='join_escort')Object.assign(context,{present:nearPlace(recipient,row.pickupPlaceId),placeId:row.pickupPlaceId,position:copy(space.point(recipient))})
      return send('factions',{kind,actorId:'player',escortId:row.id},context)
    }
    if(kind==='read_bounties') {
      const place=noticePlace()
      if(place)return send('factions',{kind,actorId:'player'},{present:true,placeId:place.id,proofId:`notice-read:${serial+1}`})
    }
    if(kind==='claim_bounty'&&target&&contact('player',target))return send('factions',{kind,actorId:'player',bountyId:data.bountyId,captureEventId:data.captureEventId},
      {...meetingContext(target),recipientId:target})
    if(kind==='request_warning'&&target&&contact('player',target))return send('factions',{kind,actorId:'player',targetId:target,factId:data.factId},meetingContext(target))
    if(kind==='commitment') {
      const row=state.opportunities?.entries.find(r=>r.id===data.opportunityId)
      if(!row){notify('UNKNOWN_OPPORTUNITY');return}
      refreshConversation()
      const recipient=['deliver','pickup'].includes(data.action)?row.targetActorId:row.issuerId
      if(data.action!=='cancel'&&(!conversation||conversation.id!==data.meetingId||conversation.speakerId!==recipient)){notify('MEETING_ENDED');return}
      const context=data.action==='cancel'?{allowed:true,at:clock}:{...meetingContext(recipient),identified:sees(recipient,'player',true)}
      if(['pickup','deliver_cargo','return_cargo'].includes(data.action)){context.placeId=data.action==='pickup'?row.targetPlaceId:row.returnPlaceId;context.present=space.atPlace(recipient,context.placeId)}
      const prepared=prepareCommitment(state,{kind:data.action,actorId:'player',opportunityId:row.id,terms:data.terms},context)
      if(!prepared.ok){notify(prepared.code);return}
      if(prepared.duplicate){notify('这一步已经有回执，沿用原来的结果。');return}
      if(conversation)conversation.touchedAt=clock
      const [first,...rest]=prepared.steps
      send(first.domain,first.command,first.context,false,rest).then(result=>{
        if(!result.ok)return
        const current=state.opportunities.entries.find(r=>r.id===row.id)
        const message=data.action==='accept'?`已经答应帮忙，先去找${current.requirements.kind==='procurement'?'货郎':'小何'}。${current.rewardAmount===0?'这次明确约定无偿帮忙。':''}`:
          data.action==='pickup'?(current.status==='failed'?'货郎无法按约提供货物或采购款不足，采购已结束。':'已经取得真实货物，货款从掌柜预留的钱中支付。请运回药铺。'):
          data.action==='deliver_cargo'?(current.status==='fulfilled'?`货物已交回药铺，结清${current.rewardAmount}文跑腿报酬。`:'货物已交回，但跑腿报酬仍待支付。'):
          data.action==='return_cargo'?'你把仍持有的货物交回了物主；原委托仍已结束，没有再次发放报酬。':
          data.action==='deliver'?'小何收到了口信，也给了你答复。现在可以回去告诉石伯。':
          data.action==='collect'?(current.status==='fulfilled'?(current.rewardAmount?`委托已完成，收到${current.rewardAmount}文。`:'已经按约定无偿办妥。'):'石伯确认事情办到了，但现钱不足；这笔报酬仍然欠着。'):
          data.action==='decline'?'你婉拒了这件事，没有扣除钱物。':'已放弃这件委托。'
        notify(message);if(conversation)conversation.lines=[message]
      });return
    }
    if(kind==='attack')return send('combat',{kind:'attack',actorId:'player'})
    if(kind==='mask')return send('village',{kind:'mask',actorId:'player'})
    if(kind==='use')return send('interaction',{kind:'use',actorId:'player',targetId:'player',lotId:data.lotId,quantity:1})
    if(kind==='equip'||kind==='unequip')return send('equipment',{kind,actorId:'player',slot:data.slot,...(kind==='equip'?{lotId:data.lotId}:{})})
    if(kind==='take'&&contact('player','stall'))return send('village',{kind:'take',actorId:'player'},{},true)
    if(kind==='settle') {
      const officer=data.authorityId??[...indexed().authorities].filter(id=>alive(id)&&contact('player',id)).sort((a,b)=>distance(space.point('player'),space.point(a))-distance(space.point('player'),space.point(b)))[0]
      if(officer&&contact('player',officer))return send('village',{kind:'settle',actorId:'player',authorityId:officer},{reachable:true})
    }
    if(kind==='settle_case'&&target&&contact('player',target))return send('factions',{kind:'settle_case',actorId:'player',targetId:target,caseId:data.caseId},
      {withinRange:true,clear:true,facing:true,identified:sees(target,'player',true),proofId:`case-meeting:${serial+1}`})
    if(kind==='aid'&&contact('player','resident-1')){space.face('resident-1',space.point('player'));return send('village',{kind:'aid',actorId:'player',lotId:data.lotId},{identified:sees('resident-1','player',true)},true)}
    if(['buy','sell'].includes(kind)) {
      const service=tradeContext('player','merchant'),eligible=tradeEligibility(state,'player','merchant',service)
      if(!eligible.available){notify(eligible.reason);return}
      const lot=indexed().lots.get(data.lotId)
      if(lot&&PRICES[lot.itemType])return send('interaction',{kind,actorId:'player',targetId:'merchant',lotId:lot.id,quantity:1},
        {unitPrice:kind==='buy'?standingPrice(state,'player','merchant',lot.itemType,PRICES[lot.itemType][0]):PRICES[lot.itemType][1],service})
    }
    if(target&&contact('player',target)) {
      if(kind==='threaten')return send('robbery',{kind,actorId:'player',targetId:target,amount:20},
        {reachable:true,proofId:`threat-${serial+1}`,guardNearby:[...indexed().authorities].some(g=>g!==target&&sees(target,g)&&near(target,g,10)),escapeRoute:space.canEscape(target,'player')},true)
      if(kind==='loot_item'||kind==='loot_money')return send('property',{kind,actorId:'player',targetId:target,...(kind==='loot_item'?{lotId:data.lotId,quantity:1}:{amount:actor(target).wallet})},{reachable:true,proofId:`loot-${serial+1}`},true)
    }
    notify('请靠近目标，保持视线无遮挡。')
  }
  // Priorities: release, active hits, evidence delivery/assessment, NPC goals.
  function update(dt) {
    if(busy||stopped||checkpointDepth)return
    remainder+=dt*1000;const elapsed=Math.floor(remainder);remainder-=elapsed;clock+=elapsed;view=previewGameplayCombat(state,clock)
    refreshConversation()
    const hero=fighter('player')
    const index=indexed()
    if(!guardDesired && alive('player') && (hero.guardHeld||hero.mustRelease)) {send('combat',{kind:'guard',actorId:'player',held:false});return}
    if(index.capacityStatus!=='available'){
      if(shouldArchive(state)){checkpoint();return}
      guardDesired=false;if(alive('player')&&(hero.guardHeld||hero.mustRelease)){send('combat',{kind:'guard',actorId:'player',held:false});return}
      stopped=true;notify('保留记录接近容量上限，已停止新增行动，请保存退出。');checkpoint();return
    }
    if(guardDesired && alive('player') && !hero.guardHeld&&!hero.mustRelease&&hero.phase==='idle'&&hero.stamina>=25000){send('combat',{kind:'guard',actorId:'player',held:true});return}
    for(const f of view) {
      if(f.phase!=='active')continue
      const fraction=(clock-f.swing.activeAt)/180,old=sweep.get(f.swing.id)??0
      for(const target of state.interactions.actors) {
        if(target.id===f.id||target.health===0||f.swing.hitIds.includes(target.id))continue
        if(sweptContact(space.point(f.id),space.point(target.id),old,fraction,space.clear)) {
          send('combat',{kind:'hit',actorId:f.id,targetId:target.id,swingId:f.swing.id},
            {contact:true,clear:true,angleDegrees:facingAngle(space.point(target.id),space.point(f.id)),proofId:`hit-${serial+1}`},true);return
        }
      }
      sweep.set(f.swing.id,fraction)
    }
    for(const id of sweep.keys())if(!view.some(f=>f.swing?.id===id))sweep.delete(id)
    if(!state.places&&space.placeSetup){send('places',{kind:'register',actorId:'player',...space.placeSetup()},{geometryConfirmed:true});return}
    if(state.places&&!state.life) {
      const setup=space.lifeSetup?.()
      if(setup){send('places',{kind:'extend',actorId:'player',...setup},{geometryConfirmed:true},false,[{domain:'life',command:{kind:'initialize',actorId:'player'}}]);return}
    }
    if(state.life&&!state.places.serviceVersion){send('places',{kind:'enable_services',actorId:'player'});return}
    if(state.places?.serviceVersion&&!state.dialogue){send('dialogue',{kind:'initialize',actorId:'player'});return}
    if(state.dialogue&&!state.opportunities){send('opportunities',{kind:'initialize',actorId:'player'});return}
    if(state.opportunities&&!state.opportunities.autonomyVersion){send('opportunities',{kind:'enable_autonomy',actorId:'player'});return}
    if(state.opportunities?.autonomyVersion&&!state.relations){send('relations',{kind:'initialize',actorId:'player'});return}
    if(state.relations&&!state.relations.exchangeVersion){send('exchange',{kind:'enable',actorId:'player'});return}
    if(state.relations?.exchangeVersion&&!state.economy){send('economy',{kind:'initialize',actorId:'player'});return}
    if(state.economy&&!state.economy.employmentVersion){send('economy',{kind:'enable_employment',actorId:'player'});return}
    if(state.economy?.employmentVersion&&!state.factions){send('factions',{kind:'initialize',actorId:'player'});return}
    if(state.factions&&!state.factions.actionsVersion){send('factions',{kind:'enable_actions',actorId:'player'});return}
    if(state.factions?.actionsVersion&&!state.factions.bountyVersion){send('factions',{kind:'enable_bounties',actorId:'player'});return}
    if(state.factions?.actionsVersion&&!state.factions.escortsVersion){send('factions',{kind:'enable_escorts',actorId:'player'});return}
    if(state.factions?.actionsVersion&&!state.standing){send('standing',{kind:'initialize',actorId:'player'});return}
    if(state.standing&&!state.standing.growthVersion){send('standing',{kind:'enable_growth',actorId:'player'});return}
    if(state.standing?.growthVersion&&!state.continuity){send('continuity',{kind:'initialize',actorId:'player'});return}
    if(state.economy&&!state.registry.actors.some(a=>a.actorId==='supplier-1')) {
      const body=space.supplierSetup?.()
      if(body){send('registry',{kind:'arrive',actorId:'supplier-1',templateId:'supplier-1'},{geometryConfirmed:true,proofId:'supplier-site-confirmed',body});return}
    }
    if(state.factions&&!state.registry.actors.some(a=>a.actorId==='gang-1')) {
      const body=space.gangSetup?.()
      if(body){send('registry',{kind:'arrive',actorId:'gang-1',templateId:'gang-1'},{geometryConfirmed:true,proofId:'river-site-confirmed',body});return}
    }
    if(state.opportunities) {
      const due=state.opportunities.entries.find(r=>['offered','accepted'].includes(r.status)&&!r.returnEventId&&clock>=r.deadlineAt)
      if(due){send('opportunities',{kind:'expire',actorId:due.issuerId,opportunityId:due.id});return}
      const need=[...state.opportunities.needs,...(state.economy?.needs??[])].find(n=>alive(n.issuerId)&&alive(n.targetActorId)&&!state.opportunities.entries.some(r=>r.rootCauseId===n.id))
      if(need){send('opportunities',{kind:'offer',actorId:need.issuerId,needId:need.id});return}
    }
    if(refreshServices())return
    if(socialController.closeSeparated())return
    if(payrollController.update())return
    if(growthController.update())return
    if(recoveryController.update())return
    if(staffingController.update())return
    if(escortController.observe())return
    for(const npc of npcs()) {
      const id=npc.id,f=fighter(id)
      if(!alive(id))continue
      const knowledge=index.npcs.get(id),gear=knowledge.gear
      if(f.phase!=='idle'&&interruptRoutine(id,'combat',90,f.swing?.cause??knowledge.lastAttack?.id??null))return
      if(gear&&f.phase==='idle'){const slot=index.items.get(gear.itemType).equipment.slot;if(!index.loadouts.get(id)[slot]){send('equipment',{kind:'equip',actorId:id,slot,lotId:gear.id});return}}
      if(f.guardHeld) {
        const raised=knowledge.guardRaised
        if(raised&&clock-raised.at>=700){send('combat',{kind:'guard',actorId:id,held:false});return}
      }
      if(index.authorities.has(id)) {
        const unassessed=knowledge.unassessed
        if(unassessed){send('crime',{kind:'assess',actorId:id,factId:unassessed.factId});return}
        const wanted=knowledge.wanted,track=state.pursuit.tracks.find(t=>t.authorityId===id&&t.subjectId==='player')
        // Reinforcement is another existing guard; it learns via a delivered report.
        if(state.factions?.actionsVersion===1&&wanted.level>=3) {
          const response=factionController.report(id,knowledge.reinforcement,'reinforce',dt)
          if(response==='committed')return
          if(response==='busy')continue
        } else if(!state.factions?.actionsVersion&&wanted.level>=3&&id==='guard'&&alive('guard-2')) {
          const unsent=knowledge.reinforcement
          if(unsent){if(interruptRoutine(id,'report',70,unsent.evidenceId))return;if(near(id,'guard-2')){send('knowledge',{kind:'report',actorId:id,targetId:'guard-2',factId:unsent.factId},{delivered:true,proofId:`reinforce-${serial+1}`});return}if(f.phase==='idle')space.move(id,space.point('guard-2'),dt,1.3);continue}
        }
        if(wanted.level>0&&alive('player')) {
          if(sees(id,'player',true)&&(!track||clock-track.seenAt>=500)) {send('pursuit',{kind:'sight',actorId:id,targetId:'player'},{visible:true,identified:true,position:copy(space.point('player')),proofId:`track-${serial+1}`});return}
          if(!sees(id,'player',true)&&track?.lostAt===null){send('pursuit',{kind:'lost',actorId:id,targetId:'player'},{visible:false,proofId:`lost-${serial+1}`});return}
          const pursuit=pursuitFor(state,id,'player',clock)
          if(pursuit.destination) {
            if(interruptRoutine(id,'pursuit',80,knowledge.lastCrimePosition?.id??null))return
            if(pursuit.mayEngage&&near(id,'player',1.65)) {space.face(id,space.point('player')); if(f.phase==='idle'){send('combat',hero.phase==='windup'&&f.stamina>=25000&&!f.mustRelease?{kind:'guard',actorId:id,held:true}:{kind:'attack',actorId:id});return}}
            else if(f.phase==='idle')space.move(id,pursuit.destination,dt,1.2)
            continue
          }
          // Reports provide a fixed last-seen point, never a live player lookup.
          const memory=knowledge.lastCrimePosition
          if(!track&&memory&&clock-memory.at<30000&&f.phase==='idle'){if(interruptRoutine(id,'pursuit',80,memory.id))return;space.move(id,memory.position,dt,1.1);continue}
        }
        if(f.phase==='idle') {
          const response=factionController.officerWork(id,dt)
          if(response==='committed')return
          if(response==='busy')continue
        }
      } else {
        const threat=knowledge.lastThreat&&clock-knowledge.lastThreat.at<30000?knowledge.lastThreat:undefined
        const attack=knowledge.lastAttack&&clock-knowledge.lastAttack.at<10000?knowledge.lastAttack:undefined
        const recognized=event=>event&&knowledge.identifiedEvents.has(event.id)
        const fight=recognized(threat)&&threat.reaction==='fight'||recognized(attack)&&actor(id).courage>=70
        if(fight&&alive('player')&&sees(id,'player',true)) {
          if(interruptRoutine(id,'combat',90,attack?.id??threat?.id??null))return
          space.face(id,space.point('player'))
          if(near(id,'player',1.65)&&f.phase==='idle'){send('combat',hero.phase==='windup'&&f.stamina>=25000&&!f.mustRelease?{kind:'guard',actorId:id,held:true}:{kind:'attack',actorId:id});return}
          if(f.phase==='idle')space.move(id,space.point('player'),dt,1.2)
          continue
        }
        if((attack||threat?.reaction==='flee')&&alive('player')&&sees(id,'player')&&near(id,'player',10)) {
          if(interruptRoutine(id,'flee',80,attack?.id??threat?.id??null))return
          if(f.phase==='idle')space.flee(id,space.point('player'),dt)
          continue
        }
        const pending=knowledge.unreported
        if(state.factions?.actionsVersion===1&&pending) {
          const response=factionController.report(id,pending,'report',dt)
          if(response==='committed')return
          if(response==='busy')continue
        } else if(!state.factions?.actionsVersion&&pending&&alive('guard')) {
          if(interruptRoutine(id,'report',70,pending.evidenceId))return
          if(near(id,'guard')){send('knowledge',{kind:'report',actorId:id,targetId:'guard',factId:pending.factId},{delivered:true,proofId:`report-${serial+1}`});return}
          if(f.phase==='idle')space.move(id,space.point('guard'),dt,1.3)
          continue
        }
        if((threat?.reaction==='flee'||attack)&&f.phase==='idle'){if(interruptRoutine(id,'flee',80,attack?.id??threat?.id??null))return;const source=knowledge.lastKnownPosition;if(source)space.flee(id,source.position,dt);continue}
      }
      if(growthController.busyMentor(id)){space.face(id,space.point('player'));continue}
      const parcel=index.lots.get('medicine-parcel')
      if(id==='merchant'&&space.relocationPending?.()&&['stall','merchant-bag'].includes(parcel.holderId)) {
        if(interruptRoutine(id,'delivery',70))return
        const carrying=parcel.holderId==='merchant-bag',destination=carrying?'relocation':'stall'
        if(near(id,destination)) {send('village',{kind:carrying?'relocate_deliver':'relocate_pickup',actorId:id},
          {reachable:true,position:copy(space.point(destination)),proofId:`relocate-${serial+1}`});return}
        if(f.phase==='idle')space.move(id,space.point(destination),dt,1.1)
        continue
      }
      if(index.authorities.has(id)&&parcel.holderId===actor(id).containerId) {
        if(interruptRoutine(id,'delivery',70,state.village.events.findLast(e=>e.kind==='settle')?.id??null))return
        if(near(id,'stall')){send('village',{kind:'return',actorId:id});return}
        if(f.phase==='idle')space.move(id,space.point('stall'),dt,1.1)
        continue
      }
      const aid=state.village.aid
      if(id==='resident-1'&&aid.subject==='player'&&!aid.rewardEvent&&aid.eventId&&clock>=aid.dueAt&&alive('player')&&sees(id,'player',true)&&availableWallet(state.interactions,id)>=15) {
        if(interruptRoutine(id,'reward',60,aid.eventId))return
        if(near(id,'player')){send('village',{kind:'reward',actorId:id},{identified:true});return}
        if(f.phase==='idle')space.move(id,space.point('player'),dt,1.2)
        continue
      }
      if(conversation?.speakerId===id){space.face(id,space.point('player'));continue}
      if(f.phase==='idle') {
        if(economyController.updateNpc(id))return
        if(knowledge.relationReactionFactId){send('relations',{kind:'react',actorId:id,factId:knowledge.relationReactionFactId});return}
        if(!index.authorities.has(id)&&relationFor(state,id,'player').fear>=25&&sees(id,'player',true)&&near(id,'player',8)) {
          if(interruptRoutine(id,'flee',80,state.relations?.applications.findLast(a=>a.actorId===id)?.eventId??null))return
          space.flee(id,space.point('player'),dt);continue
        }
        const escort=escortController.updateNpc(id,dt)
        if(escort==='committed')return
        if(escort==='busy')continue
        const job=opportunityDirector.updateNpc(id,dt)
        if(job==='committed')return
        if(job==='busy')continue
        if(socialController.updateNpc(id))return
        if(state.life) {
          const row=state.life.actors.find(a=>a.actorId===id)
          if(!row.intent||row.interruption||clock>=(routineDue.get(id)??0)) {
            const offset=npcs().findIndex(n=>n.id===id)*97%1000
            routineDue.set(id,Math.floor((clock-offset)/1000)*1000+1000+offset)
            const activity=nextDailyActivity(state,id,clock)
            if(activity.status==='blocked')continue
            if(`${activity.kind}:${activity.placeId}`!==row.activityId||activity.priority!==row.intent?.priority) {send('life',{kind:'activity',actorId:id,activity:activity.kind,placeId:activity.placeId,priority:activity.priority});return}
            if(row.interruption){send('life',{kind:'resume',actorId:id},{safe:true});return}
          }
          if(row.intent?.phase==='travelling'&&space.atPlace(id,row.intent.placeId)) {send('life',{kind:'arrive',actorId:id,intentId:row.intent.id},{present:true,proofId:`routine-${serial+1}`});return}
          if(row.intent)space.routine(id,row.intent,dt,clock)
        } else space.idle(id,dt,clock)
      }
    }
  }
  async function checkpoint(releaseInput=false) {
    if(releaseInput)guardDesired=false
    checkpointDepth++
    try {
    // In-flight commits finish before release and the final clock-only save.
    while(busy)await new Promise(resolve=>setTimeout(resolve,5))
    if(releaseInput&&!stopped) {
      const [first,...rest]=[...recoveryController.stopSteps(),...growthController.stopSteps()]
      if(first)await send(first.domain,first.command,first.context,false,rest)
    }
    const hero=previewGameplayCombat(state,clock).find(f=>f.id==='player')
    if(releaseInput&&alive('player')&&(hero.guardHeld||hero.mustRelease)&&!stopped)await send('combat',{kind:'guard',actorId:'player',held:false})
    const result=await session.checkpoint(clock)
    if(!result.ok){stopped=true;notify(result.code)}
    else {state=result.checkpoint.gameplay;view=previewGameplayCombat(state,clock)}
    return result
    } finally {checkpointDepth--}
  }
  return {update,command,checkpoint,release:()=>{guardDesired=false},
    canAdvance:()=>!busy&&!stopped&&!checkpointDepth,view:()=>view,state:()=>state,clock:()=>clock,
    calendar:()=>clockAt(state.calendar.clockOrigin,clock),tradeStatus,
    standingView:target=>{
      const local=!!target&&STANDING_V1.issuers.some(i=>i.actorId===target)&&contact('player',target)&&alive(target)&&sees(target,'player',true)
      const quote=local?standingQuote(state,target,'player'):null,proof=growthContext()
      return {quote,issuerId:local?target:null,
        records:local?completionRecords(state,'player').filter(r=>!state.social.knowledge.some(k=>k.npcId===target&&k.factId===r.factId&&k.subjectId==='player')):[],
        acknowledgments:copy((state.standing?.acknowledgments??[]).filter(r=>r.holderId==='player')),
        recognized:local&&hasStanding(state,target,'player'),homePlaceId:proof.placeId,atHome:proof.present,mentorHome:proof.mentorPresent,
        canPractice:proof.present&&proof.mentorPresent&&proof.withinRange&&proof.facing&&proof.identified&&proof.dangerFree&&growthSafe(state,'player',clock)&&growthSafe(state,GROWTH_V1.mentorId,clock),
        lease:copy(activeLease(state,'player',clock)),training:copy(trainingFor(state,'player')),resting:!!state.standing?.rests?.some(r=>r.holderId==='player'&&r.active)}
    },
    factionView:target=>({noticePlaceId:noticePlace()?.id??null,
      unreadNotices:!!noticePlace()&&(state.factions?.bounties??[]).some(b=>b.postedEventId&&b.placeId===noticePlace().id&&!(state.factions.bountyKnowledge??[]).some(k=>k.actorId==='player'&&k.bountyId===b.id)),
      bounties:(state.factions?.bountyKnowledge??[]).filter(k=>k.actorId==='player').map(k=>({...copy(k),
        captureEventId:captureForBounty(state,state.factions.bounties.find(b=>b.id===k.bountyId),'player')?.capturedEventId??null})),
      warnings:target&&alive(target)&&contact('player',target)&&sees(target,'player',true)?warningOptions(state,'player',target):[],
      requests:(state.factions?.threatRequests??[]).filter(r=>r.requesterId==='player').map(copy),
      escorts:(state.factions?.escortKnowledge??[]).filter(k=>k.actorId==='player').map(copy),
      escortOffers:target&&alive(target)&&contact('player',target)&&sees(target,'player',true)?(state.factions?.escortKnowledge??[])
        .filter(k=>k.actorId===target&&k.issuerId===target&&k.status==='offered'&&k.courierId!=='player'&&clock<k.deadlineAt)
        .map(k=>({...copy(k),known:!!escortMemory(state,k.escortId,'player')})):[]}),
    caseOptions:officer=>!state.factions?.actionsVersion||!indexed().authorities.has(officer)||!alive(officer)||!contact('player',officer)||!sees(officer,'player',true)?[]:
      state.crime.cases.filter(c=>c.authorityId===officer&&c.subjectId==='player'&&!c.resolved).map(c=>({...caseSettlementQuote(state,officer,'player',c.id),severity:c.severity})),
    conversation:()=>{refreshConversation();return conversation?{...copy(conversation),topics:dialogueTopics(),opportunities:knownOpportunities(state,'player',clock,conversation.speakerId).filter(r=>conversation.opportunityIds.includes(r.id)||r.assigneeId==='player'&&r.status==='accepted'&&[r.issuerId,r.targetActorId].includes(conversation.speakerId))}:null},
    busy:()=>busy||checkpointDepth>0,stopped:()=>stopped,config,
    close:async()=>{await checkpoint(true);return session.close()}}
}
