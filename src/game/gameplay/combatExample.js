import { createGameplay, prepareGameplayRequest } from './index.js'

// Configuration/call examples only; no automatic execution, scene or storage.
export function openCombatExample() {
  return createGameplay({
    id:'combat-example-v1',combat:true,authorities:['guard'],
    items:[{id:'medicine',name:'止血药',consumable:true,healing:25},
      {id:'sword',name:'铁剑',equipment:{slot:'weapon',attack:8}},
      {id:'vest',name:'布甲',equipment:{slot:'armor',defense:3}}],
    containers:[{id:'player-bag',capacity:6},{id:'bandit-bag',capacity:6},
      {id:'witness-bag',capacity:6},{id:'guard-bag',capacity:6}],
    lots:[{id:'medicine-1',itemType:'medicine',ownerId:'player',holderId:'player-bag',quantity:2},
      {id:'sword-1',itemType:'sword',ownerId:'player',holderId:'player-bag',quantity:1},
      {id:'vest-1',itemType:'vest',ownerId:'bandit',holderId:'bandit-bag',quantity:1}],
    actors:[
      {id:'player',containerId:'player-bag',wallet:100,health:100,maxHealth:100,attack:20,defense:2},
      {id:'bandit',containerId:'bandit-bag',wallet:30,health:80,maxHealth:80,attack:18,defense:1},
      {id:'witness',containerId:'witness-bag',wallet:10,health:60,maxHealth:60,attack:5,defense:0,courage:20},
      {id:'guard',containerId:'guard-bag',wallet:40,health:100,maxHealth:100,attack:20,defense:3,courage:90},
    ],
  })
}

export function prepareAttackExample(state,catalog,id,actorId,policy) {
  return prepareGameplayRequest(state,catalog,{id,steps:[{
    domain:'combat',command:{kind:'attack',actorId},context:policy,
  }]})
}

export function prepareEquipExample(state,catalog,id,actorId,slot,lotId,policy) {
  return prepareGameplayRequest(state,catalog,{id,steps:[{
    domain:'equipment',command:{kind:'equip',actorId,slot,lotId},context:policy,
  }]})
}

export function prepareThreatExample(state,catalog,id,actorId,targetId,amount,evidence) {
  return prepareGameplayRequest(state,catalog,{id,steps:[{
    domain:'robbery',command:{kind:'threaten',actorId,targetId,amount},context:evidence,
  }]})
}

// Separate steps on purpose: a witness can be killed before reaching a guard.
// factId comes from a committed fact event, never a predicted counter in UI.
export function prepareWitnessExample(state,catalog,id,actorId,factId,evidence) {
  return prepareGameplayRequest(state,catalog,{id,steps:[{
    domain:'knowledge',command:{kind:'witness',actorId,factId},context:evidence,
  }]})
}

export function prepareReportExample(state,catalog,id,actorId,targetId,factId,evidence) {
  return prepareGameplayRequest(state,catalog,{id,steps:[{
    domain:'knowledge',command:{kind:'report',actorId,targetId,factId},context:evidence,
  }]})
}

export function prepareCaseExample(state,catalog,id,actorId,factId,policy) {
  return prepareGameplayRequest(state,catalog,{id,steps:[{
    domain:'crime',command:{kind:'assess',actorId,factId},context:policy,
  }]})
}

// Read swingId from the committed attack_started event, not an animation ID.
export function prepareHitExample(state,catalog,id,actorId,targetId,swingId,evidence) {
  return prepareGameplayRequest(state,catalog,{id,steps:[{
    domain:'combat',command:{kind:'hit',actorId,targetId,swingId},context:evidence,
  }]})
}

// Call after an actual committed death. Both pickups commit together or neither
// does (e.g. a full bag must not silently take the coins from this batch).
export function prepareLootExample(state,catalog,id,actorId,targetId,lotId,amount,evidence) {
  return prepareGameplayRequest(state,catalog,{id,steps:[
    {domain:'property',command:{kind:'loot_item',actorId,targetId,lotId,quantity:1},context:evidence},
    {domain:'property',command:{kind:'loot_money',actorId,targetId,amount},context:evidence},
  ]})
}
