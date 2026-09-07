import { createGameplay, executeGameplay, prepareGameplayRequest } from './index.js'

// Configuration only: actor IDs must map to A's persistent NPC IDs. No meshes,
// coordinates, faction territories or world objects are instantiated here.
export function exampleWorldConfig() {
  return {
    id:'example-world-v1',
    items:[{id:'medicine',name:'止血药',consumable:true,healing:25}],
    containers:[{id:'visitor-bag',capacity:6},{id:'vendor-stock',capacity:null},{id:'neighbor-bag',capacity:6}],
    lots:[{id:'stock-1',itemType:'medicine',quantity:4,ownerId:'vendor',holderId:'vendor-stock'}],
    actors:[
      {id:'visitor',containerId:'visitor-bag',wallet:100,health:60,maxHealth:100},
      {id:'vendor',containerId:'vendor-stock',wallet:60,health:100,maxHealth:100},
      {id:'neighbor',containerId:'neighbor-bag',wallet:40,health:60,maxHealth:100},
    ],
  }
}

export function openExample() { return createGameplay(exampleWorldConfig()) }

// Session integration: retain prepared.request until dispatch has a confirmed
// outcome. On SAVE_OUTCOME_UNKNOWN reopen from storage, then dispatch that same
// request. Do not call this builder again to retry an uncertain operation.
export function preparePurchaseExample(session,catalog,requestId,policy) {
  return prepareGameplayRequest(session.snapshot(),catalog,{
    id:requestId,
    steps:[{domain:'interaction',command:{kind:'buy',actorId:'visitor',targetId:'vendor',lotId:'stock-1',quantity:1},context:policy}],
  })
}

// The caller computes policy from current world state, with at/allowed/unitPrice.
// Forward only result.events from a successful commit; a retry emits none.
export function buyExample(state,catalog,requestId,policy) {
  return executeGameplay(state,catalog,{
    id:requestId,expectedRevision:state.revision,
    steps:[{domain:'interaction',command:{kind:'buy',actorId:'visitor',targetId:'vendor',lotId:'stock-1',quantity:1},context:policy}],
  })
}

// giftPolicy supplies at/allowed (recipient consent + physical interaction).
// observationPolicy supplies at/allowed/observed/observedAt/identified/proofId.
// trustPolicy supplies at/allowed/trustDelta/ruleId. Use this batch only when
// identification is confirmed; anonymous gifts omit the relationship step.
export function recognizedGiftExample(state,catalog,requestId,lotId,giftPolicy,observationPolicy,trustPolicy) {
  const factId = `fact:interaction:${state.interactions.revision+1}`
  return executeGameplay(state,catalog,{
    id:requestId,expectedRevision:state.revision,
    steps:[
      {domain:'interaction',command:{kind:'gift',actorId:'visitor',targetId:'neighbor',lotId,quantity:1},context:giftPolicy},
      {domain:'knowledge',command:{kind:'witness',actorId:'neighbor',factId},context:observationPolicy},
      {domain:'knowledge',command:{kind:'relationship',actorId:'neighbor',targetId:'visitor',factId},context:trustPolicy},
    ],
  })
}
