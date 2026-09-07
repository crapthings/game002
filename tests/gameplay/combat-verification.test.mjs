// User authorized this new combat/crime module test run on 2026-09-07.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createGameplay, executeGameplay, restoreGameplay, previewGameplayCombat,
  wantedFor, pursuitFor, createWorldSession, restoreWorldCheckpoint } from
  '../../src/game/gameplay/index.js'

function config() {
  return {id:'verification-v1',combat:true,authorities:['guard'],
    items:[{id:'medicine',name:'药',consumable:true,healing:25},
      {id:'sword',name:'剑',equipment:{slot:'weapon',attack:8}},
      {id:'vest',name:'甲',equipment:{slot:'armor',defense:3}}],
    containers:['hero','victim','witness','guard'].map(id => ({id:`${id}-bag`,capacity:3})),
    lots:[{id:'med',itemType:'medicine',quantity:2,ownerId:'hero',holderId:'hero-bag'},
      {id:'sword',itemType:'sword',quantity:1,ownerId:'hero',holderId:'hero-bag'},
      {id:'vest',itemType:'vest',quantity:1,ownerId:'victim',holderId:'victim-bag'}],
    actors:['hero','victim','witness','guard'].map(id => ({id,containerId:`${id}-bag`,
      wallet:30,health:id === 'victim' ? 20 : 100,maxHealth:100,attack:20,defense:0,courage:0}))}
}
function harness(c = config()) {
  const initial = createGameplay(c)
  let state = initial.state, serial = 0
  const make = (domain,command,at,context = {}) => ({id:`req-${++serial}`,expectedRevision:state.revision,
    steps:[{domain,command,context:{allowed:true,at,...context}}]})
  const run = request => {
    const before = structuredClone(state)
    const result = executeGameplay(state,initial.catalog,request)
    assert.deepEqual(state,before,'reducer mutated its input')
    if (result.ok) state = result.state
    return result
  }
  const apply = (domain,command,at,context) => {
    const result = run(make(domain,command,at,context))
    assert.equal(result.ok,true,result.code)
    return result
  }
  return {c,catalog:initial.catalog,make,run,apply,get state() { return state }}
}
function strike(h,attacker,target,start = 0) {
  const swingId = h.apply('combat',{kind:'attack',actorId:attacker},start).events.find(e => e.kind === 'attack_started').swingId
  return h.apply('combat',{kind:'hit',actorId:attacker,targetId:target,swingId},start+250,
    {contact:true,clear:true,angleDegrees:0,proofId:`contact-${start}`})
}

test('front guard spends time and impact stamina; one swing cannot hit twice',() => {
  const h = harness()
  h.apply('combat',{kind:'guard',actorId:'hero',held:true},0)
  const attack = h.apply('combat',{kind:'attack',actorId:'victim'},0)
  const swingId = attack.events.find(e => e.kind === 'attack_started').swingId
  const command = {kind:'hit',actorId:'victim',targetId:'hero',swingId}
  h.apply('combat',command,250,{contact:true,clear:true,angleDegrees:0,proofId:'hit'})
  assert.equal(h.state.interactions.actors.find(a => a.id === 'hero').health,100)
  assert.equal(previewGameplayCombat(h.state,250).find(a => a.id === 'hero').stamina,73000)
  assert.equal(h.run(h.make('combat',command,251,{contact:true,clear:true,angleDegrees:0,proofId:'again'})).code,'ALREADY_HIT')
  h.apply('combat',{kind:'guard',actorId:'hero',held:false},250)
  assert.equal(previewGameplayCombat(h.state,850).find(a => a.id === 'hero').stamina,73000)
  assert.equal(previewGameplayCombat(h.state,1350).find(a => a.id === 'hero').stamina,88000)
})

