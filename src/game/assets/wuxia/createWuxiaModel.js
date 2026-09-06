import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData'
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector'
import { wuxiaDefinitions } from './catalog.js'
import { residenceFacades } from './residences.js'

// 无外部贴图；重复构件按材质合并，每种建筑只生成一次模板。
export function createWuxiaModel(scene, assetId, material) {
  const a=wuxiaDefinitions[assetId], parts=[], style=residenceFacades[a.kind], home=Boolean(style)
  const C={wall:a.wealth==='poor'?'#c4b79a':'#eee3c8',stone:'#b8c4b5',wood:a.accent,dark:'#534e40',tile:a.wealth==='poor'?'#8b9180':'#6b9290',rib:a.wealth==='poor'?'#abb09a':'#9cb4a2',gold:'#e2bb70',leaf:'#81ad65',flower:'#e8a7b7'}
  if(style)Object.assign(C,{wall:style.wall,tile:style.tile,rib:style.tile,gold:a.wealth==='rich'?'#cab181':a.accent})
  const roofRise=w=>Math.min(2,w*.18)*(style?.rise??1)
  const roofHeight=(w,t,u)=>roofRise(w)*(1-t)**1.7+.30*t**5+.22*Math.abs(u)**8*t**4
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
  function roof(w,d,x,y,z,eaveStart=0) {
    // 连续曲面与瓦垄共用同一剖面，避免屋瓦浮在屋面上。
    const rise=roofRise(w), pos=[],idx=[],steps=6
    const height=(t,u)=>y+roofHeight(w,t,u)
    for(const side of [-1,1]) {
      const base=pos.length/3
      for(let j=0;j<=steps;j++)for(let i=0;i<=8;i++) {
        const t=eaveStart+(1-eaveStart)*j/steps,u=i/4-1
        pos.push(x+u*w/2,height(t,u),z+side*t*d/2)
      }
      for(let j=0;j<steps;j++)for(let i=0;i<8;i++) {
        const k=base+j*9+i
        if(side===1)idx.push(k,k+1,k+9,k+1,k+10,k+9)
        else idx.push(k,k+9,k+1,k+1,k+9,k+10)
      }
      for(let u=-1;u<=1.001;u+=2/Math.ceil(w/.55)) {
        const path=[]
        for(let j=0;j<=steps;j++){const t=eaveStart+(1-eaveStart)*j/steps;path.push(new Vector3(x+u*w/2,height(t,u)+.035,z+side*t*d/2))}
        const m=MeshBuilder.CreateTube('curved-tile-roll',{path,radius:.055,tessellation:5,cap:3},scene)
        m.material=material(C.rib);parts.push(m)
        cyl(.075,.12,x+u*w/2,height(1,u)-.08,z+side*d/2,C.gold)
      }
      // 檐口跟随角部起翘，不能用一根水平木条悬在瓦面下。
      for(let i=0;i<8;i++) {
        const u0=i/4-1,u1=(i+1)/4-1
        beam([x+u0*w/2,height(1,u0)-.10,z+side*d/2],[x+u1*w/2,height(1,u1)-.10,z+side*d/2],.075,C.wood)
      }
    }
    // 同一曲面向下形成屋面底板，并封闭外缘，避免侧看只有一张薄片。
    const topCount=pos.length/3,topIndices=[...idx]
    for(let i=0;i<topCount;i++)pos.push(pos[i*3],pos[i*3+1]-.10,pos[i*3+2])
    for(let i=0;i<topIndices.length;i+=3)idx.push(topIndices[i]+topCount,topIndices[i+2]+topCount,topIndices[i+1]+topCount)
    const seal=(a,b)=>idx.push(a,b,a+topCount,b,b+topCount,a+topCount)
    for(const base of [0,(steps+1)*9]) {
      for(let i=0;i<8;i++){seal(base+i,base+i+1);seal(base+steps*9+i+1,base+steps*9+i)}
      for(let j=0;j<steps;j++){seal(base+(j+1)*9,base+j*9);seal(base+j*9+8,base+(j+1)*9+8)}
    }
    const normals=[];VertexData.ComputeNormals(pos,idx,normals)
    const m=new Mesh('swept-jade-roof',scene),v=new VertexData()
    v.positions=pos;v.indices=idx;v.normals=normals;v.uvs=new Array(pos.length/3*2).fill(0);v.applyToMesh(m)
    m.material=material(C.tile);m.material.backFaceCulling=false;parts.push(m)
    if(eaveStart)return
    beam([x-w/2,y+rise+.12,z],[x+w/2,y+rise+.12,z],.13,C.rib)
    for(const side of [-1,1])beam([x+side*w/2,y+rise+.12,z],[x+side*(w/2+.3),y+rise+.45,z],.11,C.gold)
  }
  // 构件先按正面建造，再整体变换；Tube 的顶点也必须一起转向。
  function turnParts(start,x,z,yaw) {
    if(!yaw)return
    const turn=Matrix.Translation(-x,0,-z).multiply(Matrix.RotationY(yaw)).multiply(Matrix.Translation(x,0,z))
    for(const m of parts.slice(start)) {
      m.bakeTransformIntoVertices(m.computeWorldMatrix(true).multiply(turn))
      m.position.setAll(0);m.rotation.setAll(0);m.scaling.setAll(1)
    }
  }
  function window(x,y,z,w=1.3,face=-1) {
    const h=style?.wide?1.25:1.4, outward=offset=>z+face*offset
    if(style?.window==='round') {
      const disk=MeshBuilder.CreateCylinder('round-window',{diameter:Math.min(w,h),height:.10,tessellation:16},scene)
      disk.rotation.x=Math.PI/2;disk.position.set(x,y,z);disk.material=material(C.dark);parts.push(disk)
      const r=Math.min(w,h)/2,path=[]
      for(let i=0;i<=20;i++)path.push(new Vector3(x+Math.cos(i*Math.PI/10)*r,y+Math.sin(i*Math.PI/10)*r,outward(.07)))
      const rim=MeshBuilder.CreateTube('round-window-frame',{path,radius:.065,tessellation:5},scene)
      rim.material=material(C.wood);parts.push(rim)
      for(const dx of [-r*.45,0,r*.45])box(.045,2*Math.sqrt(r*r-dx*dx)-.08,.06,x+dx,y,outward(.07))
      box(r*1.8,.045,.06,x,y,outward(.07))
      return
    }
    box(w,h,.10,x,y,z,C.dark)
    for(const dx of [-w/2,w/2])box(.10,h+.14,.16,x+dx,y,outward(.055))
    for(const dy of [-h/2,h/2])box(w+.18,.10,.18,x,y+dy,outward(.06))
    if(style?.window==='shutter') {
      // 半掩木板窗限定在开间内，不越过柱子。
      for(const side of [-1,1]) {
        box(w*.28,h-.08,.09,x+side*w*.35,y,outward(.14))
        for(const dy of [-h*.32,h*.32])box(w*.28,.07,.06,x+side*w*.35,y+dy,outward(.21),C.dark)
      }
      for(const dy of [-.3,.3])box(w*.38,.04,.06,x,y+dy,outward(.07))
    } else {
      for(let i=-2;i<=2;i++)box(.045,h,.07,x+i*w/6,y,outward(.07))
      for(const dy of (style?.window==='slat'?[0]:[-h*.25,0,h*.25]))box(w,.045,.08,x,y+dy,outward(.08))
    }
    box(w+.24,.12,.30,x,y-h/2-.08,outward(.12),C.stone)
  }
  function door(x,z,width=1.65,steps=true) {
    box(width+.22,2.5,.20,x,1.7,z,C.dark)
    box(width,2.3,.22,x,1.6,z-.025)
    for(let i=-2;i<=2;i++)box(.025,2.2,.035,x+i*width/5,1.6,z-.15,C.dark)
    for(const dx of [-width*.14,width*.14]) {
      const handle=cyl(.065,.055,x+dx,1.5,z-.19,C.gold);handle.rotation.x=Math.PI/2
    }
    box(width+.38,.16,.32,x,2.98,z,C.wood)
    if(steps)for(let i=0;i<3;i++)box(width+.45+i*.25,.15*(3-i),.42,x,.075*(3-i),z-.26-i*.4,C.stone)
  }
  function hall(w,d,x,z,floors=1,yaw=0,insets=[0,0]) {
    const start=parts.length, bays=home?(style.split?4:3):4
    box(w+.5,.45,d+.6,x,.22,z,C.stone)
    for(let f=0;f<floors;f++) {
      const floor=.45+f*3.4,y=floor+1.5
      box(w,3,d,x,y,z,C.wall)
      for(const face of [-1,1]) {
        const [left,right]=face===-1?insets:[0,0], span=w-left-right,bay=span/bays,origin=x+(left-right)/2
        for(let i=0;i<=bays;i++) {
          const px=-span/2+i*bay
          if(!home&&f===0&&i===2)continue
          box(.18,3.15,.22,origin+px,y,z+face*(d/2+.08))
          box(.42,.16,.42,origin+px,floor+2.85,z+face*(d/2+.20),C.gold)
        }
        box(w+.3,.19,.24,x,floor+2.75,z+face*(d/2+.08))
        for(let i=0;i<bays;i++) {
          const px=-span/2+(i+.5)*bay
          const balcony=home&&face===-1&&f===1&&i===1&&['common-loft','balcony','riverside','comfort-shop'].includes(a.kind)
          const entrance=home&&face===-1&&f===0&&(style.split?i%2===1:i===1)
          if(entrance)door(origin+px,z-d/2-.15,Math.min(1.65,bay-.38))
          else if(balcony){const first=parts.length;door(origin+px,z-d/2-.15,1.45,false);for(const m of parts.slice(first))m.position.y+=3.4}
          else if(home||i===0||i===3)window(origin+px,y+.15,z+face*(d/2+.14),Math.min(style?.wide?1.85:1.45,bay-.40),face)
        }
        if(style?.trim==='timber')box(w,.5,.10,x,floor+.28,z+face*(d/2+.06))
        if(style?.trim==='brick') {
          box(w,.4,.08,x,floor+.2,z+face*(d/2+.05),C.stone)
          for(let i=0;i<Math.floor(w);i++)box(.025,.36,.03,x-w/2+.5+i,floor+.2,z+face*(d/2+.1),C.wall)
        }
      }
      // 侧窗贴合侧墙并朝外，避开屋角和侧厢接合位置。
      if(home&&d>4.5)for(const side of [-1,1]) {
        const first=parts.length
        window(x+side*(w/2+.14),y+.1,z,1.3)
        turnParts(first,x+side*(w/2+.14),z,-side*Math.PI/2)
      }
      if(home&&f<floors-1)box(w,.4,d,x,floor+3.2,z,C.wood)
      const rw=w+1.8,rd=d+1.9,wallT=d/rd,roofBase=floor+3
      // 墙顶封檐随瓦面高度变化，和墙身重叠少许，封住前后透光缝。
      for(const face of [-1,1]) {
        const positions=[],indices=[]
        for(let i=0;i<=16;i++) {
          const px=-w/2+i*w/16,u=px/(rw/2)
          const top=roofBase+roofHeight(rw,wallT,u)-.04
          positions.push(x+px,roofBase-.06,z+face*d/2,x+px,top,z+face*d/2)
          if(i<16){const k=i*2;indices.push(k,k+1,k+2,k+1,k+3,k+2)}
        }
        const mesh=new Mesh('wall-eave-closure',scene),data=new VertexData(),normals=[]
        VertexData.ComputeNormals(positions,indices,normals)
        data.positions=positions;data.indices=indices;data.normals=normals;data.uvs=new Array(positions.length/3*2).fill(0);data.applyToMesh(mesh)
        mesh.material=material(C.wood);mesh.material.backFaceCulling=false;parts.push(mesh)
        // 外挑椽木从墙顶伸到檐口；沿曲面分段，端点贴在底板下。
        for(let i=0;i<=Math.ceil(w/.9);i++) {
          const px=-w/2+i*w/Math.ceil(w/.9),u=px/(rw/2)
          for(let j=0;j<3;j++) {
            const t0=wallT+(1-wallT)*j/3,t1=wallT+(1-wallT)*(j+1)/3
            beam([x+px,roofBase+roofHeight(rw,t0,u)-.12,z+face*t0*rd/2],[x+px,roofBase+roofHeight(rw,t1,u)-.12,z+face*t1*rd/2],.045,C.wood)
          }
        }
      }
      roof(w+1.8,d+1.9,x,floor+3,z,home&&f<floors-1?d/(d+1.9):0)
    }
    // 山墙沿真实瓦面剖面封口，直三角山墙会穿出凹曲屋面。
    const y=.45+(floors-1)*3.4+3,rw=w+1.8,rd=d+1.9
    for(const side of [-1,1]) {
      const positions=[],indices=[]
      for(let i=0;i<=12;i++) {
        const dz=-d/2+i*d/12,t=Math.abs(dz)/(rd/2)
        const lo=Math.floor(t*6)/6,hi=lo+1/6,blend=(t-lo)*6
        const top=roofHeight(rw,lo,w/rw)*(1-blend)+roofHeight(rw,hi,w/rw)*blend
        positions.push(x+side*w/2,y-.05,z+dz,x+side*w/2,y+top,z+dz)
        if(i<12){const k=i*2;indices.push(k,k+1,k+2,k+1,k+3,k+2)}
      }
      const data=new VertexData(),m=new Mesh('plaster-gable',scene),normals=[]
      data.positions=positions;data.indices=indices
      VertexData.ComputeNormals(positions,indices,normals);data.normals=normals;data.uvs=new Array(positions.length/3*2).fill(0);data.applyToMesh(m)
      m.material=material(C.wall);m.material.backFaceCulling=false;parts.push(m)
      box(.22,.18,d,x+side*(w/2+.02),y-.4,z)
    }
    if(!home)door(x,z-d/2-.12)
    turnParts(start,x,z,yaw)
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
  } else if((a.kind==='court'||a.layout==='court')) {
    hall(w,4,0,d/2-2,a.wealth==='rich'?a.floors:1,0,[3.5,3.5])
    hall(d-4,3.5,-w/2+1.75,-2,1,-Math.PI/2);hall(d-4,3.5,w/2-1.75,-2,1,Math.PI/2)
    for(let i=0;i<5;i++)box(2,.08,1.25,0,.05,-d/2+i*1.6,C.stone)
  } else if(a.layout==='wing') {
    hall(w,4,0,d/2-2,1,0,[3.5,0]);hall(d-4,3.5,-w/2+1.75,-2,1,-Math.PI/2)
    for(let i=0;i<4;i++)box(1.8,.08,1.2,1,.04,-d/2+i*1.5,C.stone)
  } else {
    hall(w,d,0,0,a.floors)
  }
  if((a.kind==='court'||a.layout==='court')) {
    for(const side of [-1,1]){box(.25,3.4,.3,side*2,.45+1.7,front);box(.65,.4,.65,side*2,.2,front,C.stone)}
    box(4.4,.25,.35,0,3.4,front)
    roof(5,2,0,3.55,front)
    for(const side of [-1,1]) {
      const width=Math.max(.1,w/2-5.5),x=side*(2+width/2)
      box(width,1.65,.25,x,.825,front,C.wall)
      box(width+.12,.16,.42,x,1.72,front,C.tile)
    }
  }
  if(!home) {
  for(let i=0;i<3;i++)box(2.8+i*.5,.15*(3-i),.65,0,.075*(3-i),-d/2-.6-i*.55,C.stone)
  for(const side of [-1,1]){lantern(side*1.8,2.7,front);plant(side*(w/2+.5),front,true)}
  // 牌匾使用共享的几何字形徽记，远景仍能辨认店铺行业。
  box(2.5,.7,.18,0,2.95,front,C.dark)
  for(const dy of [-.36,.36])box(2.65,.06,.22,0,2.95+dy,front-.02,C.gold)
  const glyphs={当:['11111','00100','11111','00001','11111'],药:['01010','11111','01010','11101','00101'],兵:['01110','01000','01110','01010','11111','01010'],客:['00100','11111','01010','00100','01110'],茶:['01010','11111','00100','01010','11111','00100'],酒:['10011','01011','10111','00101','10111'],锦:['01010','11111','01010','11111','01010'],书:['01010','11111','01010','11111','00010'],镖:['10111','01010','11111','00100','01010'],祠:['10011','01101','11011','01101','01011']}
  const glyph=glyphs[a.sign]||['00100','11111','01010','11111','10001']
  glyph.forEach((row,j)=>[...row].forEach((bit,i)=>{if(bit==='1')box(.065,.065,.05,(i-2)*.085,3.16-j*.085,front-.12,C.gold)}))
  } else if(a.layout==='court'||a.kind==='court') {
    for(const side of [-1,1])lantern(side*1.4,2.7,front)
  } else if(a.layout!=='wing') {
    const lampX=style.split?w*.25:Math.min(1.15,w/6)
    box(.42,.10,.55,lampX,3.05,-d/2-.32)
    lantern(lampX,2.3,-d/2-.48)
  }
  if(['balcony','inn','tea','escort','riverside','row'].includes(a.kind)) {
    const width=a.kind==='balcony'?w*.60:w
    box(width,.18,1.25,0,3.8,front)
    for(let x=-width/2;x<=width/2;x+=.55)box(.07,.85,.07,x,4.25,front-.6)
    box(width,.1,.1,0,4.7,front-.6)
    for(const side of [-1,1]){box(.08,.1,1.25,side*width/2,4.7,front);beam([side*width*.4,3.75,front-.5],[side*width*.4,2.9,-d/2],.07,C.wood)}
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
  if(a.kind==='books')for(let side of [-1,1]) {box(2,1.8,.4,side*w/3,1.2,front);for(let i=0;i<8;i++)box(.16,.7,.3,side*w/3-.8+i*.22,1.5,front-.23,i%2?C.wall:C.gold)}
  if(a.kind==='escort'){cyl(.065,5,w/2+1,2.5,0);box(1.4,1,.05,w/2+.3,4.2,0,'#dfa660');for(let i=0;i<3;i++)box(.9,.8,.8,-w/3+i, .4,front-.8,C.wood)}
  if(a.kind==='shrine'){roof(w*.72,d*.65,0,5.1,0);cyl(.6,.7,0,.7,front-1.5,C.stone);for(let i=-1;i<=1;i++)beam([i*.15,1,front-1.5],[i*.15,1.65,front-1.5],.018,C.wood)}
  if(['shrine','court','books','scholar','comfort-garden'].includes(a.kind)||a.wealth==='rich')for(const side of [-1,1]) {
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
  if(['garden','court','home'].includes(a.kind)) {
    for(let i=0;i<6;i++)box(.07,.85,.07,-w/2-1,.45,-2+i*.65,C.wood)
    box(.08,.08,4,-w/2-1,.75,-.4,C.wood)
    cyl(.16,2.5,w/2+.8,1.25,1,C.wood)
    for(let i=0;i<5;i++){const m=MeshBuilder.CreateSphere('blossom-crown',{diameter:1.35,segments:3},scene);m.position.set(w/2+.8+Math.cos(i*2)*.5,2.4+i*.18,1+Math.sin(i*2)*.5);m.material=material(a.kind==='garden'?C.flower:C.leaf);parts.push(m)}
  }
  if(a.wealth==='poor') {
    if(style.trim==='patch')for(let i=0;i<3;i++){const plank=box(.7,.13,.08,-w*.40,.9+i*.23,-d/2-.20,C.wood);plank.rotation.z=(i-1)*.1}
    jar(w/2-.7,front-.35,'#9d9374')
    if(a.kind==='poor-shed') {
      // 靠墙高、外檐低；顶板、横梁和立柱共用同一坡面坐标。
      const cx=-w/2+1,backZ=-d/2-.04,edgeZ=backZ-1.95
      const edgeY=2.05,slope=.20,angle=-Math.atan(slope),thickness=.10
      const roofY=z=>edgeY+(z-edgeZ)*slope
      const underside=z=>roofY(z)-thickness/(2*Math.cos(angle))
      const shed=box(2.25,thickness,1.95/Math.cos(angle),cx,roofY((edgeZ+backZ)/2),(edgeZ+backZ)/2,C.wood)
      shed.rotation.x=angle
      const postZ=edgeZ+.16,ledgerZ=backZ-.08,beamHeight=.14
      for(const z of [postZ,ledgerZ])box(2.1,beamHeight,.14,cx,underside(z)-beamHeight/2,z,C.wood)
      const postHeight=underside(postZ)-beamHeight+.015
      for(const x of [cx-.9,cx+.9]) {
        cyl(.075,postHeight,x,postHeight/2,postZ)
        beam([x,underside(postZ)-.04,postZ],[x,underside(ledgerZ)-.04,ledgerZ],.045,C.wood)
        beam([x,postHeight-.38,postZ],[x,underside(postZ+.32)-.07,postZ+.32],.045,C.wood)
      }
    }
    if(a.kind==='poor-craft'){table(-w/3,front-.5);for(let i=0;i<4;i++)beam([w/3,.15+i*.12,front],[w/3+1,.15+i*.12,front],.07,C.wood)}
    if(a.kind==='poor-patched')for(let i=0;i<3;i++){
      const px=-1+i*.7,pz=-d*.35,t=Math.abs(pz)/((d+1.9)/2),u=px/((w+1.8)/2)
      const patch=box(.55,.08,.4,px,3.45+roofHeight(w+1.8,t,u)+.07,pz,'#aaa28b')
      const slope=(roofHeight(w+1.8,t+.01,u)-roofHeight(w+1.8,t-.01,u))/.02/((d+1.9)/2)
      patch.rotation.x=Math.atan(slope)
    }
  }
  if(a.kind==='common-twin'){jar(w*.125,front);box(.9,.15,.5,-w*.375,.6,front);for(const dx of [-.3,.3])box(.1,.55,.35,-w*.375+dx,.275,front)}
  if(a.kind==='common-loft'||a.kind==='comfort-shop') {
    const width=a.kind==='common-loft'?w*.55:w
    box(width,.18,1,0,3.8,front)
    for(let x=-width/2;x<=width/2;x+=.6)box(.07,.8,.07,x,4.25,front-.45)
    box(width,.09,.1,0,4.65,front-.45)
    for(const side of [-1,1])box(.08,.09,1,side*width/2,4.65,front)
    if(a.kind==='comfort-shop'){table(w/3,front-.4);plant(-w/3,front)}
  }
  if(a.wealth==='comfort'||a.wealth==='rich')for(const side of [-1,1])plant(side*(w/2-1),front-.2,true)
  if(a.wealth==='rich') {
    if(a.kind==='rich-garden'){roof(3.5,3.5,2,2.4,1);for(const x of [.7,3.3])for(const z of [-.3,2.3])cyl(.07,2.4,x,1.2,z);plant(-2,1,true)}
  }
  if(home) {
    if(['common-loft','balcony','poor-patched'].includes(a.kind)) {
      const upper=a.floors>1,y=upper?5.25:2.1,z=front-(upper?.8:.5),cx=upper?0:-w/3
      for(const x of [-.85,.85])box(.055,upper?1.4:2.1,.055,cx+x,upper?4.6:1.05,z)
      beam([cx-.85,y,z],[cx+.85,y,z],.025,C.wood)
      for(let i=0;i<2;i++)box(.5,.72,.05,cx-.45+i*.85,y-.36,z-.035,i?'#8baebc':'#c48f7e')
    }
    if(['scholar','rich-library'].includes(a.kind)) {
      // 书案放在院内/侧边，立面窗户前保持净空。
      const x=a.kind==='scholar'?w/2+1:1.8,z=0
      table(x,z)
      for(let i=0;i<3;i++)box(.48,.10,.34,x,1.15+i*.11,z,i%2?'#8aa4a2':'#ddcfac')
    }
    if(['common-wing','comfort-garden','garden'].includes(a.kind)) {
      const x=w/2-1.25,z=-d/2+1.4
      jar(x,z);plant(x-1.1,z,true)
      box(2,.12,.5,x-.5,.55,z+1)
      for(const dx of [-.8,.8])box(.12,.5,.35,x-.5+dx,.25,z+1)
    }
    if(['comfort-garden','garden','rich-garden'].includes(a.kind)) {
      const x=a.kind==='rich-garden'?-2:w/2-1.5,z=-.5
      cyl(.12,2,x,1,z)
      for(let i=0;i<3;i++) {
        const crown=MeshBuilder.CreateSphere('courtyard-flowering-tree',{diameter:1.2,segments:4},scene)
        crown.position.set(x+Math.cos(i*2.1)*.42,2.1+i*.2,z+Math.sin(i*2.1)*.42)
        crown.material=material(a.kind==='garden'?'#dfb1b0':'#a9c788');parts.push(crown)
      }
    }
    if(a.kind==='rich-court') {
      // 朱门两扇靠门柱敞开，保留中央通路。
      for(const side of [-1,1]) {
        box(.18,2.65,1.45,side*1.85,1.55,front+.75,'#a35f4c')
        for(let i=0;i<3;i++)cyl(.055,.08,side*1.72,1.1+i*.55,front+.6,C.gold)
      }
    }
    if(a.kind==='rich-garden')for(let i=0;i<3;i++) {
      const rock=MeshBuilder.CreateSphere('garden-scholar-rock',{diameter:1,segments:3},scene)
      rock.position.set(-1.7+i*.6,.4+i*.1,2);rock.scaling.set(.65,.8+i*.3,.7)
      rock.material=material(C.stone);parts.push(rock)
    }
  }
  for(const m of parts)m.computeWorldMatrix(true)
  const groups=new Map()
  for(const m of parts){if(!groups.has(m.material))groups.set(m.material,[]);groups.get(m.material).push(m)}
  return Mesh.MergeMeshes([...groups.values()].map(group=>Mesh.MergeMeshes(group,true,true)),true,true,undefined,false,true)
}
