import { createRandom } from '../generation/random.js'

// 数量为单城上限；小城由区域级设施服务，不复制整套大型公共建筑。
export const urbanProfiles = {
  small: { maxBuildings: 24, facilities: { clinic: 1, police: 1 }, jitter: 3 },
  medium: { maxBuildings: 64, facilities: { clinic: 1, police: 1, school: 1, 'fire-station': 1 }, jitter: 2.5 },
  large: { maxBuildings: 120, facilities: { clinic: 1, police: 1, hospital: 1, school: 1, 'fire-station': 1 }, jitter: 2 },
}
export const districtProfiles = {
  residential: { coverage: 0.34, gap: 2.2, spacing: 18, models: ['house','house','narrow-house','garden-house','townhouse','row-homes','long-apartments','apartments'] },
  commercial: { coverage: 0.44, gap: 1.5, spacing: 16, models: ['corner-store','diner','market-hall','townhouse','row-homes'] },
  industrial: { coverage: 0.30, gap: 4, spacing: 24, models: ['workshop','warehouse','deep-workshop'] },
  civic: { coverage: 0.24, gap: 4, spacing: 22, models: ['house','garden-house'] },
}

export function createUrbanBlocks(seed, region, profile, townId) {
  const random = createRandom(seed,region.id,'districts-v2')
  const edge=Math.floor(random()*4), cuts=profile.cuts, n=cuts.length-1
  const outward = region.growth === 'center-out'
  const outerIndices = Array.from({ length: n * n }, (_, index) => index).filter(index => Math.floor(index / n) === 0 || Math.floor(index / n) === n - 1 || index % n === 0 || index % n === n - 1)
  const parkIndex = n > 2 ? (outward ? outerIndices[Math.floor(random() * outerIndices.length)] : Math.floor(random() * n * n)) : -1
  const blocks=[]
  for(let row=0;row<n;row+=1) for(let column=0;column<n;column+=1) {
    const bounds={minX:region.center[0]+cuts[column],maxX:region.center[0]+cuts[column+1],minZ:region.center[1]+cuts[row],maxZ:region.center[1]+cuts[row+1]}
    const industrial=[row===0,column===n-1,row===n-1,column===0][edge]
    const central=Math.abs((cuts[column]+cuts[column+1])/2)<profile.span*0.23 || Math.abs((cuts[row]+cuts[row+1])/2)<profile.span*0.23
    const centerDistance = Math.hypot((cuts[column] + cuts[column + 1]) / 2, (cuts[row] + cuts[row + 1]) / 2)
    const core = Math.max(Math.abs((cuts[column] + cuts[column + 1]) / 2), Math.abs((cuts[row] + cuts[row + 1]) / 2)) < profile.span / 4
    const kind = outward
      ? core ? 'commercial' : row * n + column === parkIndex ? 'park' : industrial ? 'industrial' : 'residential'
      : row*n+column===parkIndex?'park':industrial?'industrial':central&&random()<0.65?'commercial':'residential'
    blocks.push({id:`${townId}/block:${row}:${column}`,kind,bounds,parcels:[], ...(outward ? { centerDistance, growthRing: core ? 0 : 1, density: core ? 1 : 0.65 } : {})})
  }
  return outward ? blocks.sort((a, b) => a.centerDistance - b.centerDistance || a.id.localeCompare(b.id)) : blocks
}

// 候选点沿街区边缘分段，间距不固定；空缺路边由实际道路投影检查剔除。
export function frontageCandidates(block, random, spacing) {
  const b=block.bounds, points=[]
  for(let side=0;side<4;side+=1) {
    const horizontal=side%2===0, start=horizontal?b.minX:b.minZ,end=horizontal?b.maxX:b.maxZ
    for(let cursor=start+12+random()*4;cursor<end-10;cursor+=spacing*(0.8+random()*0.4)) {
      points.push(horizontal?[cursor,side===0?b.minZ+10:b.maxZ-10]:[side===1?b.maxX-10:b.minX+10,cursor])
    }
  }
  return points
}