test('insufficient stamina breaks guard; rear attacks bypass it',() => {
  const h = harness()
  h.apply('combat',{kind:'guard',actorId:'hero',held:true},0)
  const result = strike(h,'victim','hero',9500)
  assert.ok(result.events.some(e => e.kind === 'guard_broken'))
  assert.equal(h.state.interactions.actors.find(a => a.id === 'hero').health,80)
  assert.equal(previewGameplayCombat(h.state,9750).find(a => a.id === 'hero').phase,'broken')
  const b = harness()
  b.apply('combat',{kind:'guard',actorId:'hero',held:true},0)
  const swingId = b.apply('combat',{kind:'attack',actorId:'victim'},0).events.find(e => e.kind === 'attack_started').swingId
  b.apply('combat',{kind:'hit',actorId:'victim',targetId:'hero',swingId},250,
    {contact:true,clear:true,angleDegrees:180,proofId:'rear'})
  assert.equal(b.state.interactions.actors.find(a => a.id === 'hero').health,80)
})

test('death blocks healing and failed corpse batch cannot take money',() => {
  const h = harness()
  const result = strike(h,'hero','victim')
  assert.ok(result.events.some(e => e.kind === 'died'))
  const before = structuredClone(h.state)
  const req = h.make('property',{kind:'loot_money',actorId:'hero',targetId:'victim',amount:10},300,
    {reachable:true,proofId:'corpse'})
  req.steps.push({domain:'property',command:{kind:'loot_item',actorId:'hero',targetId:'victim',lotId:'vest',quantity:1},
    context:{at:300,allowed:true,reachable:true,proofId:'corpse'}})
  assert.equal(h.run(req).code,'BAG_FULL')
  assert.deepEqual(h.state,before)
  assert.equal(h.run(h.make('interaction',{kind:'use',actorId:'victim',targetId:'victim',lotId:'med',quantity:1},300)).code,'ACTOR_DEAD')
})

test('equipment changes damage once and cannot be sold while equipped',() => {
  const h = harness()
  h.apply('equipment',{kind:'equip',actorId:'hero',slot:'weapon',lotId:'sword'},0)
  assert.equal(h.state.combat.fighters.find(a => a.id === 'hero').attack,28)
  assert.equal(h.run(h.make('interaction',{kind:'sell',actorId:'hero',targetId:'guard',lotId:'sword',quantity:1},0,{unitPrice:5})).code,'ITEM_EQUIPPED')
  h.apply('equipment',{kind:'unequip',actorId:'hero',slot:'weapon'},0)
  assert.equal(h.state.combat.fighters.find(a => a.id === 'hero').attack,20)
})

test('coerced money is conserved, claimed, and cannot be collected twice by retry',() => {
  const h = harness()
  const request = h.make('robbery',{kind:'threaten',actorId:'hero',targetId:'victim',amount:10},0,
    {reachable:true,guardNearby:false,escapeRoute:false,proofId:'threat'})
  assert.equal(h.run(request).ok,true)
  assert.equal(h.state.interactions.actors.find(a => a.id === 'hero').wallet,40)
  assert.equal(h.state.interactions.actors.find(a => a.id === 'victim').wallet,20)
  assert.equal(h.state.property.moneyClaims[0].amount,10)
  assert.equal(h.run(request).code,'ALREADY_APPLIED')
  assert.equal(h.state.property.moneyClaims.length,1)
  assert.equal(h.run(h.make('robbery',{kind:'threaten',actorId:'hero',targetId:'victim',amount:10},1,
    {reachable:true,guardNearby:false,escapeRoute:false,proofId:'again'})).code,'THREAT_COOLDOWN')
})

