import test from 'node:test'
import assert from 'node:assert/strict'
import { createLivingSimulation } from '../../src/game/living/simulation.js'
import { LIVING_NPCS } from '../../src/game/living/config.js'
import { wantedFor } from '../../src/game/gameplay/index.js'
function harness(initialSave){
 const points={player:{x:0,y:0,z:0,heading:0},stall:{x:0,y:0,z:1,heading:0},...Object.fromEntries(LIVING_NPCS.map((n,i)=>[n.id,{x:i*20+20,y:0,z:20,heading:0}]))}
 points.witness={x:0,y:0,z:1,heading:Math.PI};points.guard={x:0,y:0,z:8,heading:Math.PI}
 let saved,seq=initialSave?.sequence??0
 const sim=createLivingSimulation({world:{seed:'sim',generatorVersion:10},saved:initialSave,save:async(candidate,meta)=>{assert.equal(meta.expectedSequence,seq);seq=candidate.sequence;saved=structuredClone(candidate);return {status:'committed',sequence:seq}},
 space:{point:id=>points[id],clear:()=>true,visible:(a,b,identify)=>Math.hypot(points[a].x-points[b].x,points[a].z-points[b].z)<(identify?8:12),
 face:(id,p)=>{points[id].heading=Math.atan2(p.x-points[id].x,p.z-points[id].z)},move:(id,p,dt,stop)=>{const q=points[id],d=Math.hypot(q.x-p.x,q.z-p.z);if(d>stop){q.x+=(p.x-q.x)/d*Math.min(d-stop,dt*3);q.z+=(p.z-q.z)/d*Math.min(d-stop,dt*3)}},canEscape:()=>false,flee:()=>{},idle:()=>{}}})
 return {sim,points,get saved(){return saved}}
}
async function tick(sim,n=1){for(let i=0;i<n;i++){sim.update(.05);await new Promise(resolve=>setImmediate(resolve))}}
test('scene controller connects player strike, personal report, warrant and guard damage',async()=>{
 const h=harness()
 await h.sim.command('attack')
 await tick(h.sim,100)
 assert.ok(h.sim.state().combat.events.some(e=>e.kind==='damaged'&&e.actorId==='player'&&e.targetId==='witness'))
 assert.ok(wantedFor(h.sim.state().crime,'guard','player').level>=2)
 await tick(h.sim,180)
 assert.ok(h.sim.state().combat.events.some(e=>e.kind==='damaged'&&e.actorId==='guard'&&e.targetId==='player'))
 assert.ok(h.sim.state().interactions.actors.find(a=>a.id==='player').health<60)
 assert.ok((await h.sim.checkpoint(true)).ok)
 assert.equal(h.saved.simulationAt,h.sim.clock())
})
test('pause checkpoint releases a held guard and does not advance simulation clock',async()=>{
 const h=harness()
 h.sim.command('guard',{held:true});await tick(h.sim,1)
 assert.equal(h.sim.view().find(f=>f.id==='player').guardHeld,true)
 const at=h.sim.clock()
 await h.sim.checkpoint(true)
 assert.equal(h.sim.clock(),at)
 assert.equal(h.saved.gameplay.combat.fighters.find(f=>f.id==='player').guardHeld,false)
})

test('failed inputs cannot cause request ID collisions after reloading',async()=>{
 const h=harness()
 const failed=await h.sim.command('use',{lotId:'missing'})
 assert.equal(failed.ok,false)
 assert.equal((await h.sim.command('attack')).ok,true)
 const restored=harness(h.saved)
 const result=await restored.sim.command('mask')
 assert.equal(result.ok,true,result.code)
 assert.equal(restored.sim.state().village.masked,true)
})
