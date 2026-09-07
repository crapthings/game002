import { combatPose } from '../living/combatPose.js'
import { createPorterModel } from './createPorterModel.js'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { npcDefinitions } from './catalog.js'
export function createNpcModel(scene,id) {
  if(id==='npc.porter')return createPorterModel(scene)
  const a=npcDefinitions[id],root=new TransformNode(id,scene),materials=[]
  const mat=color=>{const m=new StandardMaterial('npc-cloth',scene);m.diffuseColor=Color3.FromHexString(color);m.specularColor=Color3.Black();materials.push(m);return m}
  const cloth=mat(a.color),dark=mat('#45483f'),skin=mat('#cba983'),hair=mat('#333831'),straw=mat('#c3ac7c')
  const part=(w,h,d,x,y,z,m,parent=root)=>{const mesh=MeshBuilder.CreateBox('npc-part',{width:w,height:h,depth:d},scene);mesh.parent=parent;mesh.position.set(x,y,z);mesh.material=m;mesh.isPickable=false;return mesh}
  const joint=(x,y)=>{const n=new TransformNode('npc-joint',scene);n.parent=root;n.position.set(x,y,0);return n}
  part(.44,.55,.26,0,1.13,0,cloth)
  part(.46,.07,.29,0,.9,0,dark)
  const head=MeshBuilder.CreateSphere('npc-face',{diameter:.29,segments:4},scene);head.parent=root;head.position.y=1.57;head.material=skin;head.isPickable=false
  part(.3,.1,.28,0,1.7,-.025,hair)
  part(.11,.1,.12,0,1.78,-.08,hair)
  for(const x of [-.065,.065])part(.025,.025,.015,x,1.6,.14,dark)
  const legs=[joint(-.12,.86),joint(.12,.86)],arms=[joint(-.29,1.36),joint(.29,1.36)]
  for(const leg of legs){part(.16,.67,.18,0,-.34,0,cloth,leg);part(.18,.1,.3,0,-.79,.05,dark,leg)}
  for(const arm of arms){part(.15,.43,.18,0,-.2,0,cloth,arm);part(.11,.13,.12,0,-.47,0,skin,arm)}
  if(a.female){part(.46,.32,.3,0,.79,0,cloth);part(.26,.3,.1,0,1.45,-.17,hair)}
  if(a.role==='vendor')part(.32,.46,.03,0,.91,.16,straw)
  if(a.role==='guard'){part(.36,.15,.32,0,1.78,0,dark);part(.2,.24,.04,0,1.18,.16,straw);part(.07,.95,.07,.34,.82,-.15,dark)}
  if(a.role==='porter') {
    part(2,.06,.06,0,1.42,0,straw)
    for(const x of [-.86,.86]) {part(.025,.58,.025,x,1.1,0,dark);part(.4,.35,.4,x,.65,0,straw)}
  }
  const blade=part(.06,.8,.04,0,-.9,0,mat('#b9ccd0'),arms[1]);blade.setEnabled(false)
  let phase=0
  return {root,setEquipment(weapon,armor){blade.setEnabled(!!weapon);cloth.diffuseColor=Color3.FromHexString(armor?'#596473':a.color)},update(dt,moving=false){phase+=dt*(moving?7:1.5);legs.forEach((n,i)=>n.rotation.x=moving?Math.sin(phase+i*Math.PI)*.42:0);arms.forEach((n,i)=>{n.rotation.x=a.role==='porter'?-.65:moving?-Math.sin(phase+i*Math.PI)*.3:Math.sin(phase)*.035});},combatPose(f,at,flash){const pose=combatPose(f,at);root.rotation.z=pose.dead?Math.PI/2:0;root.rotation.x=pose.lean;arms.forEach(n=>n.rotation.z=0);if(f&&!['idle','dead'].includes(f.phase)){arms[1].rotation.x=pose.arm;arms[1].rotation.z=pose.side;if(f.phase==='guard'){arms[0].rotation.x=pose.arm;arms[0].rotation.z=-pose.side}}const active=flash&&at<flash.until;materials.forEach(m=>m.emissiveColor.set(active&&flash.kind!=='parried'?.4:0,active&&flash.kind==='parried'?.4:0,active&&flash.kind==='parried'?.5:0));},dispose(){root.dispose();materials.forEach(m=>m.dispose())}}
}
