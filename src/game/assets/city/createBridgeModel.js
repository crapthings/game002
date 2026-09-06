import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
export function createBridgeModel(scene,id,material) {
  const stone=id==='city.bridge-stone',w=stone?12:8,parts=[]
  const box=(width,height,depth,x,y,z,color)=>{
    const m=MeshBuilder.CreateBox('bridge-component',{width,height,depth},scene)
    m.position.set(x,y,z);m.material=material(color);parts.push(m)
  }
  // 路面顶部为本地 Y=0，与两岸步行高度一致。
  box(w,.35,18,0,-.175,0,stone?'#c1c9b7':'#b7986c')
  for(let z=-8.8;z<9;z+=stone?1.5:.55)box(w,.015,.035,0,.012,z,stone?'#99ab9e':'#806c51')
  for(const side of [-1,1]) {
    for(let z=-8.5;z<=8.5;z+=2.125){box(.24,1.25,.24,side*(w/2+.12),.625,z,stone?'#bac6b3':'#9c815c');box(.38,.12,.38,side*(w/2+.12),1.3,z,'#d0c799')}
    box(.18,.15,18,side*(w/2+.12),1.1,0,stone?'#cdd2bc':'#b39a6b')
    box(.12,.12,18,side*(w/2+.12),.5,0,stone?'#a5b6a6':'#9c815c')
    for(const z of [-5,5])box(.65,2,.65,side*(w/2-.6),-1.25,z,stone?'#899e92':'#7c705c')
  }
  for(const p of parts)p.computeWorldMatrix(true)
  const groups=new Map()
  for(const p of parts){if(!groups.has(p.material))groups.set(p.material,[]);groups.get(p.material).push(p)}
  return Mesh.MergeMeshes([...groups.values()].map(g=>Mesh.MergeMeshes(g,true,true)),true,true,undefined,false,true)
}
