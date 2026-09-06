import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { fortificationDefinitions } from './catalog.js'

// 每种模型合并为共享模板，再由区块实例化；砖缝和瓦脊不产生额外碰撞。
export function createFortificationModel(scene, assetId, material) {
  const parts = []
  const C = { stone:'#737e7c', base:'#566361', seam:'#505c5b', coping:'#a2aaa0', red:'#652c25', beam:'#422e29', tile:'#344c4a', tileLight:'#59716a', gold:'#b39960', dark:'#252e2c' }
  const surface=color=>[C.stone,C.base,C.coping].includes(color)?'stone':[C.red,C.beam].includes(color)?'wood':color===C.tile?'tile':color===C.gold?'metal':null
  function finish(m,color) {m.material=material(color,surface(color));parts.push(m);return m}
  function tube(name,path,r,color) {return finish(MeshBuilder.CreateTube(name,{path:path.map(p=>new Vector3(...p)),radius:r,tessellation:6,cap:3},scene),color)}
  function box(name, w, h, d, x, y, z, color, rotation = 0) {
    const m = MeshBuilder.CreateBox(name, { width:w, height:h, depth:d }, scene)
    m.position.set(x,y,z); m.rotation.y=rotation; finish(m,color)
    return m
  }
  function cylinder(name, diameter, height, x,y,z,color) {
    const m=MeshBuilder.CreateCylinder(name,{diameter,height,tessellation:10},scene)
    m.position.set(x,y,z);finish(m,color);return m
  }
  function roof(name, w,d,y,rise) {
    const positions=[],indices=[]
    const ring=(width,depth,height,upturn) => [[-1,-1],[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0]].forEach(([x,z])=>positions.push(x*width/2,height+(x&&z?upturn:0),z*depth/2))
    ring(w,d,y,0.75); ring(w*0.8,d*0.78,y+0.65,0.15); ring(w*0.5,0.9,y+rise,0)
    for(let layer=0;layer<2;layer++)for(let i=0;i<8;i++) {
      const a=layer*8+i,b=layer*8+(i+1)%8,c=a+8,e=b+8
      indices.push(a,b,c,b,e,c)
    }
    for(let i=1;i<7;i++)indices.push(16,16+i,17+i)
    const topIndices=[...indices],count=positions.length/3
    for(let i=0;i<count;i++)positions.push(positions[i*3],positions[i*3+1]-.16,positions[i*3+2])
    for(let i=0;i<topIndices.length;i+=3)indices.push(topIndices[i]+count,topIndices[i+2]+count,topIndices[i+1]+count)
    for(let i=0;i<8;i++){const j=(i+1)%8;indices.push(i,j,i+count,j,j+count,i+count)}
    const normals=[];VertexData.ComputeNormals(positions,indices,normals)
    const mesh=new Mesh(name,scene), data=new VertexData()
    data.positions=positions;data.indices=indices;data.normals=normals;data.uvs=new Array(positions.length/3*2).fill(0);data.applyToMesh(mesh)
    finish(mesh,C.tile);mesh.material.backFaceCulling=false
    box(`${name}-ridge`,w*0.54,0.4,0.55,0,y+rise+0.15,0,C.gold)
    for(const side of [-1,1]) {
      box(`${name}-eave`,w,0.22,0.3,0,y+0.08,side*d/2,C.tileLight)
      for(const x of [-w/2,w/2]) {
        cylinder(`${name}-finial`,0.45,1,x,y+0.95,side*d/2,C.gold)
      }
      // 瓦垄沿坡伸展，采用少量粗线条保证远景辨识度。
      for(let x=-w*0.4;x<=w*0.4+.01;x+=1) {
        const u=x/(w*.4)
        tube(`${name}-tile-rib`,[[u*w*.25,y+rise+.035,side*.45],[u*w*.4,y+.65+.15*Math.abs(u)+.035,side*d*.39],[u*w*.5,y+.75*Math.abs(u)+.035,side*d*.5]],.065,C.tileLight)
      }
    }
  }
  function crenels(length,z,y) {
    for(let x=-length/2+1.4;x<length/2;x+=3.2) box('crenel',1.8,1.6,1.15,x,y,z,C.stone)
  }
  function stoneCourses(length,depth,height) {
    for(let y=1.6;y<height;y+=2)for(const side of [-1,1]) {
      box('stone-course',length,0.055,0.045,0,y,side*(depth/2+0.025),C.seam)
      for(let x=-length/2+((Math.round(y)%2)?1:2.5);x<length/2;x+=5) box('stone-joint',0.06,1.8,0.05,x,y-0.9,side*(depth/2+0.04),C.seam)
    }
  }
  function pavilion(width,depth,floor,height) {
    box('tower-hall',width-3,height,depth-3,0,floor+height/2,0,C.red)
    for(const side of [-1,1]) {
      for(let x=-width/2+1;x<=width/2;x+=4) {
        cylinder('vermilion-column',0.65,height,x,floor+height/2,side*(depth/2-0.6),C.red)
        box('bracket-block',1.3,0.45,1.6,x,floor+height-0.4,side*(depth/2-0.6),C.gold)
        box('bracket-arm',2,0.3,1.9,x,floor+height-0.1,side*(depth/2-0.6),C.beam)
      }
      box('gold-lintel',width,0.28,0.3,0,floor+height-0.6,side*depth/2,C.gold)
      for(let x=-width/2+3;x<width/2-1;x+=4) {
        box('lattice-window',2.2,height*0.56,0.12,x,floor+height*0.53,side*(depth/2-1.42),C.dark)
        for(const offset of [-0.7,0,0.7]) box('window-lattice',0.08,height*0.56,0.17,x+offset,floor+height*0.53,side*(depth/2-1.38),C.gold)
      }
    }
  }
  if (assetId.startsWith('fort.wall')) {
    const length=fortificationDefinitions[assetId].length
    box('buried-foundation',length,4,10,0,-1.5,0,C.base)
    box('great-curtain-wall',length,12,8,0,6,0,C.stone)
    box('stone-walkway',length,0.5,9,0,12.1,0,C.coping)
    for(const side of [-1,1]) {
      box('parapet',length,0.8,1.2,0,12.55,side*3.9,C.stone)
      crenels(length,side*3.9,13.45)
    }
    stoneCourses(length,8,12)
  } else if(assetId==='fort.gate') {
    for(const side of [-1,1]) {
      box('gate-foundation',12,4,22,side*12,-1.5,0,C.base)
      box('gate-stone-pier',12,14,20,side*12,7,0,C.stone)
      for(const front of [-1,1]) {
        box('pier-plinth',12,1.2,0.65,side*12,0.6,front*10,C.coping)
        for(let y=2;y<14;y+=2) box('pier-course',12,0.06,0.05,side*12,y,front*10.04,C.seam)
        // 门扇沿门洞侧壁敞开，留下完整通道。
        box('open-gate-leaf',0.32,4.8,5.6,side*5.72,2.4,front*6.8,C.red)
        for(const y of [.65,2.35,4.1])box('door-iron-strap',.10,.18,5.5,side*5.51,y,front*6.8,C.beam)
        for(let row=0;row<4;row++)for(let col=0;col<5;col++) {
          const stud=cylinder('bronze-door-stud',.16,.14,side*5.46,.7+row*1.1,front*(4.5+col*1.05),C.gold);stud.rotation.z=Math.PI/2
        }
        box('door-lock-plate',.12,.75,.55,side*5.48,2.2,front*5,C.gold)
        const ring=MeshBuilder.CreateTorus('bronze-door-ring',{diameter:.48,thickness:.075,tessellation:16},scene)
        ring.rotation.z=Math.PI/2;ring.position.set(side*5.34,2.05,front*5);finish(ring,C.gold)
        for(const y of [.6,2.4,4.2])cylinder('door-hinge',.22,.55,side*5.75,y,front*9.45,C.gold)
      }
    }
    // 半圆拱顶由楔形石块构成，门洞中间不放实心立方体。
    for(let i=0;i<16;i++) {
      const a=i*Math.PI/16+.002,b=(i+1)*Math.PI/16-.002,positions=[],indices=[]
      for(const z of [-10,10])for(const [r,t] of [[6,a],[8,a],[8,b],[6,b]])positions.push(Math.cos(t)*r,5+Math.sin(t)*r,z)
      for(const face of [[0,1,2,3],[7,6,5,4],[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0]])indices.push(face[0],face[1],face[2],face[0],face[2],face[3])
      const normals=[];VertexData.ComputeNormals(positions,indices,normals)
      const m=new Mesh('arch-voussoir',scene),data=new VertexData();data.positions=positions;data.indices=indices;data.normals=normals;data.uvs=new Array(positions.length/3*2).fill(0);data.applyToMesh(m);m.convertToFlatShadedMesh();m.material=material(i%2?C.coping:C.stone,'cutstone');parts.push(m)
    }
    box('gate-upper-lintel',12,2,20,0,13,0,C.stone)
    box('gate-terrace',38,0.6,22,0,14.3,0,C.coping)
    // 石墩收边与城台栏杆形成层次，不堵住门洞和原有通行路线。
    for(const front of [-1,1]) {
      for(const side of [-1,1]) {
        for(const x of [side*6.45,side*17.55]) {
          box('pier-edge-pilaster',.65,12.1,.38,x,7,front*10.16,C.coping)
          box('pier-capital',1,.4,.6,x,13.15,front*10.2,C.coping)
        }
        box('terrace-rail',10,.16,.20,side*13.8,15.8,front*10.5,C.coping)
        for(let i=0;i<5;i++) {
          const x=side*(9.4+i*2.2)
          box('terrace-baluster',.24,1.2,.24,x,15.2,front*10.5,C.stone)
          box('baluster-cap',.4,.16,.4,x,15.88,front*10.5,C.coping)
        }
      }
      box('arch-keystone',.8,1.3,.3,0,12.25,front*10.16,C.coping)
      for(const side of [-1,1]) {
        tube('lantern-hanger',[[side*9,14.15,front*10.6],[side*9,14.15,front*11.4],[side*9,13.85,front*11.4]],.055,C.beam)
        cylinder('lantern-lower-cap',1,.14,side*9,12.4,front*11.4,C.gold)
        tube('lantern-tassel',[[side*9,12.35,front*11.4],[side*9,11.95,front*11.4]],.06,C.red)
      }
    }
    pavilion(32,18,14.6,4)
    roof('lower-swept-roof',42,28,18.5,3.4)
    pavilion(22,13,21,3.5)
    roof('upper-swept-roof',30,22,24.4,3.5)
    for(const front of [-1,1]) {
      box('gate-plaque',6,1.7,0.3,0,16.5,front*9.1,C.dark)
      box('plaque-gold-top',6.2,0.14,0.4,0,17.4,front*9.1,C.gold)
      box('plaque-gold-bottom',6.2,.12,.4,0,15.62,front*9.1,C.gold)
      for(const x of [-3,3])box('plaque-frame',.12,1.8,.4,x,16.5,front*9.1,C.gold)
      for(const x of [-2.5,2.5])box('plaque-mount',.18,.18,1.7,x,17.3,front*8.4,C.beam)
      // 几何山形纹章与回纹边饰，不依赖字体或额外绘制文字。
      for(const x of [-1.4,0,1.4]) {
        tube('plaque-mountain',[[x-.48,16.15,front*9.31],[x,16.85,front*9.31],[x+.48,16.15,front*9.31]],.065,C.gold)
        box('plaque-relief-base',1,.09,.08,x,16.1,front*9.31,C.gold)
      }
      for(const side of [-1,1]) {
        cylinder('red-lantern',0.9,1.4,side*9,13.1,front*11.4,C.red)
        cylinder('lantern-gold-cap',1,0.18,side*9,13.8,front*11.4,C.gold)
      }
    }
  } else if(assetId==='fort.corner') {
    box('corner-foundation',20,4,20,0,-1.5,0,C.base)
    box('corner-bastion',20,14.5,20,0,7.25,0,C.stone)
    box('corner-terrace',21,0.6,21,0,14.6,0,C.coping)
    stoneCourses(20,20,14)
    pavilion(17,17,14.9,4)
    roof('corner-swept-roof',24,24,18.8,4)
  } else throw new Error(`未知城防资产：${assetId}`)
  for(const mesh of parts) {
    mesh.bakeCurrentTransformIntoVertices()
    const p=mesh.getVerticesData('position'),n=mesh.getVerticesData('normal'),uv=[]
    const wood=mesh.material.name.startsWith('fort:wood'),tile=mesh.material.name.startsWith('fort:tile')
    const scaleU=wood?2:tile?4:4,scaleV=wood?4:tile?4:2
    for(let i=0;i<p.length;i+=3) {
      const ax=Math.abs(n[i]),ay=Math.abs(n[i+1]),az=Math.abs(n[i+2])
      const horizontal=ay>ax&&ay>az
      uv.push((horizontal?p[i]:ax>az?p[i+2]:p[i])/scaleU,(horizontal?p[i+2]:p[i+1])/scaleV)
    }
    mesh.setVerticesData('uv',uv);mesh.computeWorldMatrix(true)
  }
  const groups = new Map()
  for (const part of parts) {
    if (!groups.has(part.material)) groups.set(part.material, [])
    groups.get(part.material).push(part)
  }
  const merged = [...groups.values()].map(group => Mesh.MergeMeshes(group,true,true))
  return Mesh.MergeMeshes(merged,true,true,undefined,false,true)
}
