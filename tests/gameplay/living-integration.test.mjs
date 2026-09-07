import test from 'node:test'
import assert from 'node:assert/strict'
import { livingConfig } from '../../src/game/living/config.js'
import { createGameplay,executeGameplay,restoreGameplay,wantedFor } from '../../src/game/gameplay/index.js'
import { createFirstLoop,createFirstLoopRules,NPCS } from '../../src/game/worldLedger/firstLoop.js'
import { sweptContact,localRoute } from '../../src/game/living/geometry.js'
const world={seed:'check',generatorVersion:10}
function harness(legacy=null){const config=livingConfig(legacy,world),initial=createGameplay(config);let state=initial.state,n=0;return {
 config,get state(){return state},run(domain,command,at,extra={},observations){const result=executeGameplay(state,initial.catalog,{id:`check-${++n}`,expectedRevision:state.revision,steps:[{domain,command,context:{at,allowed:true,...extra},...(observations?{observations}:{})}]});if(result.ok)state=result.state;return result}}}
test('medicine heals the exact health pool damaged by combat and survives replay',()=>{
 const h=harness()
 assert.ok(h.run('interaction',{kind:'buy',actorId:'player',targetId:'merchant',lotId:'stock-medicine',quantity:1},0,{unitPrice:15}).ok)
 const lot=h.state.interactions.inventory.lots.find(l=>l.ownerId==='player'&&l.itemType==='medicine')
 const swing=h.run('combat',{kind:'attack',actorId:'merchant'},0).events.find(e=>e.kind==='attack_started').swingId
 assert.ok(h.run('combat',{kind:'hit',actorId:'merchant',targetId:'player',swingId:swing},250,{contact:true,clear:true,angleDegrees:0,proofId:'hit'}).ok)
 assert.equal(h.state.interactions.actors.find(a=>a.id==='player').health,48)
 assert.ok(h.run('interaction',{kind:'use',actorId:'player',targetId:'player',lotId:lot.id,quantity:1},250).ok)
 assert.equal(h.state.interactions.actors.find(a=>a.id==='player').health,73)
 assert.ok(restoreGameplay(h.config,h.state).ok)
})
test('theft needs actual personal evidence; settlement removes only that case',()=>{
 const h=harness()
 const result=h.run('village',{kind:'take',actorId:'player'},0,{},[{npcId:'guard',identified:true,position:{x:0,y:0,z:0},proofId:'seen'}])
 assert.ok(result.ok,result.code)
 assert.equal(wantedFor(h.state.crime,'guard','player').level,0)
 const fact=h.state.social.facts.find(f=>f.action==='take')
 assert.ok(h.run('crime',{kind:'assess',actorId:'guard',factId:fact.id},0).ok)
 assert.equal(wantedFor(h.state.crime,'guard','player').level,2)
 assert.ok(h.run('village',{kind:'settle',actorId:'player'},10).ok)
 assert.equal(wantedFor(h.state.crime,'guard','player').level,0)
 assert.ok(restoreGameplay(h.config,h.state).ok)
})
test('old untouched save migrates inventory and health without granting extra items',()=>{
 const layout={stall:[0,-3],...Object.fromEntries(NPCS.map(n=>[n.id,n.home]))}
 const legacy=createFirstLoop('check',10,layout),h=harness(legacy)
 assert.equal(h.state.interactions.actors.find(a=>a.id==='player').health,60)
 assert.equal(h.state.interactions.inventory.lots.filter(l=>l.holderId==='player-bag').reduce((a,l)=>a+l.quantity,0),1)
 assert.ok(restoreGameplay(h.config,h.state).ok)
})
test('sweep rejects rear, vertical and occluded targets; route goes around a wall',()=>{
 const attacker={x:0,y:0,z:0,heading:0}
 assert.ok(sweptContact(attacker,{x:0,y:0,z:1},0,1,()=>true))
 assert.equal(sweptContact(attacker,{x:0,y:0,z:-1},0,1,()=>true),false)
 assert.equal(sweptContact(attacker,{x:0,y:3,z:1},0,1,()=>true),false)
 assert.equal(sweptContact(attacker,{x:0,y:0,z:1},0,1,()=>false),false)
 const route=localRoute({x:0,z:0},{x:0,z:4},(x,z)=>!(z>1&&z<2&&Math.abs(x)<2))
 assert.ok(route.length);assert.ok(route.some(p=>Math.abs(p.x)>=2))
})

test('legacy named and anonymous reports migrate without inventing identification',()=>{
 for(const identified of [true,false]) {
  const layout={stall:[0,-3],...Object.fromEntries(NPCS.map(n=>[n.id,n.home]))}
  const rules=createFirstLoopRules(createFirstLoop('check',10,layout))
  rules.take([0,-3],[{npcId:'witness',saw:true,identified}])
  for(let i=0;i<10;i++)rules.step(100,{loaded:()=>true,clear:()=>true,move:(n,p)=>{n.position=[...p]},seesPlayer:()=>false,playerPosition:()=>[0,-3]})
  const h=harness(rules.snapshot())
  assert.equal(wantedFor(h.state.crime,'guard','player').level,identified?2:0)
  assert.equal(h.state.social.knowledge.find(k=>k.npcId==='guard').subjectId,identified?'player':null)
  assert.ok(restoreGameplay(h.config,h.state).ok)
 }
})
test('recognized aid is paid once after world delay; masked aid never reveals identity',()=>{
 for(const masked of [false,true]) {
  const h=harness()
  h.run('interaction',{kind:'buy',actorId:'player',targetId:'merchant',lotId:'stock-medicine',quantity:1},0,{unitPrice:15})
  const lot=h.state.interactions.inventory.lots.find(l=>l.holderId==='player-bag'&&l.itemType==='medicine')
  if(masked)h.run('village',{kind:'mask',actorId:'player'},0)
  assert.ok(h.run('village',{kind:'aid',actorId:'player',lotId:lot.id},10,{identified:!masked}).ok)
  assert.equal(h.run('village',{kind:'reward',actorId:'resident-1'},100,{identified:true}).ok,false)
  const result=h.run('village',{kind:'reward',actorId:'resident-1'},20010,{identified:true})
  assert.equal(result.ok,!masked)
  assert.equal(h.run('village',{kind:'reward',actorId:'resident-1'},20011,{identified:true}).ok,false)
  assert.ok(restoreGameplay(h.config,h.state).ok)
 }
})
