import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { fortificationDefinitions } from './catalog.js'

// 每种模型合并为共享模板，再由区块实例化；砖缝和瓦脊不产生额外碰撞。
export function createFortificationModel(scene, assetId, material) {
  const parts = []
  const C = { stone:'#737e7c', base:'#566361', seam:'#505c5b', coping:'#a2aaa0', red:'#652c25', beam:'#422e29', tile:'#344c4a', tileLight:'#59716a', gold:'#b39960', dark:'#252e2c' }
  function box(name, w, h, d, x, y, z, color, rotation = 0) {
    const m = MeshBuilder.CreateBox(name, { width:w, height:h, depth:d }, scene)
    m.position.set(x,y,z); m.rotation.y=rotation; m.material=material(color); parts.push(m)
    return m
  }
  function cylinder(name, diameter, height, x,y,z,color) {
    const m=MeshBuilder.CreateCylinder(name,{diameter,height,tessellation:10},scene)
    m.position.set(x,y,z);m.material=material(color);parts.push(m)
  }
  function roof(name, w,d,y,rise) {
    const positions=[],indices=[]
    const ring=(width,depth,height,upturn) => [[-1,-1],[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0]].forEach(([x,z])=>positions.push(x*width/2,height+(x&&z?upturn:0),z*depth/2))
    ring(w,d,y,0.75); ring(w*0.8,d*0.78,y+0.65,0.15); ring(w*0.5,0.9,y+rise,0)
    for(let layer=0;layer<2;layer++)for(let i=0;i<8;i++) {
      const a=layer*8+i,b=layer*8+(i+1)%8,c=a+8,e=b+8
      indices.push(a,b,c,b,e,c)
    }
    const normals=[];VertexData.ComputeNormals(positions,indices,normals)
    const mesh=new Mesh(name,scene), data=new VertexData()
    data.positions=positions;data.indices=indices;data.normals=normals;data.uvs=new Array(positions.length/3*2).fill(0);data.applyToMesh(mesh)
    mesh.material=material(C.tile);mesh.material.backFaceCulling=false;parts.push(mesh)
    box(`${name}-ridge`,w*0.54,0.4,0.55,0,y+rise+0.15,0,C.gold)
    for(const side of [-1,1]) {
      box(`${name}-eave`,w,0.22,0.3,0,y+0.08,side*d/2,C.tileLight)
      for(const x of [-w/2,w/2]) {
        cylinder(`${name}-finial`,0.45,1,x,y+0.95,side*d/2,C.gold)
      }
      // 瓦垄沿坡伸展，采用少量粗线条保证远景辨识度。
      for(let x=-w*0.4;x<=w*0.4;x+=2) {
        const rib=box(`${name}-tile-rib`,0.10,0.12,d*0.37,x,y+0.85,side*d*0.3,C.tileLight)
        rib.rotation.x=side*0.3
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
        box('open-gate-leaf',0.32,6.5,6,side*6.3,3.25,front*4.7,C.red)
        for(let row=0;row<5;row++)for(let col=0;col<4;col++) cylinder('bronze-door-stud',0.15,0.18,side*6.05,1+row,front*(2+col*1.2),C.gold)
      }
    }
    // 半圆拱顶由楔形石块构成，门洞中间不放实心立方体。
    for(let i=0;i<16;i++) {
      const a=i*Math.PI/16,b=(i+1)*Math.PI/16,positions=[],indices=[]
      for(const z of [-10,10])for(const [r,t] of [[6,a],[8,a],[8,b],[6,b]])positions.push(Math.cos(t)*r,5+Math.sin(t)*r,z)
      for(const face of [[0,1,2,3],[7,6,5,4],[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0]])indices.push(face[0],face[1],face[2],face[0],face[2],face[3])
      const normals=[];VertexData.ComputeNormals(positions,indices,normals)
      const m=new Mesh('arch-voussoir',scene),data=new VertexData();data.positions=positions;data.indices=indices;data.normals=normals;data.uvs=new Array(positions.length/3*2).fill(0);data.applyToMesh(m);m.convertToFlatShadedMesh();m.material=material(i%2?C.coping:C.stone);parts.push(m)
    }
    box('gate-upper-lintel',12,2,20,0,13,0,C.stone)
    box('gate-terrace',38,0.6,22,0,14.3,0,C.coping)
    pavilion(32,18,14.6,4)
    roof('lower-swept-roof',42,28,18.5,3.4)
    pavilion(22,13,21,3.5)
    roof('upper-swept-roof',30,22,24.4,3.5)
    for(const front of [-1,1]) {
      box('gate-plaque',6,1.7,0.3,0,16.5,front*9.1,C.dark)
      box('plaque-gold-top',6.2,0.14,0.4,0,17.4,front*9.1,C.gold)
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
  for(const mesh of parts) mesh.computeWorldMatrix(true)
  const groups = new Map()
  for (const part of parts) {
    if (!groups.has(part.material)) groups.set(part.material, [])
    groups.get(part.material).push(part)
  }
  const merged = [...groups.values()].map(group => Mesh.MergeMeshes(group,true,true))
  return Mesh.MergeMeshes(merged,true,true,undefined,false,true)
}
