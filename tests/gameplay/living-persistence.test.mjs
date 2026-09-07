import test from 'node:test'
import assert from 'node:assert/strict'
import { livingConfig,LIVING_NPCS } from '../../src/game/living/config.js'
import { createGameplay } from '../../src/game/gameplay/index.js'
import { applyLivingCheckpoint,validateLiving } from '../../src/game/living/persistence.js'
import { generateWorld } from '../../src/game/world/generation/generateWorld.js'
import { createProgress } from '../../src/game/world/progress.js'
import { validateDocument } from '../../src/game/persistence/worldRepository.js'
test('scene checkpoint rejects stale writers and preserves already explored fog',()=>{
 const world={seed:'save',generatorVersion:10},state=createGameplay(livingConfig(null,world)).state
 const living={version:1,legacy:null,checkpoint:{version:1,sequence:1,simulationAt:0,gameplay:state},spatial:{player:{x:0,y:0,z:0},stall:{x:0,y:0,z:2},npcs:LIVING_NPCS.map((n,i)=>({id:n.id,x:i,y:0,z:3,heading:0}))}}
 const event={type:'living-checkpoint',expectedSequence:0,living,fog:{'0,0':2}}
 const result=applyLivingCheckpoint({exploredFog:{'0,0':1}},event)
 assert.equal(result.exploredFog['0,0'],3)
 assert.throws(()=>applyLivingCheckpoint(result,event),/冲突/)
 assert.ok(validateLiving(result.living,world).checkpoint)
 const corrupt=structuredClone(living);corrupt.checkpoint.gameplay.interactions.actors[0].health=1
 assert.throws(()=>validateLiving(corrupt,world),/校验/)
})
test('world reader accepts legacy and upgraded schema but rejects unknown versions',()=>{
 const world=generateWorld('schema-check'),document={schemaVersion:2,revision:0,world,progress:createProgress()}
 assert.equal(validateDocument(document,world.seed),document)
 assert.equal(validateDocument({...document,schemaVersion:3},world.seed).schemaVersion,3)
 assert.throws(()=>validateDocument({...document,schemaVersion:4},world.seed),/版本/)
})
