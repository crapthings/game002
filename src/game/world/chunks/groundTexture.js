// 每区块一张 256² 纹理，Worker 内计算；全局坐标保证石板与草地跨区块连续。
export const GROUND_TEXTURE_SIZE = 256
const fract = n => n - Math.floor(n)
const hash = (x,z) => fract(Math.sin(x*127.1+z*311.7)*43758.5453)
const clamp = v => Math.max(0,Math.min(1,v))
export function groundTexture(terrain,cx,cz,colors) {
  const size=GROUND_TEXTURE_SIZE,pixels=new Uint8Array(size*size*4)
  // 抖动种子点形成大小不一的铺石；缓存邻域点，不逐像素重复计算随机数。
  const firstX=Math.floor(cx*32/1.05)-1,firstZ=Math.floor(cz*32/.8)-1
  const columns=Math.floor((cx+1)*32/1.05)-firstX+2,rows=Math.floor((cz+1)*32/.8)-firstZ+2
  const sites=[]
  for(let j=0;j<rows;j++)for(let i=0;i<columns;i++) {
    const ix=firstX+i,iz=firstZ+j
    sites.push({x:(ix+.15+hash(ix,iz)*.7)*1.05,z:(iz+.15+hash(ix+31,iz-17)*.7)*.8,tone:hash(ix-8,iz+43)-.5})
  }
  const site=(ix,iz)=>sites[(iz-firstZ)*columns+ix-firstX]
  for(let j=0;j<size;j++)for(let i=0;i<size;i++) {
    const x=cx*32+(i+.5)*32/size,z=cz*32+(j+.5)*32/size
    const gx=(i+.5)*32/size,gz=(j+.5)*32/size,ix=Math.floor(gx),iz=Math.floor(gz),tx=gx-ix,tz=gz-iz
    const natural=[0,1,2].map(k=>{
      const a=colors[(iz*33+ix)*4+k],b=colors[(iz*33+ix+1)*4+k]
      const c=colors[((iz+1)*33+ix)*4+k],d=colors[((iz+1)*33+ix+1)*4+k]
      return a*(1-tx)*(1-tz)+b*tx*(1-tz)+c*(1-tx)*tz+d*tx*tz
    })
    const road=terrain.nearbyRoad(x,z),edge=road.distance-road.width/2
    const plaza=terrain.plan?.city?.plaza
    const square=plaza&&x>plaza.minX&&x<plaza.maxX&&z>plaza.minZ&&z<plaza.maxZ
    const blend=square?1:clamp((.3-edge)/.6)*road.fade
    const grain=hash(Math.floor(x*17),Math.floor(z*17))-.5
    let closest=Infinity,next=Infinity,tone=0
    const column=Math.floor(x/1.05),row=Math.floor(z/.8)
    if(blend>0)for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++) {
      const p=site(column+dx,row+dz),distance=(p.x-x)**2+(p.z-z)**2
      if(distance<closest){next=closest;closest=distance;tone=p.tone}
      else if(distance<next)next=distance
    }
    const edgeDistance=blend>0?(next-closest)/(Math.sqrt(next)+Math.sqrt(closest)+.001):1
    const joint=1-clamp((edgeDistance-.015)/.07)
    const moss=clamp((Math.sin(x*.7+Math.sin(z*.4))+Math.cos(z*.6)-1)*.5)
    const slab=[.62+tone*.085,.64+tone*.08,.57+tone*.07]
    const seam=[.46-moss*.025,.50+moss*.025,.42-moss*.02]
    const stone=slab.map((v,k)=>v*(1-joint)+seam[k]*joint)
    const grass=hash(Math.floor(x*3),Math.floor(z*3))-.5
    for(let k=0;k<3;k++) {
      const land=natural[k]+grass*.065+grain*.045
      pixels[(j*size+i)*4+k]=Math.round(clamp(land*(1-blend)+(stone[k]+grain*.035)*blend)*255)
    }
    pixels[(j*size+i)*4+3]=255
  }
  return pixels
}