test('successful looting preserves owner and dead witnesses cannot report',() => {
  const c = config(); c.containers.find(a => a.id === 'hero-bag').capacity = 6
  const h = harness(c)
  strike(h,'hero','victim')
  h.apply('property',{kind:'loot_item',actorId:'hero',targetId:'victim',lotId:'vest',quantity:1},300,
    {reachable:true,proofId:'loot'})
  assert.deepEqual(h.state.interactions.inventory.lots.find(l => l.id === 'vest'),
    {id:'vest',itemType:'vest',quantity:1,ownerId:'victim',holderId:'hero-bag'})
  const factId = h.state.social.facts.find(f => f.action === 'loot_item').id
  assert.equal(h.run(h.make('knowledge',{kind:'report',actorId:'victim',targetId:'guard',factId},300,
    {delivered:true,proofId:'ghost'})).code,'ACTOR_DEAD')
})

test('anonymous report has no named warrant; named death evidence permits bounded pursuit',() => {
  for (const identified of [false,true]) {
    const h = harness()
    const result = strike(h,'hero','victim')
    const factId = result.events.find(e => e.kind === 'fact' && e.fact.action === 'died').fact.id
    h.apply('knowledge',{kind:'witness',actorId:'witness',factId},250,
      {observed:true,observedAt:250,identified,proofId:'observation'})
    h.apply('knowledge',{kind:'report',actorId:'witness',targetId:'guard',factId},1000,
      {delivered:true,proofId:'delivery'})
    h.apply('crime',{kind:'assess',actorId:'guard',factId},1000)
    assert.equal(wantedFor(h.state.crime,'guard','hero').level,identified ? 3 : 0)
    if (identified) {
      h.apply('pursuit',{kind:'sight',actorId:'guard',targetId:'hero'},1000,
        {visible:true,identified:true,position:{x:1,y:0,z:2},proofId:'sight'})
      assert.equal(pursuitFor(h.state,'guard','hero',1500).mode,'follow')
      assert.equal(pursuitFor(h.state,'guard','hero',2000).mode,'search')
      assert.equal(pursuitFor(h.state,'guard','hero',32000).destination,null)
    }
    const restored = restoreGameplay(h.c,h.state)
    assert.equal(restored.ok,true,restored.code)
    assert.deepEqual(restored.state,h.state)
    assert.deepEqual(restored.events,[])
  }
})

test('clock-only saves preserve request idempotency and uncertain writes stop the session',async () => {
  const c = config()
  let saved
  const session = createWorldSession(c,{save:async candidate => {
    saved = structuredClone(candidate)
    return {status:'committed',sequence:candidate.sequence}
  }})
  const request = {id:'guard-1',expectedRevision:0,steps:[{domain:'combat',command:{kind:'guard',actorId:'hero',held:true},context:{allowed:true,at:0}}]}
  assert.equal((await session.dispatch(request)).ok,true)
  assert.equal((await session.checkpoint(12500)).ok,true)
  assert.equal(saved.gameplay.journal.length,1)
  assert.equal(saved.simulationAt,12500)
  const restored = restoreWorldCheckpoint(c,saved)
  assert.equal(restored.ok,true,restored.code)
  assert.equal(previewGameplayCombat(restored.checkpoint.gameplay,12500).find(a => a.id === 'hero').stamina,0)
  assert.equal((await session.dispatch(request)).code,'ALREADY_APPLIED')
  const uncertain = createWorldSession(c,{save:async () => { throw new Error('lost acknowledgement') }})
  assert.equal((await uncertain.dispatch(request)).code,'SAVE_OUTCOME_UNKNOWN')
  assert.equal((await uncertain.dispatch(request)).code,'RECOVERY_REQUIRED')
  await uncertain.close(); await session.close()
})

test('exact guard cost blocks once and requires release plus 25 stamina to rearm',() => {
  const h = harness()
  h.apply('combat',{kind:'guard',actorId:'hero',held:true},0)
  const result = strike(h,'victim','hero',9125)
  assert.ok(result.events.some(e => e.kind === 'parried'))
  assert.equal(h.state.interactions.actors.find(a => a.id === 'hero').health,100)
  assert.equal(previewGameplayCombat(h.state,9375).find(a => a.id === 'hero').stamina,0)
  assert.equal(h.run(h.make('combat',{kind:'guard',actorId:'hero',held:true},9375)).code,'RELEASE_REQUIRED')
  h.apply('combat',{kind:'guard',actorId:'hero',held:false},9375)
  assert.equal(h.run(h.make('combat',{kind:'guard',actorId:'hero',held:true},10808)).code,'INSUFFICIENT_STAMINA')
  h.apply('combat',{kind:'guard',actorId:'hero',held:true},10809)
})

