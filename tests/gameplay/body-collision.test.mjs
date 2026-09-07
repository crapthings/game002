import test from 'node:test'
import assert from 'node:assert/strict'
import { bodyMoveClear, bodySupportHeight } from '../../src/game/entities/bodyCollision.js'
import { createLocomotion } from '../../src/game/entities/createLocomotion.js'
const npc = { x:0, y:0, z:0 }
const world = {terrain:{surfaceHeight:()=>0},canMove:()=>true,canTraverse:()=>true}
test('running and dashing stop before a body instead of crossing it', () => {
  for (const dash of [false,true]) {
    const motion=createLocomotion(),p={x:0,y:0,z:-2}
    for (let i=0;i<40;i++) motion.update(.05,p,world,{
      direction:{x:0,z:1},speed:10,jumpPressed:false,jumpHeld:false,
      dashDirection:dash&&i===0?{x:0,z:1}:null,
      bodyClear:(from,to)=>bodyMoveClear(from,to,[npc]),
    })
    assert.ok(p.z <= -.7,`crossed body: ${p.z}`)
    assert.ok(p.z > -1,'must approach the body')
  }
})
test('height separates bodies, old overlaps can escape but cannot deepen', () => {
  assert.equal(bodyMoveClear({x:0,y:2,z:-1},{x:0,y:2,z:0},[npc]),true)
  assert.equal(bodyMoveClear({x:0,y:0,z:-.2},{x:0,y:0,z:-.3},[npc]),true)
  assert.equal(bodyMoveClear({x:0,y:0,z:-.2},{x:0,y:0,z:-.1},[npc]),false)
  assert.equal(bodyMoveClear({x:0,y:0,z:-1},{x:0,y:0,z:-.5},[npc]),false)
})

test('falling onto an actor stops at its top rather than inside its body', () => {
  const motion=createLocomotion(),p={x:0,y:3,z:0}
  motion.beginFall()
  for(let i=0;i<40;i++) motion.update(.05,p,world,{
    direction:{x:0,z:0},speed:0,jumpPressed:false,jumpHeld:false,
    bodyClear:(from,to)=>bodyMoveClear(from,to,[npc]),
    bodySupport:(x,z,ceiling)=>bodySupportHeight(x,z,ceiling,[npc]),
  })
  assert.equal(p.y,1.75)
})
