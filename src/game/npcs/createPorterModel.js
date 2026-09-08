import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { createRigidSkin } from '../assets/characters/createRigidSkin.js'

// 扁担沿行进方向落在右肩，货物前后分担，避免横担占满窄巷。
export function createPorterModel(scene) {
  const root=new TransformNode('travelling-peddler',scene),materials=new Map()
  const material=color=>{if(!materials.has(color)){const m=new StandardMaterial(`porter:${color}`,scene);m.diffuseColor=Color3.FromHexString(color);m.specularColor=Color3.Black();materials.set(color,m)}return materials.get(color)}
  const C={cloth:'#7c978a',edge:'#b0b8a0',pants:'#69776e',skin:'#c6a17d',hair:'#3b4038',wood:'#b69a67',weave:'#cfb681',rope:'#776b4f',shoe:'#464d43'}
  const node=(name,x,y,z,parent=root)=>{const n=new TransformNode(name,scene);n.parent=parent;n.position.set(x,y,z);return n}
  const finish=(m,x,y,z,color,parent=root)=>{m.parent=parent;m.position.set(x,y,z);m.material=material(color);m.isPickable=false;return m}
  const box=(w,h,d,x,y,z,c,p=root)=>finish(MeshBuilder.CreateBox('porter-cloth',{width:w,height:h,depth:d},scene),x,y,z,c,p)
  const sphere=(w,h,d,x,y,z,c,p=root)=>{const m=finish(MeshBuilder.CreateSphere('porter-rounded-form',{diameter:1,segments:5},scene),x,y,z,c,p);m.scaling.set(w,h,d);return m}
  const tube=(name,points,r,c,p=root)=>finish(MeshBuilder.CreateTube(name,{path:points.map(v=>new Vector3(...v)),radius:r,tessellation:6,cap:3},scene),0,0,0,c,p)
  const ring=(diameter,thickness,x,y,z,c,p)=>finish(MeshBuilder.CreateTorus('basket-weave-ring',{diameter,thickness,tessellation:12},scene),x,y,z,c,p)
  const body=node('loaded-upper-body',0,0,0)
  const torso=finish(MeshBuilder.CreateCylinder('short-crossed-coat',{height:.52,diameterTop:.47,diameterBottom:.41,tessellation:8},scene),0,1.13,0,C.cloth,body)
  torso.scaling.z=.65
  tube('crossed-collar',[[-.17,1.39,.16],[.08,1.13,.18],[.16,.98,.16]],.022,C.edge,body)
  tube('inner-collar',[[.15,1.39,.16],[-.06,1.18,.18]],.02,C.edge,body)
  box(.45,.07,.31,0,.92,0,C.rope,body)
  box(.12,.26,.07,-.19,.77,.12,C.edge,body)
  sphere(.25,.31,.25,0,1.57,.035,C.skin,body)
  sphere(.26,.13,.25,0,1.71,.005,C.hair,body)
  sphere(.12,.1,.12,0,1.79,-.08,C.hair,body)
  box(.275,.075,.25,0,1.67,.005,C.edge,body)
  for(const x of [-.062,.062])box(.027,.018,.018,x,1.58,.159,C.hair,body)
  sphere(.046,.06,.05,0,1.53,.17,C.skin,body)
  for(const x of [-.135,.135])sphere(.04,.07,.045,x,1.56,.025,C.skin,body)
  const legs=[node('left-stride',-.115,.86,0),node('right-stride',.115,.86,0)]
  for(const leg of legs){box(.17,.62,.2,0,-.31,0,C.pants,leg);box(.16,.2,.19,0,-.59,0,C.edge,leg);sphere(.19,.12,.31,0,-.79,.065,C.shoe,leg)}
  // 右臂曲肘托住前方扁担，左臂保留小幅摆动。
  tube('supporting-sleeve',[[.23,1.36,0],[.38,1.12,.16],[.3,1.37,.43]],.073,C.cloth,body)
  sphere(.12,.1,.13,.27,1.4,.45,C.skin,body)
  const arm=node('free-arm',-.26,1.34,0,body)
  tube('loose-sleeve',[[0,0,0],[-.03,-.25,.02],[0,-.43,.06]],.075,C.cloth,arm)
  sphere(.1,.12,.1,0,-.46,.06,C.skin,arm)
  box(.16,.08,.27,.22,1.38,0,C.edge,body)
  const load=node('spring-bamboo-load',.23,1.44,0,body)
  tube('curved-bamboo-pole',[[0,-.08,-1.13],[0,-.025,-.65],[0,0,0],[0,-.025,.65],[0,-.08,1.13]],.036,C.wood,load)
  const baskets=[]
  for(const side of [-1,1]) {
    const basket=node('suspended-woven-basket',0,-.065,side*1.03,load);baskets.push(basket)
    for(const dx of [-.22,.22])tube('suspension-rope',[[0,0,0],[dx,-.49,0]],.012,C.rope,basket)
    const vessel=finish(MeshBuilder.CreateCylinder('tapered-basket',{height:.38,diameterTop:.57,diameterBottom:.43,tessellation:12},scene),0,-.69,0,C.wood,basket)
    for(let j=0;j<4;j++)ring(.45+j*.035,.021,0,-.86+j*.11,0,C.weave,basket)
    for(let i=0;i<12;i++){const t=i*Math.PI/6;tube('upright-weave',[[Math.cos(t)*.22,-.87,Math.sin(t)*.22],[Math.cos(t)*.285,-.5,Math.sin(t)*.285]],.012,C.rope,basket)}
    ring(.58,.035,0,-.495,0,C.weave,basket)
    if(side===1)for(let i=0;i<6;i++){const t=i*2.4;sphere(.17,.15,.17,Math.cos(t)*.15,-.47+(i%2)*.035,Math.sin(t)*.15,i%2?'#c7a35d':'#8fa76b',basket)}
    else {sphere(.36,.27,.3,0,-.47,0,'#b4b69b',basket);tube('bundle-tie',[[-.15,-.45,0],[0,-.32,0],[.15,-.45,0]],.015,C.rope,basket);box(.13,.23,.22,.16,-.43,.06,'#a78c76',basket)}
  }
  const skinMesh=createRigidSkin(root)
  let time=0,stride=0
  return {root,update(dt,moving=false){
    time+=dt*(moving?6:1.6);stride+=(Number(moving)-stride)*(1-Math.exp(-dt*10))
    legs.forEach((leg,i)=>leg.rotation.x=Math.sin(time+i*Math.PI)*.27*stride)
    body.position.y=Math.sin(time*2)*.014*stride
    arm.rotation.x=-Math.sin(time)*.23*stride
    load.rotation.z=Math.sin(time)*.022*stride
    load.rotation.x=Math.sin(time+.5)*(.005+.018*stride)
    baskets.forEach((b,i)=>{b.rotation.x=Math.sin(time+.7+i*.6)*(.007+.03*stride);b.rotation.z=-load.rotation.z*.7})
  },dispose(){skinMesh.dispose();root.dispose();for(const m of materials.values())m.dispose()}}
}
