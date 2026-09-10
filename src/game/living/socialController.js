import { exchangeLimit } from '../gameplay/exchange.js'
import { evidenceDepth,SHAREABLE_ACTIONS } from '../gameplay/knowledgeLineage.js'
import { meetingEligibility } from '../gameplay/meeting.js'
import { relationFor } from '../gameplay/relations.js'
import { distance } from './geometry.js'

export function createSocialController({state,clock,ids,point,contact,face,send,talkingTo}) {
  const due=new Map();let leaveDue=0,previous=null,data=null
  function indexed(world) {
    if(previous===world)return data
    const facts=new Map(world.social.facts.map(f=>[f.id,f])),known=new Map()
    for(const k of world.social.knowledge)if(SHAREABLE_ACTIONS.has(facts.get(k.factId)?.action)&&evidenceDepth(world.social,k.evidenceId)<2) {
      if(!known.has(k.npcId))known.set(k.npcId,[])
      known.get(k.npcId).push(k)
    }
    previous=world;data={facts,known,life:new Map(world.life.actors.map(a=>[a.actorId,a]))};return data
  }
  return {
    closeSeparated() {
      const world=state(),at=clock()
      if(!world.relations?.exchangeVersion||at<leaveDue)return false
      const relay=world.relations.relays.find(r=>r.closedAt===null&&distance(point(r.speakerId),point(r.listenerId))>3)
      if(relay){send('exchange',{kind:'leave',actorId:relay.speakerId,relayId:relay.id},{separated:true,proofId:`parted:${relay.id}:${at}`});return true}
      leaveDue=at+1000;return false
    },
    updateNpc(id) {
      const world=state(),at=clock()
      if(!world.relations?.exchangeVersion||at<(due.get(id)??0)||id===talkingTo())return false
      due.set(id,at+1000)
      const info=indexed(world),personal=info.life.get(id)
      if(!personal?.intent||personal.interruption||personal.intent.priority>10)return false
      for(const other of ids()) {
        if(other===id||other===talkingTo()||!contact(id,other)||info.life.get(other)?.interruption)continue
        const tie=relationFor(world,id,other)
        if(tie.type==='acquaintance'&&tie.trust<=0||tie.fear>=25||exchangeLimit(world,id,other,at))continue
        const known=(info.known.get(id)??[]).filter(k=>!world.relations.relays.some(r=>r.speakerId===id&&r.listenerId===other&&r.sourceEvidenceId===k.evidenceId))
        const concern=k=>{const target=info.facts.get(k.factId).targetId;return target===id||target===other?2:relationFor(world,id,target).type!=='acquaintance'?1:0}
        known.sort((a,b)=>concern(b)-concern(a)||info.facts.get(b.factId).at-info.facts.get(a.factId).at||a.factId.localeCompare(b.factId))
        if(!known.length)continue
        const context={allowed:true,at,withinRange:true,clear:true,facing:true,meetingId:`social:${id}:${other}:${at}`,proofId:`social:${id}:${other}:${at}`}
        if(!meetingEligibility(world,id,other,context).available)continue
        face(id,point(other));face(other,point(id))
        send('exchange',{kind:'share',actorId:id,targetId:other,factId:known[0].factId},context);return true
      }
      return false
    },
  }
}
