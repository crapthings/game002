import { createWorldSession, previewGameplayCombat, wantedFor, pursuitFor, historyCapacity } from '../gameplay/index.js'
import { livingConfig, LIVING_NPCS, PRICES } from './config.js'
import { distance, facingAngle, sweptContact } from './geometry.js'
const copy=v=>structuredClone(v)
const offensive=new Set(['take','threatened','robbed','damaged','parried','died','loot_item','loot_money'])
export function createLivingSimulation({world,legacy=null,saved,save,space,notify=()=>{},effects=()=>{}}) {
  const config=livingConfig(legacy,world),session=createWorldSession(config,{saved,save})
  let state=session.snapshot().gameplay,clock=session.status().simulationAt,busy=false,stopped=false,guardDesired=false
  let remainder=0
  let serial=Math.max(state.revision,...state.journal.map(r=>/^live-\d+$/.test(r.id)?Number(r.id.slice(5)):0)),sweep=new Map(),view=previewGameplayCombat(state,clock)
  for(const f of view)if(f.phase==='active')sweep.set(f.swing.id,(clock-f.swing.activeAt)/180)
  const actor=id=>state.interactions.actors.find(a=>a.id===id)
  const fighter=id=>view.find(a=>a.id===id)
  const alive=id=>actor(id)?.health>0
  const near=(a,b,r=2)=>distance(space.point(a),space.point(b))<=r && Math.abs(space.point(a).y-space.point(b).y)<1.5 && space.clear(space.point(a),space.point(b))
  const sees=(a,b,identify=false)=>alive(a)&&alive(b)&&space.visible(a,b,identify)&&!(identify&&b==='player'&&state.village.masked)
  const observers=(actorId,targetId=null)=>LIVING_NPCS.filter(n=>n.id!==actorId&&(sees(n.id,actorId)||n.id===targetId)).map(n=>({npcId:n.id,identified:sees(n.id,actorId,true),position:copy(space.point(actorId)),proofId:`sight-${serial+1}-${n.id}`}))
  async function send(domain,command,extra={},observe=false) {
    if(busy||stopped)return {ok:false,code:'BUSY'}
    busy=true
    const step={domain,command,context:{at:clock,allowed:true,...extra}}
    if(observe)step.observations=observers(command.actorId,['combat','robbery'].includes(domain)?command.targetId:command.kind==='aid'?'resident-1':null)
    try {
      const result=await session.dispatch({id:`live-${++serial}`,expectedRevision:state.revision,steps:[step]})
      if(result.ok){state=result.state;view=previewGameplayCombat(state,clock);effects(result.events)}
      else {
        notify(result.code)
        if(['SAVE_OUTCOME_UNKNOWN','RECOVERY_REQUIRED','STORAGE_CONFLICT','HISTORY_FULL'].includes(result.code))stopped=true
      }
      return result
    } finally {busy=false}
  }
  function command(kind,data={}) {
    if(kind==='guard'){guardDesired=data.held;return}
    if(busy||stopped)return
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
      const refuses=!state.village.masked&&state.social.knowledge.some(k=>k.npcId==='merchant'&&k.subjectId==='player'&&state.social.facts.some(f=>f.id===k.factId&&f.targetId==='merchant'&&offensive.has(f.action)&&!state.village.settled.includes(f.sourceEventId)))
      if(refuses){notify('陈掌柜认出了冒犯者，拒绝交易；药包纠纷可向捕快交还赔偿。');return}
      const lot=state.interactions.inventory.lots.find(l=>l.id===data.lotId)
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
    if(busy||stopped)return
    remainder+=dt*1000;const elapsed=Math.floor(remainder);remainder-=elapsed;clock+=elapsed;view=previewGameplayCombat(state,clock)
    const hero=fighter('player')
    if(!guardDesired && alive('player') && (hero.guardHeld||hero.mustRelease)) {send('combat',{kind:'guard',actorId:'player',held:false});return}
    if(historyCapacity(state).status!=='available'){guardDesired=false;if(alive('player')&&(hero.guardHeld||hero.mustRelease)){send('combat',{kind:'guard',actorId:'player',held:false});return}stopped=true;notify('本轮账本接近容量上限，已停止新增行动，请保存退出。');session.checkpoint(clock).then(result=>{if(!result.ok)notify(result.code)});return}
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
    sweep=new Map([...sweep].filter(([id])=>view.some(f=>f.swing?.id===id)))
    for(const npc of LIVING_NPCS) {
      const id=npc.id,f=fighter(id)
      if(!alive(id))continue
      const gear=state.interactions.inventory.lots.find(l=>l.ownerId===id&&l.holderId===actor(id).containerId&&config.items.find(i=>i.id===l.itemType)?.equipment)
      if(gear&&f.phase==='idle'){const slot=config.items.find(i=>i.id===gear.itemType).equipment.slot;if(!state.equipment.loadouts.find(l=>l.actorId===id)[slot]){send('equipment',{kind:'equip',actorId:id,slot,lotId:gear.id});return}}
      if(f.guardHeld) {
        const raised=state.combat.events.findLast(e=>e.kind==='guard_started'&&e.actorId===id)
        if(raised&&clock-raised.at>=700){send('combat',{kind:'guard',actorId:id,held:false});return}
      }
      const known=state.social.knowledge.filter(k=>k.npcId===id)
      const crimeKnowledge=known.filter(k=>offensive.has(state.social.facts.find(f=>f.id===k.factId)?.action))
      if(config.authorities.includes(id)) {
        const unassessed=crimeKnowledge.find(k=>!state.crime.events.some(e=>e.authorityId===id&&e.factId===k.factId&&e.evidenceId===k.evidenceId)&&
          !state.village.settled.includes(state.social.facts.find(f=>f.id===k.factId).sourceEventId)&&
          !state.combat.events.some(e=>e.id===state.social.facts.find(f=>f.id===k.factId).sourceEventId&&e.justification?.unlawful===false))
        if(unassessed){send('crime',{kind:'assess',actorId:id,factId:unassessed.factId});return}
        const wanted=wantedFor(state.crime,id,'player'),track=state.pursuit.tracks.find(t=>t.authorityId===id&&t.subjectId==='player')
        // Reinforcement is another existing guard; it learns via a delivered report.
        if(wanted.level>=3&&id==='guard'&&alive('guard-2')) {
          const unsent=crimeKnowledge.find(k=>!state.social.knowledge.some(q=>q.npcId==='guard-2'&&q.factId===k.factId))
          if(unsent){if(near(id,'guard-2')){send('knowledge',{kind:'report',actorId:id,targetId:'guard-2',factId:unsent.factId},{delivered:true,proofId:`reinforce-${serial+1}`});return}space.move(id,space.point('guard-2'),dt,1.3);continue}
        }
        if(wanted.level>0&&alive('player')) {
          if(sees(id,'player',true)&&(!track||clock-track.seenAt>=500)) {send('pursuit',{kind:'sight',actorId:id,targetId:'player'},{visible:true,identified:true,position:copy(space.point('player')),proofId:`track-${serial+1}`});return}
          if(!sees(id,'player',true)&&track?.lostAt===null){send('pursuit',{kind:'lost',actorId:id,targetId:'player'},{visible:false,proofId:`lost-${serial+1}`});return}
          const pursuit=pursuitFor(state,id,'player',clock)
          if(pursuit.destination) {
            if(pursuit.mayEngage&&near(id,'player',1.65)) {space.face(id,space.point('player')); if(f.phase==='idle'){send('combat',hero.phase==='windup'&&f.stamina>=25000&&!f.mustRelease?{kind:'guard',actorId:id,held:true}:{kind:'attack',actorId:id});return}}
            else if(f.phase==='idle')space.move(id,pursuit.destination,dt,1.2)
            continue
          }
          // Reports provide a fixed last-seen point, never a live player lookup.
          const memory=crimeKnowledge.map(k=>state.social.events.find(e=>e.id===k.evidenceId)).findLast(e=>e?.position)
          if(!track&&memory&&clock-memory.at<30000&&f.phase==='idle'){space.move(id,memory.position,dt,1.1);continue}
        }
      } else {
        const threat=state.robbery.events.findLast(e=>e.kind==='threatened'&&e.targetId===id&&clock-e.at<30000)
        const attack=state.combat.events.findLast(e=>['damaged','parried'].includes(e.kind)&&e.targetId===id&&clock-e.at<10000)
        const recognized=event=>event&&known.some(k=>k.subjectId==='player'&&state.social.facts.find(f=>f.id===k.factId)?.sourceEventId===event.id)
        const fight=recognized(threat)&&threat.reaction==='fight'||recognized(attack)&&actor(id).courage>=70
        if(fight&&alive('player')&&sees(id,'player',true)) {
          space.face(id,space.point('player'))
          if(near(id,'player',1.65)&&f.phase==='idle'){send('combat',hero.phase==='windup'&&f.stamina>=25000&&!f.mustRelease?{kind:'guard',actorId:id,held:true}:{kind:'attack',actorId:id});return}
          if(f.phase==='idle')space.move(id,space.point('player'),dt,1.2)
          continue
        }
        const pending=crimeKnowledge.find(k=>!state.social.events.some(e=>e.kind==='report'&&e.actorId===id&&e.targetId==='guard'&&e.cause===k.evidenceId))
        if(pending&&alive('guard')) {
          if(near(id,'guard')){send('knowledge',{kind:'report',actorId:id,targetId:'guard',factId:pending.factId},{delivered:true,proofId:`report-${serial+1}`});return}
          if(f.phase==='idle')space.move(id,space.point('guard'),dt,1.3)
          continue
        }
        if((threat?.reaction==='flee'||attack)&&f.phase==='idle'){const source=known.map(k=>state.social.events.find(e=>e.id===k.evidenceId)).findLast(e=>e?.position);if(source)space.flee(id,source.position,dt);continue}
      }
      const parcel=state.interactions.inventory.lots.find(l=>l.id==='medicine-parcel')
      if(id==='guard'&&parcel.holderId==='guard-bag') {
        if(near(id,'stall')){send('village',{kind:'return',actorId:id});return}
        if(f.phase==='idle')space.move(id,space.point('stall'),dt,1.1)
        continue
      }
      const aid=state.village.aid
      if(id==='resident-1'&&aid.subject==='player'&&!aid.rewardEvent&&aid.eventId&&clock>=aid.dueAt&&alive('player')&&sees(id,'player',true)) {
        if(near(id,'player')){send('village',{kind:'reward',actorId:id},{identified:true});return}
        if(f.phase==='idle')space.move(id,space.point('player'),dt,1.2)
        continue
      }
      if(f.phase==='idle')space.idle(id,dt,clock)
    }
  }
  async function checkpoint(releaseInput=false) {
    if(releaseInput)guardDesired=false
    // In-flight commits finish before release and the final clock-only save.
    while(busy)await new Promise(resolve=>setTimeout(resolve,5))
    const hero=previewGameplayCombat(state,clock).find(f=>f.id==='player')
    if(releaseInput&&alive('player')&&(hero.guardHeld||hero.mustRelease)&&!stopped)await send('combat',{kind:'guard',actorId:'player',held:false})
    const result=await session.checkpoint(clock)
    if(!result.ok){stopped=true;notify(result.code)}
    return result
  }
  return {update,command,checkpoint,release:()=>{guardDesired=false},
    canAdvance:()=>!busy&&!stopped,view:()=>view,state:()=>state,clock:()=>clock,
    busy:()=>busy,stopped:()=>stopped,config,
    close:async()=>{await checkpoint(true);return session.close()}}
}
