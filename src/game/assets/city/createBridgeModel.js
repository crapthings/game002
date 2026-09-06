import { bridgeHeight } from '../../world/city/bridgeProfile.js'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
export function createBridgeModel(scene,id,material) {
  const stone=id==='city.bridge-stone',w=stone?12:8,parts=[]
  const box=(width,height,depth,x,y,z,color)=>{
    const m=MeshBuilder.CreateBox('bridge-component',{width,height,depth},scene)
    m.position.set(x,y,z);m.material=material(color);parts.push(m)
  }
  // 连续拱面，顶面与碰撞剖面共用同一组采样点。
  const positions=[],indices=[]
  for(let z=-9;z<=9;z++) {
    const y=bridgeHeight(z)
    positions.push(-w/2,y,z,w/2,y,z,-w/2,y-.4,z,w/2,y-.4,z)
  }
  for(let i=0;i<18;i++) {
    const a=i*4,b=a+4
    indices.push(a,b,a+1,a+1,b,b+1,a+2,a+3,b+2,a+3,b+3,b+2,a,a+2,b,a+2,b+2,b,a+1,b+1,a+3,a+3,b+1,b+3)
  }
  indices.push(0,1,2,1,3,2,72,74,73,73,74,75)
  const deck=new Mesh('arched-bridge-deck',scene),data=new VertexData(),normals=[]
  for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]]
  VertexData.ComputeNormals(positions,indices,normals)
  data.positions=positions;data.indices=indices;data.normals=normals;data.uvs=new Array(positions.length/3*2).fill(0);data.applyToMesh(deck)
  deck.material=material(stone?'#c1c9b7':'#b7986c');deck.material.backFaceCulling=false;parts.push(deck)
  for(let z=-9;z<9;z++) {
    box(w,.018,.035,0,bridgeHeight(z)+.015,z,stone?'#a9b6a6':'#947d5e')
  }
  for(const side of [-1,1]) {
    for(let z=-9;z<=9;z+=2.25) {
      const y=bridgeHeight(z)
      box(.24,1.1,.24,side*(w/2+.12),y+.55,z,stone?'#bac6b3':'#9c815c')
      box(.38,.12,.38,side*(w/2+.12),y+1.15,z,'#d0c799')
    }
    for(const height of [.45,1.05]) {
      const path=[]
      for(let z=-9;z<=9;z++)path.push(new Vector3(side*(w/2+.12),bridgeHeight(z)+height,z))
      const rail=MeshBuilder.CreateTube('curved-bridge-rail',{path,radius:.095,tessellation:6,cap:3},scene)
      rail.material=material(stone?'#cdd2bc':'#b39a6b');parts.push(rail)
    }
    for(const z of [-7,7])box(.7,1.7,.9,side*(w/2-.6),bridgeHeight(z)-1.25,z,stone?'#899e92':'#7c705c')
  }
  for(const p of parts)p.computeWorldMatrix(true)
  const groups=new Map()
  for(const p of parts){if(!groups.has(p.material))groups.set(p.material,[]);groups.get(p.material).push(p)}
  return Mesh.MergeMeshes([...groups.values()].map(g=>Mesh.MergeMeshes(g,true,true)),true,true,undefined,false,true)
}
