import { groundTexture } from './groundTexture.js'
import { createTerrain, generateChunk } from './terrain.js'

let terrain
self.onmessage = ({ data: request }) => {
  try {
    if (request.type === 'init') {
      terrain = createTerrain(request.plan.seed, request.plan.settlements || [], request.plan)
      return
    }
    const data = generateChunk(terrain, request.chunk.x, request.chunk.z)
    const normals = []
    for (let i = 0; i < data.positions.length; i += 3) {
      const x = data.positions[i], z = data.positions[i + 2]
      const nx = terrain.height(x - 0.1, z) - terrain.height(x + 0.1, z)
      const nz = terrain.height(x, z - 0.1) - terrain.height(x, z + 0.1)
      const length = Math.hypot(nx, 0.2, nz)
      normals.push(nx / length, 0.2 / length, nz / length)
    }
    data.groundPixels = groundTexture(terrain, request.chunk.x, request.chunk.z, data.colors)
    data.normals = new Float32Array(normals)
    data.placements.push(...request.placements)
    for (const item of data.placements) if (!item.fortification && !item.infrastructure) item.position[1] = terrain.surfaceHeight(item.position[0], item.position[2])
    data.positions = new Float32Array(data.positions)
    data.colors = new Float32Array(data.colors)
    data.indices = new Uint16Array(data.indices)
    const transfer = [data.positions.buffer, data.colors.buffer, data.indices.buffer, data.normals.buffer, data.groundPixels.buffer]
    self.postMessage({ type: 'chunk', data }, transfer)
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message || '区块生成失败' })
  }
}
