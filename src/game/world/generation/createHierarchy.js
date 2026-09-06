import { WORLD_SIZE, WORLD_BOUNDS, insideRegion } from '../worldConfig.js'
import { createRandom } from './random.js'

const palettes = {
  forest: ['woodland', 'woodland', 'meadow', 'scrubland'],
  lowland: ['wetland', 'wetland', 'meadow', 'woodland'],
  rural: ['farmland', 'farmland', 'meadow', 'woodland'],
  upland: ['scrubland', 'woodland', 'quarry', 'meadow'],
}

// 管理网格只定义归属；生态采样跨越网格，城市可覆盖多个细分单元。
export function createHierarchy(seed, regions) {
  const random = createRandom(seed, 'hierarchy-v1')
  const themes = Object.keys(palettes)
  for (let i = themes.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[themes[i], themes[j]] = [themes[j], themes[i]]
  }
  const macroSize = WORLD_SIZE / 2, cellSize = WORLD_SIZE / 8
  const origin = WORLD_BOUNDS.minX
  const macros = themes.map((theme, index) => {
    const x = index % 2, z = Math.floor(index / 2)
    return { id: `macro-${z}-${x}`, theme, bounds: { minX: origin + x * macroSize, maxX: origin + (x + 1) * macroSize, minZ: origin + z * macroSize, maxZ: origin + (z + 1) * macroSize } }
  })
  const cells = []
  for (let z = 0; z < 8; z++) for (let x = 0; x < 8; x++) {
    const macro = macros[Math.floor(z / 4) * 2 + Math.floor(x / 4)]
    const rng = createRandom(seed, 'detail-cell-v1', x, z)
    const pool = palettes[macro.theme]
    const center = [origin + (x + 0.5) * cellSize + (rng() - 0.5) * cellSize * 0.4, origin + (z + 0.5) * cellSize + (rng() - 0.5) * cellSize * 0.4]
    const region = regions.find(candidate => insideRegion(candidate, ...center))
    cells.push({ id: `cell-${z}-${x}`, parentId: region.id, macroId: macro.id,
      biome: pool[Math.floor(rng() * pool.length)],
      center,
      bounds: { minX: origin + x * cellSize, maxX: origin + (x + 1) * cellSize, minZ: origin + z * cellSize, maxZ: origin + (z + 1) * cellSize },
    })
  }
  for (let i = 0; i < regions.length; i++) {
    const region = regions[i]
    region.parentId = macros.find(macro => insideRegion(macro, ...region.center)).id
    region.macroIds = macros.filter(macro => macro.bounds.minX < region.bounds.maxX && macro.bounds.maxX > region.bounds.minX && macro.bounds.minZ < region.bounds.maxZ && macro.bounds.maxZ > region.bounds.minZ).map(macro => macro.id)
    region.cellIds = cells.filter(cell => cell.parentId === region.id).map(cell => cell.id)
  }
  const districts=[],details=[]
  for(let row=0;row<4;row++)for(let column=0;column<4;column++) {
    const macro=macros[Math.floor(row/2)*2+Math.floor(column/2)]
    districts.push({id:`district-cell-${row}-${column}`,macroId:macro.id,parentId:macro.id,row,column,
      bounds:{minX:origin+column*128,maxX:origin+(column+1)*128,minZ:origin+row*128,maxZ:origin+(row+1)*128}})
  }
  for(let row=0;row<8;row++)for(let column=0;column<8;column++)cells[row*8+column].districtId=districts[Math.floor(row/2)*4+Math.floor(column/2)].id
  for(let row=0;row<16;row++)for(let column=0;column<16;column++) {
    const cell=cells[Math.floor(row/2)*8+Math.floor(column/2)]
    details.push({id:`detail-${row}-${column}`,parentId:cell.id,districtId:cell.districtId,center:[origin+(column+.5)*32,origin+(row+.5)*32],
      bounds:{minX:origin+column*32,maxX:origin+(column+1)*32,minZ:origin+row*32,maxZ:origin+(row+1)*32}})
  }
  return { version: 2, macros, districts, cells, details, warpPhase: [random() * Math.PI * 2, random() * Math.PI * 2] }
}

export function ecologyWeights(hierarchy, x, z) {
  const [a, b] = hierarchy.warpPhase
  const first = hierarchy.cells[0].bounds
  const cellSize = first.maxX - first.minX
  const wx = Math.max(first.minX, Math.min(first.minX + cellSize * 8, x + Math.sin(z / 190 + a) * 65 + Math.sin(x / 83 + b) * 18))
  const wz = Math.max(first.minZ, Math.min(first.minZ + cellSize * 8, z + Math.sin(x / 210 + b) * 65 + Math.sin(z / 97 + a) * 18))
  const weights = new Map()
  const column = Math.max(0, Math.min(7, Math.floor((wx - first.minX) / cellSize)))
  const row = Math.max(0, Math.min(7, Math.floor((wz - first.minZ) / cellSize)))
  for (let iz = Math.max(0, row - 1); iz <= Math.min(7, row + 1); iz++) {
    for (let ix = Math.max(0, column - 1); ix <= Math.min(7, column + 1); ix++) {
      const cell = hierarchy.cells[iz * 8 + ix]
      const distance = Math.hypot(wx - cell.center[0], wz - cell.center[1])
      const weight = Math.max(0, 1 - distance / (cellSize * 1.2)) ** 3
      weights.set(cell.biome, (weights.get(cell.biome) || 0) + weight)
    }
  }
  return weights
}