test('hits outside the active interval or beyond the frontal cone cannot be parried',() => {
  const h = harness()
  const swingId = h.apply('combat',{kind:'attack',actorId:'hero'},0).events.find(e => e.kind === 'attack_started').swingId
  const cmd = {kind:'hit',actorId:'hero',targetId:'victim',swingId}
  const evidence = {contact:true,clear:true,angleDegrees:0,proofId:'edge'}
  assert.equal(h.run(h.make('combat',cmd,249,evidence)).code,'NO_ACTIVE_SWING')
  assert.equal(h.run(h.make('combat',cmd,430,evidence)).code,'NO_ACTIVE_SWING')
  for (const angleDegrees of [60,60.001]) {
    const b = harness()
    b.apply('combat',{kind:'guard',actorId:'hero',held:true},0)
    const sid = b.apply('combat',{kind:'attack',actorId:'victim'},0).events.find(e => e.kind === 'attack_started').swingId
    b.apply('combat',{kind:'hit',actorId:'victim',targetId:'hero',swingId:sid},250,{...evidence,angleDegrees})
    assert.equal(b.state.interactions.actors.find(a => a.id === 'hero').health,angleDegrees === 60 ? 100 : 80)
  }
})

test('victim self defense is lawful and later assessment cannot override it',() => {
  const c = config(); c.actors.find(a => a.id === 'victim').health = 100
  const h = harness(c)
  strike(h,'hero','victim',0)
  const response = strike(h,'victim','hero',300)
  const damage = response.events.find(e => e.kind === 'damaged')
  assert.equal(damage.justification.ruleId,'force.self_defense.v1')
  const factId = response.events.find(e => e.kind === 'fact' && e.fact.action === 'damaged').fact.id
  h.apply('knowledge',{kind:'witness',actorId:'guard',factId},550,
    {observed:true,observedAt:550,identified:true,proofId:'defense-seen'})
  assert.equal(h.run(h.make('crime',{kind:'assess',actorId:'guard',factId},550,{unlawful:true,ruleId:'forged'})).code,'LAWFUL_FORCE')
  assert.equal(h.state.crime.cases.length,0)
  assert.deepEqual(restoreGameplay(c,h.state).state,h.state)
})

test('guard force needs prior warrant and sight; resisting lawful force remains unlawful',() => {
  const h = harness()
  const death = strike(h,'hero','victim',0)
  const factId = death.events.find(e => e.kind === 'fact' && e.fact.action === 'died').fact.id
  h.apply('knowledge',{kind:'witness',actorId:'guard',factId},250,
    {observed:true,observedAt:250,identified:true,proofId:'murder-seen'})
  h.apply('crime',{kind:'assess',actorId:'guard',factId},250)
  h.apply('pursuit',{kind:'sight',actorId:'guard',targetId:'hero'},1000,
    {visible:true,identified:true,position:{x:1,y:0,z:2},proofId:'identified'})
  const policeHit = strike(h,'guard','hero',1000)
  assert.equal(policeHit.events.find(e => e.kind === 'damaged').justification.ruleId,'force.enforcement.v1')
  const resistance = strike(h,'hero','guard',1500)
  assert.equal(resistance.events.find(e => e.kind === 'damaged').justification.unlawful,true)
  const saved = restoreGameplay(h.c,h.state)
  assert.equal(saved.ok,true,saved.code)
  assert.deepEqual(saved.state,h.state)
})
