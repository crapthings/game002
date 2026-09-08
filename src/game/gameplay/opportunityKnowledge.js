/** A remembered version of a request, never the distant live contract row. */
const cache=new WeakMap()
const stageRank={offer:0,deliver:1,return:2,payment:3,ended:4}
function mergeProgress(current,incoming) {
  if(current.status==='declined')return current
  if(['fulfilled','failed','cancelled','expired'].includes(current.status)&&['offered','accepted'].includes(incoming.status))return current
  if(current.assigneeId===incoming.assigneeId&&current.status==='accepted'&&incoming.status==='accepted'&&stageRank[current.stage]>stageRank[incoming.stage])
    return {...incoming,stage:current.stage,reason:current.reason}
  return incoming
}
function indexed(world) {
  const prior=cache.get(world)
  if(prior&&prior.social===world.social&&prior.eventCount===(world.opportunities?.events.length??0))return prior
  const events=new Map(),sources=new Map(world.social.facts.map(f=>[f.id,f.sourceEventId]))
  for(const e of world.opportunities?.events??[]) {
    if(!events.has(e.opportunityId))events.set(e.opportunityId,[])
    events.get(e.opportunityId).push(e)
  }
  const knownSources=new Map()
  for(const k of world.social.knowledge) {
    if(!knownSources.has(k.npcId))knownSources.set(k.npcId,new Set())
    knownSources.get(k.npcId).add(sources.get(k.factId))
  }
  const result={events,knownSources,social:world.social,eventCount:world.opportunities?.events.length??0};cache.set(world,result);return result
}
export function personalOpportunity(world,row,viewerId,at) {
  if(!row.knownBy.includes(viewerId))return null
  const data=indexed(world)
  let known={status:'offered',assigneeId:null,stage:'offer',amount:null,reason:null,evidenceId:row.offeredEventId}
  for(const e of data.events.get(row.id)??[]) {
    const involved=e.actorId===viewerId||e.targetId===viewerId
    let change=null
    if(e.kind==='opportunity_disclosed'&&e.targetId===viewerId)change={evidenceId:e.id}
    if(e.kind==='opportunity_accepted'&&involved)change={status:'accepted',assigneeId:e.actorId,amount:e.amount,stage:'deliver',reason:null}
    if(e.kind==='opportunity_declined'&&e.actorId===viewerId)change={status:'declined',stage:'ended',reason:'DECLINED'}
    if(e.kind==='message_acknowledged'&&involved)change={stage:'return'}
    if(e.kind==='opportunity_payment_due'&&involved)change={stage:'payment',reason:'AWAITING_PAYMENT'}
    if(e.kind==='opportunity_fulfilled'&&involved)change={status:'fulfilled',stage:'ended',amount:e.amount,reason:null}
    if(e.kind==='opportunity_cancelled'&&e.actorId===viewerId)change={status:'cancelled',stage:'ended',reason:e.reason}
    if(e.kind==='opportunity_failed'&&data.knownSources.get(viewerId)?.has(e.cause))change={status:'failed',stage:'ended',reason:e.reason}
    if(e.kind==='opportunity_outcome_learned'&&e.actorId===viewerId)change={status:e.reason==='DEADLINE_PASSED'?'expired':'failed',stage:'ended',reason:e.reason}
    if(e.kind==='opportunity_status_told'&&e.targetId===viewerId&&known.status!=='declined') {
      change=mergeProgress(known,e.knownState)
    }
    if(change)known={...known,...change,evidenceId:e.id}
  }
  if(['offered','accepted'].includes(known.status)&&known.stage!=='payment'&&at>=row.deadlineAt)
    known={...known,status:'expired',stage:'ended',reason:'DEADLINE_PASSED'}
  return known
}
export function sameKnownProgress(a,b) {
  if(!a||!b)return false
  const merged=mergeProgress(b,a)
  return ['status','assigneeId','stage','amount','reason'].every(key=>merged[key]===b[key])
}
