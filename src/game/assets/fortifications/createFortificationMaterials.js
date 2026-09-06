import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture'
import { Texture } from '@babylonjs/core/Materials/Textures/texture'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'

// 贴图仅创建一次；米制 UV + mipmaps，实例旋转不改变纹理比例。
export function createFortificationMaterials(scene,plain) {
  const materials=new Map(),textures=new Map(),size=256
  const hash=(x,y)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n)}
  function maps(kind) {
    if(textures.has(kind))return textures.get(kind)
    const color=new Uint8Array(size*size*4),normal=new Uint8Array(size*size*4),heights=new Float32Array(size*size)
    for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
      const u=x/size,v=y/size,noise=hash(x,y),i=y*size+x
      let value=.9,height=.5
      if(kind==='stone') {
        const row=Math.floor(v*4),xx=(u*4+(row%2)*.5)%1,yy=(v*4)%1
        const edge=Math.min(xx,1-xx,yy,1-yy),bevel=Math.min(1,edge/.045)
        const brick=hash(Math.floor(u*4+(row%2)*.5)%4,row)
        height=.22+.48*bevel+(noise-.5)*.035
        value=(.73+brick*.23+(noise-.5)*.09)*(.70+.30*bevel)
      } else if(kind==='cutstone') {
        height=.5+(noise-.5)*.035
        value=.89+(noise-.5)*.09+Math.sin(u*Math.PI*4)*Math.sin(v*Math.PI*2)*.025
      } else if(kind==='wood') {
        const grain=Math.sin(u*115+Math.sin(v*Math.PI*2)*2+Math.sin(v*Math.PI*6)*.6)
        const seam=Math.min((u*4)%1,1-(u*4)%1)<.018
        height=seam?.2:.52+grain*.025
        value=seam?.48:.86+grain*.055+(noise-.5)*.045
      } else {
        const wave=Math.cos(u*Math.PI*16),seam=(v*8)%1<.035
        height=.5+wave*.12-(seam?.10:0)
        value=.86+wave*.07+(noise-.5)*.055-(seam?.08:0)
      }
      heights[i]=height
      color.set([value*255,value*255,value*255,255],i*4)
    }
    for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
      const sample=(dx,dy)=>heights[((y+dy+size)%size)*size+(x+dx+size)%size]
      const nx=(sample(-1,0)-sample(1,0))*2,ny=(sample(0,-1)-sample(0,1))*2,nz=1,length=Math.hypot(nx,ny,nz)
      normal.set([(nx/length*.5+.5)*255,(ny/length*.5+.5)*255,(nz/length*.5+.5)*255,255],(y*size+x)*4)
    }
    const make=data=>RawTexture.CreateRGBATexture(data,size,size,scene,true,false,Texture.TRILINEAR_SAMPLINGMODE)
    const diffuse=make(color),bump=make(normal);bump.gammaSpace=false
    for(const texture of [diffuse,bump]){texture.wrapU=texture.wrapV=Texture.WRAP_ADDRESSMODE;texture.anisotropicFilteringLevel=4}
    const result={diffuse,bump};textures.set(kind,result);return result
  }
  return {
    get(color,kind) {
      if(!kind)return plain(color)
      const key=`${kind}:${color}`
      if(!materials.has(key)) {
        const m=new StandardMaterial(`fort:${key}`,scene)
        m.diffuseColor=Color3.FromHexString(color)
        m.specularColor=Color3.FromHexString(kind==='metal'?'#8a795b':kind==='tile'?'#27332e':'#101512')
        m.specularPower=kind==='metal'?40:kind==='tile'?28:8
        if(kind!=='metal'){const texture=maps(kind);m.diffuseTexture=texture.diffuse;m.bumpTexture=texture.bump;m.bumpTexture.level=kind==='stone'?.65:.35}
        materials.set(key,m)
      }
      return materials.get(key)
    },
    dispose(){for(const m of materials.values())m.dispose();for(const pair of textures.values()){pair.diffuse.dispose();pair.bump.dispose()}materials.clear();textures.clear()},
  }
}
