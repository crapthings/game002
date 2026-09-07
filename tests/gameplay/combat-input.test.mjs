import test from 'node:test'
import assert from 'node:assert/strict'
import { createCombatInput } from '../../src/game/living/createCombatInput.js'
import { useLivingStore } from '../../src/stores/useLivingStore.js'
test('capture click cannot attack; blur/unlock releases guard and clears queued input',()=>{
 const previousWindow=globalThis.window,previousDocument=globalThis.document
 const window=new EventTarget(),document=new EventTarget(),canvas=new EventTarget()
 globalThis.window=window;globalThis.document=document
 let released=0,playing=true
 const emit=(target,type,fields)=>{const e=new Event(type,{cancelable:true});Object.assign(e,fields);target.dispatchEvent(e)}
 const input=createCombatInput(canvas,()=>playing,()=>released++)
 try {
  useLivingStore.getState().reset()
  emit(canvas,'pointerdown',{button:0});assert.equal(useLivingStore.getState().commands.length,0)
  document.pointerLockElement=canvas
  emit(canvas,'pointerdown',{button:0});assert.equal(useLivingStore.getState().drain()[0].kind,'attack')
  emit(canvas,'pointerdown',{button:2});assert.equal(useLivingStore.getState().commands[0].data.held,true)
  emit(window,'blur',{});assert.ok(released>0);assert.equal(useLivingStore.getState().commands.length,0)
  emit(canvas,'pointerdown',{button:2});document.pointerLockElement=null;emit(document,'pointerlockchange',{})
  assert.equal(useLivingStore.getState().commands.length,0)
  playing=false;emit(canvas,'pointerdown',{button:0});assert.equal(useLivingStore.getState().commands.length,0)
 } finally {input.dispose();useLivingStore.getState().reset();if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument}
})
