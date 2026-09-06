import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { wuxiaDefinitions } from './catalog.js'

// 无外部贴图；重复构件按材质合并，每种建筑只生成一次模板。
export function createWuxiaModel(scene, assetId, material) {
  const a=wuxiaDefinitions[assetId], parts=[]
  const C={wall:'#eee3c8',stone:'#b8c4b5',wood:a.accent,dark:'#534e40',tile:'#6b9290',rib:'#9cb4a2',gold:'#e2bb70',leaf:'#81ad65',flower:'#e8a7b7'}
  function box(w,h,d,x,y,z,color=C.wood) {
    const m=MeshBuilder.CreateBox('wuxia-timber',{width:w,height:h,depth:d},scene)
    m.position.set(x,y,z);m.material=material(color);parts.push(m);return m
  }
  function cyl(r,h,x,y,z,color=C.wood,top=r) {
    const m=MeshBuilder.CreateCylinder('wuxia-detail',{diameter:r*2,diameterTop:top*2,height:h,tessellation:8},scene)
    m.position.set(x,y,z);m.material=material(color);parts.push(m);return m
  }
  function beam(from,to,r,color) {
    const m=MeshBuilder.CreateTube('tile-roll',{path:[new Vector3(...from),new Vector3(...to)],radius:r,tessellation:5,cap:3},scene)
    m.material=material(color);parts.push(m)
  }
  function roof(w,d,x,y,z) {
    // 连续曲面与瓦垄共用同一剖面，避免屋瓦浮在屋面上。
    const rise=Math.min(2,w*.18), pos=[],idx=[],steps=6
    const height=(t,u)=>y+rise*(1-t)**1.7+.30*t**5+.22*Math.abs(u)**8*t**4
    for(const side of [-1,1]) {
      const base=pos.length/3
      for(let j=0;j<=steps;j++)for(let i=0;i<=8;i++) {
        const t=j/steps,u=i/4-1
        pos.push(x+u*w/2,height(t,u),z+side*t*d/2)
      }
      for(let j=0;j<steps;j++)for(let i=0;i<8;i++) {
        const k=base+j*9+i
        if(side===1)idx.push(k,k+1,k+9,k+1,k+10,k+9)
        else idx.push(k,k+9,k+1,k+1,k+9,k+10)
      }
      for(let u=-1;u<=1.001;u+=2/Math.ceil(w/.55)) {
        const path=[]
        for(let j=0;j<=steps;j++){const t=j/steps;path.push(new Vector3(x+u*w/2,height(t,u)+.035,z+side*t*d/2))}
        const m=MeshBuilder.CreateTube('curved-tile-roll',{path,radius:.055,tessellation:5,cap:3},scene)
        m.material=material(C.rib);parts.push(m)
        cyl(.075,.12,x+u*w/2,height(1,u)-.08,z+side*d/2,C.gold)
      }
      box(w,.14,.16,x,y+.21,z+side*d/2,C.wood)
    }
    const normals=[];VertexData.ComputeNormals(pos,idx,normals)
    const m=new Mesh('swept-jade-roof',scene),v=new VertexData()
    v.positions=pos;v.indices=idx;v.normals=normals;v.uvs=new Array(pos.length/3*2).fill(0);v.applyToMesh(m)
    m.material=material(C.tile);m.material.backFaceCulling=false;parts.push(m)
    beam([x-w/2,y+rise+.12,z],[x+w/2,y+rise+.12,z],.13,C.rib)
    for(const side of [-1,1])beam([x+side*w/2,y+rise+.12,z],[x+side*(w/2+.3),y+rise+.45,z],.11,C.gold)
  }
  function window(x,y,z,w=1.3) {
    box(w,1.45,.10,x,y,z,C.dark)
    for(let i=-2;i<=2;i++)box(.055,1.45,.15,x+i*w/5,y,z-.05,C.gold)
    for(const dy of [-.7,0,.7])box(w,.065,.16,x,y+dy,z-.06,C.wood)
  }
  function hall(w,d,x,z,floors=1) {
    box(w+.5,.45,d+.6,x,.22,z,C.stone)
    for(let f=0;f<floors;f++) {
      const floor=.45+f*3.4,y=floor+1.5
      box(w,3,d,x,y,z,C.wall)
      for(const face of [-1,1]) {
        for(let px=-w/2;px<=w/2+.01;px+=w/4) {
          box(.18,3.15,.22,x+px,y,z+face*(d/2+.08))
          box(.55,.16,.5,x+px,floor+2.85,z+face*(d/2+.25),C.gold)
        }
        box(w+.3,.19,.24,x,floor+2.75,z+face*(d/2+.08))
        for(const px of [-w*.3,w*.3])window(x+px,y+.15,z+face*(d/2+.14))
      }
      roof(w+1.8,d+1.9,x,floor+3,z)
    }
    // 山墙补齐屋脊下方，侧面没有透空三角缝。
    const rise=Math.min(2,(w+1.8)*.18), y=.45+(floors-1)*3.4+3
    for(const side of [-1,1]) {
      const positions=[x+side*w/2,y,z-d/2,x+side*w/2,y+rise,z,x+side*w/2,y,z+d/2]
      const data=new VertexData(),m=new Mesh('plaster-gable',scene),normals=[]
      data.positions=positions;data.indices=side===1?[0,1,2]:[0,2,1]
      VertexData.ComputeNormals(positions,data.indices,normals);data.normals=normals;data.uvs=[0,0,.5,1,1,0];data.applyToMesh(m)
      m.material=material(C.wall);m.material.backFaceCulling=false;parts.push(m)
      box(.22,.18,d,x+side*(w/2+.02),y-.4,z)
    }
    box(1.8,2.3,.18,x,1.6,z-d/2-.12)
    for(const dx of [-.46,.46])box(.035,2.25,.08,x+dx,1.6,z-d/2-.23,C.gold)
    for(const dx of [-.18,.18])cyl(.08,.15,x+dx,1.5,z-d/2-.28,C.gold)
  }
  function lantern(x,y,z) {
    beam([x,y+.5,z],[x,y+.95,z],.025,C.dark)
    cyl(.25,.5,x,y,z,'#f3d68b',.22)
    for(const dy of [-.27,.27])cyl(.26,.07,x,y+dy,z,C.gold)
    beam([x,y-.3,z],[x,y-.58,z],.035,a.accent)
  }
  function plant(x,z,flower=false) {
    cyl(.32,.45,x,.3,z,'#d5b68c',.4)
    for(let i=0;i<5;i++) {
      const dx=Math.cos(i*2.4)*.23,dz=Math.sin(i*2.4)*.23
      beam([x,.5,z],[x+dx,1+i*.08,z+dz],.035,C.leaf)
      const m=MeshBuilder.CreateSphere('garden-foliage',{diameter:flower ? .26 : .48,segments:3},scene)
      m.position.set(x+dx,1+i*.08,z+dz);m.material=material(flower?C.flower:C.leaf);parts.push(m)
    }
  }
  function table(x,z) {box(1.4,.15,1,x,1,z);for(const dx of [-.5,.5])for(const dz of [-.3,.3])box(.1,.85,.1,x+dx,.5,z+dz);cyl(.16,.24,x,1.19,z,'#b8d2b4');cyl(.07,.1,x+.4,1.12,z,C.wall)}
  function jar(x,z,color=C.tile) {cyl(.35,.8,x,.45,z,color,.24);cyl(.26,.1,x,.9,z,C.gold)}
  const w=a.width,d=a.depth,front=-d/2-.65
  if(a.kind.startsWith('market-')) {
    box(w+.5,.18,d+.5,0,.09,0,C.stone)
    for(const x of [-w/2,w/2])for(const z of [-d/2,d/2])cyl(.09,2.7,x,1.35,z)
    for(const side of [-1,1]) {
      const canopy=box(w+1,.12,d/2+.7,0,2.85,side*d/4,a.accent);canopy.rotation.x=side*.12
      box(w+1,.35,.08,0,2.6,side*(d/2+.5),a.accent)
    }
    box(w-.6,.18,1.2,0,1.05,-d/2+.5)
    for(const x of [-w/2+.5,w/2-.5])box(.14,1,.14,x,.5,-d/2+.5)
    for(let i=0;i<5;i++) {
      const x=-2.4+i*1.2
      if(a.kind==='market-produce') {
        cyl(.42,.25,x,1.26,-d/2+.5,'#d2b781')
        for(let j=0;j<3;j++){const fruit=MeshBuilder.CreateSphere('market-fruit',{diameter:.3,segments:3},scene);fruit.position.set(x+(j-1)*.22,1.5,-d/2+.5);fruit.material=material(i%2?'#d7a35d':'#91b86f');parts.push(fruit)}
      } else if(a.kind==='market-food') {cyl(.4,.4,x,1.36,-d/2+.5,i%2?'#d9c297':'#81988e');cyl(.43,.08,x,1.6,-d/2+.5,C.gold)}
      else {box(.7,.5,.65,x,1.39,-d/2+.5,['#bad0ad','#d9b8b1','#c0bbd3'][i%3]);jar(x,1)}
    }
  } else if(a.kind==='court') {
    hall(w,4,0,d/2-2)
    hall(3.5,d-4,-w/2+1.75,-2);hall(3.5,d-4,w/2-1.75,-2)
    for(let i=0;i<5;i++)box(2,.08,1.25,0,.05,-d/2+i*1.6,C.stone)
  } else {
    hall(w,d,0,0,a.floors)
    if(a.kind==='garden')hall(3,4,w/2+1,1)
  }
  if(a.kind==='court') {
    for(const side of [-1,1]){box(.25,3.4,.3,side*2,.45+1.7,front);box(.65,.4,.65,side*2,.2,front,C.stone)}
    box(4.4,.25,.35,0,3.4,front)
    roof(5,2,0,3.55,front)
  }
  for(let i=0;i<3;i++)box(2.8+i*.5,.15*(3-i),.65,0,.075*(3-i),-d/2-.6-i*.55,C.stone)
  for(const side of [-1,1]){lantern(side*1.8,2.7,front);plant(side*(w/2+.5),front,true)}
  // 牌匾使用共享的几何字形徽记，远景仍能辨认店铺行业。
  box(2.5,.7,.18,0,2.95,front,C.dark)
  for(const dy of [-.36,.36])box(2.65,.06,.22,0,2.95+dy,front-.02,C.gold)
  const glyphs={当:['11111','00100','11111','00001','11111'],药:['01010','11111','01010','11101','00101'],兵:['01110','01000','01110','01010','11111','01010'],客:['00100','11111','01010','00100','01110'],茶:['01010','11111','00100','01010','11111','00100'],酒:['10011','01011','10111','00101','10111'],锦:['01010','11111','01010','11111','01010'],书:['01010','11111','01010','11111','00010'],镖:['10111','01010','11111','00100','01010'],祠:['10011','01101','11011','01101','01011']}
  const glyph=glyphs[a.sign]||['00100','11111','01010','11111','10001']
  glyph.forEach((row,j)=>[...row].forEach((bit,i)=>{if(bit==='1')box(.065,.065,.05,(i-2)*.085,3.16-j*.085,front-.12,C.gold)}))
  if(['balcony','inn','tea','escort','riverside','row'].includes(a.kind)) {
    box(w,.18,1.25,0,3.8,front)
    for(let x=-w/2;x<=w/2;x+=.55)box(.07,.85,.07,x,4.25,front-.6)
    box(w,.1,.1,0,4.7,front-.6)
  }
  if(['tea','wine','weapons','medicine'].includes(a.kind)) {
    const x=w/2-1.2
    for(const dx of [-1.3,1.3])cyl(.08,2.6,x+dx,1.3,front-1.5)
    const awning=box(3,.1,2.2,x,2.6,front-.9,a.kind==='wine'?'#e6bd77':'#b4cba3');awning.rotation.x=-.12
  }
  if(['tea','wine','inn'].includes(a.kind)) {table(-w/3,front-1);box(1.6,.15,.35,-w/3,.55,front-1.85);jar(w/3,front-1)}
  if(a.kind==='medicine') {
    box(2.7,1.7,.45,-w/3,1.05,front)
    for(let i=0;i<5;i++)for(let j=0;j<3;j++){box(.46,.43,.1,-w/3-1+i*.5,.55+j*.48,front-.28,'#cbb788');cyl(.04,.07,-w/3-1+i*.5,.55+j*.48,front-.37,C.gold)}
    for(let i=0;i<3;i++){jar(w/3-.6+i*.6,front-.7,'#a3b7a0');cyl(.38,.1,w/3-.6+i*.6,1.15,front-1.5,'#dbc68b')}
  }
  if(a.kind==='weapons') {
    box(2.4,.15,.3,-w/3,1.45,front-.5)
    for(let i=0;i<4;i++){const x=-w/3-.85+i*.55;box(.08,1.65,.08,x,1.35,front-.6,'#c7d9d6');box(.38,.06,.1,x,.7,front-.6,C.gold);box(.1,.35,.1,x,.48,front-.6,C.dark)}
    box(1,.3,.6,w/3,1.0,front-1,C.dark);box(.4,.8,.4,w/3,.5,front-1,C.stone)
    cyl(.55,1,w/3+1,.5,front,C.stone);cyl(.4,.05,w/3+1,1.03,front,'#d29861')
  }
  if(a.kind==='cloth')for(let i=0;i<4;i++) {box(.5,1.7,.35,w/3-1+i*.55,1.3,front-.35,['#a6cdb9','#dfb0b8','#edce88','#a7c5d7'][i]);box(2.5,.15,.65,w/3,.45,front-.35)}
  if(a.kind==='pawn'){box(2.5,1.7,.65,w/3,1.25,front);cyl(.45,.12,-w/3,2.2,front,C.gold);cyl(.18,.14,-w/3,2.28,front,C.dark)}
  if(['books','scholar'].includes(a.kind))for(let side of [-1,1]) {box(2,1.8,.4,side*w/3,1.2,front);for(let i=0;i<8;i++)box(.16,.7,.3,side*w/3-.8+i*.22,1.5,front-.23,i%2?C.wall:C.gold)}
  if(a.kind==='escort'){cyl(.065,5,w/2+1,2.5,0);box(1.4,1,.05,w/2+.3,4.2,0,'#dfa660');for(let i=0;i<3;i++)box(.9,.8,.8,-w/3+i, .4,front-.8,C.wood)}
  if(a.kind==='shrine'){roof(w*.72,d*.65,0,5.1,0);cyl(.6,.7,0,.7,front-1.5,C.stone);for(let i=-1;i<=1;i++)beam([i*.15,1,front-1.5],[i*.15,1.65,front-1.5],.018,C.wood)}
  if(['shrine','court','books','scholar'].includes(a.kind))for(const side of [-1,1]) {
    const x=side*(w/2-1),z=front-1
    box(.9,.2,.9,x,.1,z,C.stone);box(.65,.16,.65,x,.28,z,C.stone)
    cyl(.16,.65,x,.68,z,C.stone)
    box(.55,.65,.55,x,1.25,z,C.stone);box(.30,.36,.02,x,1.27,z-.285,'#f4ddb0')
    roof(1.1,1.1,x,1.65,z);cyl(.09,.23,x,2.05,z,C.gold)
  }
  if(a.kind==='government') {
    roof(w*.7,d*.65,0,8.1,0)
    for(const side of [-1,1]) {box(.45,2.8,.45,side*2.5,1.8,front);box(1,.4,1,side*2.5,.2,front,C.stone)}
    const drum=cyl(.6,.55,-w/3,1.55,front-.4,'#c6a36b');drum.rotation.x=Math.PI/2
    for(const dx of [-.45,.45])box(.12,1.3,.15,-w/3+dx,.65,front-.4)
    box(2,1.5,.16,w/3,1.6,front,C.wood);box(1.7,1.2,.04,w/3,1.6,front-.1,C.wall)
    for(const dx of [-.75,.75])box(.12,1.2,.12,w/3+dx,.6,front)
    for(let i=0;i<4;i++)box(1.3,.04,.025,w/3,1.95-i*.23,front-.14,C.dark)
  }
  if(a.kind==='riverside') {box(w,.25,2,0,.3,front-1);for(const side of [-1,1])plant(side*w/3,front-1.5)}
  if(a.kind==='workyard') {for(let i=0;i<3;i++){cyl(.55,.12,-w/3+i*1.2,.65,front-1,'#d8be7d');box(.1,.6,.1,-w/3+i*1.2,.3,front-1)}for(let i=0;i<4;i++)beam([w/3,.3+i*.15,front-.4],[w/3+1,.3+i*.15,front-.4],.08,C.wood)}
  if(a.kind==='row')for(const side of [-1,1]){box(1.4,2.3,.15,side*w/4,1.6,-d/2-.2);lantern(side*w/4,2.7,front)}
  if(['garden','court','home'].includes(a.kind)) {
    for(let i=0;i<6;i++)box(.07,.85,.07,-w/2-1,.45,-2+i*.65,C.wood)
    box(.08,.08,4,-w/2-1,.75,-.4,C.wood)
    cyl(.16,2.5,w/2+.8,1.25,1,C.wood)
    for(let i=0;i<5;i++){const m=MeshBuilder.CreateSphere('blossom-crown',{diameter:1.35,segments:3},scene);m.position.set(w/2+.8+Math.cos(i*2)*.5,2.4+i*.18,1+Math.sin(i*2)*.5);m.material=material(a.kind==='garden'?C.flower:C.leaf);parts.push(m)}
  }
  for(const m of parts)m.computeWorldMatrix(true)
  const groups=new Map()
  for(const m of parts){if(!groups.has(m.material))groups.set(m.material,[]);groups.get(m.material).push(m)}
  return Mesh.MergeMeshes([...groups.values()].map(group=>Mesh.MergeMeshes(group,true,true)),true,true,undefined,false,true)
}
