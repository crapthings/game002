import { createGameplay, createWorldSession, migrateWorldToV2, previewGameplayCombat, pursuitFor } from '../gameplay/index.js'
import { createLivingStateIndex } from './createLivingStateIndex.js'
import { livingConfig, LIVING_NPCS, PRICES } from './config.js'
import { distance, facingAngle, sweptContact } from './geometry.js'
import { createClockOrigin, clockAt } from './clock.js'
import { sceneActorDefinitions } from './actorRegistry.js'
import { nextDailyActivity } from './dailySchedule.js'
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
  const session=createWorldSession(config,{saved:checkpoint,save})
  let state=session.snapshot().gameplay,clock=session.status().simulationAt,busy=false,stopped=false,guardDesired=false,checkpointDepth=0
  const stateIndex=createLivingStateIndex(config),indexed=()=>stateIndex(state)
  let npcState=null,npcCache=LIVING_NPCS
  const npcs=()=>{if(npcState!==state){npcState=state;npcCache=sceneActorDefinitions(state)}return npcCache}
  let remainder=0
  const priorRequests=[...(state.archive?.legacyCheckpoint.gameplay.journal??[]),...state.journal]
  let serial=Math.max(state.revision,...priorRequests.map(r=>/^live-\d+$/.test(r.id)?Number(r.id.slice(5)):0)),sweep=new Map(),view=previewGameplayCombat(state,clock)
  for(const f of view)if(f.phase==='active')sweep.set(f.swing.id,(clock-f.swing.activeAt)/180)
  const actor=id=>indexed().actors.get(id)
  const routineDue=new Map()
  const fighter=id=>view.find(a=>a.id===id)
  const alive=id=>actor(id)?.health>0
  const near=(a,b,r=2)=>distance(space.point(a),space.point(b))<=r && Math.abs(space.point(a).y-space.point(b).y)<1.5 && (space.contactClear??space.clear)(space.point(a),space.point(b))
  const sees=(a,b,identify=false)=>alive(a)&&alive(b)&&space.visible(a,b,identify)&&!(identify&&b==='player'&&state.village.masked)
  const observers=(actorId,targetId=null)=>npcs().filter(n=>n.id!==actorId&&(sees(n.id,actorId)||n.id===targetId)).map(n=>({npcId:n.id,identified:sees(n.id,actorId,true),position:copy(space.point(actorId)),proofId:`sight-${serial+1}-${n.id}`}))
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
  function command(kind,data={}) {
    if(kind==='guard'){guardDesired=data.held;return}
    if(busy||stopped||checkpointDepth)return
    const target=data.targetId
    if(!alive('player'))return
    if(kind==='attack')return send('combat',{kind:'attack',actorId:'player'})
    if(kind==='mask')return send('village',{kind:'mask',actorId:'player'})
    if(kind==='use')return send('interaction',{kind:'use',actorId:'player',targetId:'player',lotId:data.lotId,quantity:1})
    if(kind==='equip'||kind==='unequip')return send('equipment',{kind,actorId:'player',slot:data.slot,...(kind==='equip'?{lotId:data.lotId}:{})})
    if(kind==='take'&&near('player','stall'))return send('village',{kind:'take',actorId:'player'},{},true)
    if(kind==='settle'&&near('player','guard'))return send('village',{kind:'settle',actorId:'player'})
    if(kind==='aid'&&near('player','resident-1')){space.face('resident-1',space.point('player'));return send('village',{kind:'aid',actorId:'player',lotId:data.lotId},{identified:sees('resident-1','player',true)},true)}
    if(['buy','sell'].includes(kind)&&alive('merchant')&&near('player','merchant')) {
      const refuses=!state.village.masked&&indexed().merchantRefuses
      if(refuses){notify('陈掌柜认出了冒犯者，拒绝交易；药包纠纷可向捕快交还赔偿。');return}
      const lot=indexed().lots.get(data.lotId)
      if(lot&&PRICES[lot.itemType])return send('interaction',{kind,actorId:'player',targetId:'merchant',lotId:lot.id,quantity:1},{unitPrice:PRICES[lot.itemType][kind==='buy'?0:1]})
    }
    if(target&&near('player',target)) {
      if(kind==='threaten')return send('robbery',{kind,actorId:'player',targetId:target,amount:20},
        {reachable:true,proofId:`threat-${serial+1}`,guardNearby:config.authorities.some(g=>g!==target&&sees(target,g)&&near(target,g,10)),escapeRoute:space.canEscape(target,'player')},true)
      if(kind==='loot_item'||kind==='loot_money')return send('property',{kind,actorId:'player',targetId:target,...(kind==='loot_item'?{lotId:data.lotId,quantity:1}:{amount:actor(target).wallet})},{reachable:true,proofId:`loot-${serial+1}`},true)
    }
    notify('请靠近目标，保持视线无遮挡。')
  }
  // Priorities: release, active hits, evidence delivery/assessment, NPC goals.
  function update(dt) {
    if(busy||stopped||checkpointDepth)return
    remainder+=dt*1000;const elapsed=Math.floor(remainder);remainder-=elapsed;clock+=elapsed;view=previewGameplayCombat(state,clock)
    const hero=fighter('player')
    const index=indexed()
    if(!guardDesired && alive('player') && (hero.guardHeld||hero.mustRelease)) {send('combat',{kind:'guard',actorId:'player',held:false});return}
    if(index.capacityStatus!=='available'){guardDesired=false;if(alive('player')&&(hero.guardHeld||hero.mustRelease)){send('combat',{kind:'guard',actorId:'player',held:false});return}stopped=true;notify('本轮账本接近容量上限，已停止新增行动，请保存退出。');session.checkpoint(clock).then(result=>{if(!result.ok)notify(result.code)});return}
    if(!state.places&&space.placeSetup){send('places',{kind:'register',actorId:'player',...space.placeSetup()},{geometryConfirmed:true});return}
    if(state.places&&!state.life) {
      const setup=space.lifeSetup?.()
      if(setup){send('places',{kind:'extend',actorId:'player',...setup},{geometryConfirmed:true},false,[{domain:'life',command:{kind:'initialize',actorId:'player'}}]);return}
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
      if(config.authorities.includes(id)) {
        const unassessed=knowledge.unassessed
        if(unassessed){send('crime',{kind:'assess',actorId:id,factId:unassessed.factId});return}
        const wanted=knowledge.wanted,track=state.pursuit.tracks.find(t=>t.authorityId===id&&t.subjectId==='player')
        // Reinforcement is another existing guard; it learns via a delivered report.
        if(wanted.level>=3&&id==='guard'&&alive('guard-2')) {
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
        if(pending&&alive('guard')) {
          if(interruptRoutine(id,'report',70,pending.evidenceId))return
          if(near(id,'guard')){send('knowledge',{kind:'report',actorId:id,targetId:'guard',factId:pending.factId},{delivered:true,proofId:`report-${serial+1}`});return}
          if(f.phase==='idle')space.move(id,space.point('guard'),dt,1.3)
          continue
        }
        if((threat?.reaction==='flee'||attack)&&f.phase==='idle'){if(interruptRoutine(id,'flee',80,attack?.id??threat?.id??null))return;const source=knowledge.lastKnownPosition;if(source)space.flee(id,source.position,dt);continue}
      }
      const parcel=index.lots.get('medicine-parcel')
      if(id==='merchant'&&space.relocationPending?.()&&['stall','merchant-bag'].includes(parcel.holderId)) {
        if(interruptRoutine(id,'delivery',70))return
        const carrying=parcel.holderId==='merchant-bag',destination=carrying?'relocation':'stall'
        if(near(id,destination)) {send('village',{kind:carrying?'relocate_deliver':'relocate_pickup',actorId:id},
          {reachable:true,position:copy(space.point(destination)),proofId:`relocate-${serial+1}`});return}
        if(f.phase==='idle')space.move(id,space.point(destination),dt,1.1)
        continue
      }
      if(id==='guard'&&parcel.holderId==='guard-bag') {
        if(interruptRoutine(id,'delivery',70,state.village.events.findLast(e=>e.kind==='settle')?.id??null))return
        if(near(id,'stall')){send('village',{kind:'return',actorId:id});return}
        if(f.phase==='idle')space.move(id,space.point('stall'),dt,1.1)
        continue
      }
      const aid=state.village.aid
      if(id==='resident-1'&&aid.subject==='player'&&!aid.rewardEvent&&aid.eventId&&clock>=aid.dueAt&&alive('player')&&sees(id,'player',true)) {
        if(interruptRoutine(id,'reward',60,aid.eventId))return
        if(near(id,'player')){send('village',{kind:'reward',actorId:id},{identified:true});return}
        if(f.phase==='idle')space.move(id,space.point('player'),dt,1.2)
        continue
      }
      if(f.phase==='idle') {
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
    const hero=previewGameplayCombat(state,clock).find(f=>f.id==='player')
    if(releaseInput&&alive('player')&&(hero.guardHeld||hero.mustRelease)&&!stopped)await send('combat',{kind:'guard',actorId:'player',held:false})
    const result=await session.checkpoint(clock)
    if(!result.ok){stopped=true;notify(result.code)}
    return result
    } finally {checkpointDepth--}
  }
  return {update,command,checkpoint,release:()=>{guardDesired=false},
    canAdvance:()=>!busy&&!stopped&&!checkpointDepth,view:()=>view,state:()=>state,clock:()=>clock,
    calendar:()=>clockAt(state.calendar.clockOrigin,clock),
    busy:()=>busy||checkpointDepth>0,stopped:()=>stopped,config,
    close:async()=>{await checkpoint(true);return session.close()}}
}
