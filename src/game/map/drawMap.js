import { roadPoints } from '../world/roads/roadGeometry.js'
import { FOG_CELL_SIZE, FOG_GROUP_SIZE, REVEAL_RADIUS, isExplored } from './fog.js'
import { traceVisibility } from './visibility.js'

// 只读取规划与探索数据，不触发区块生成或素材加载。北方为世界 +Z。
export function drawMap(ctx, width, height, { center, span, position, heading, fog, plan, radar, revealMap = false, vision = { radius: REVEAL_RADIUS, beamRange: 0 } }) {
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = '#080e0e'
  ctx.fillRect(0, 0, width, height)
  const scale = Math.min(width, height) / span
  const screen = (x, z) => [width / 2 + (x - center.x) * scale, height / 2 - (z - center.z) * scale]
  const xMin = center.x - width / (2 * scale), xMax = center.x + width / (2 * scale)
  const zMin = center.z - height / (2 * scale), zMax = center.z + height / (2 * scale)
  const cells = []
  // 遍历已存的探索块，而非放大到全域时遍历所有未知格。
  for (const [key, mask] of revealMap ? [] : Object.entries(fog)) {
    const [groupX, groupZ] = key.split(',').map(Number)
    const originX = groupX * FOG_GROUP_SIZE * FOG_CELL_SIZE, originZ = groupZ * FOG_GROUP_SIZE * FOG_CELL_SIZE
    if (originX > xMax || originX + 32 < xMin || originZ > zMax || originZ + 32 < zMin) continue
    for (let bit = 0; bit < 16; bit += 1) {
      if (!(mask & (1 << bit))) continue
      const x = originX + bit % 4 * FOG_CELL_SIZE, z = originZ + Math.floor(bit / 4) * FOG_CELL_SIZE
      cells.push(screen(x, z + FOG_CELL_SIZE))
    }
  }
  ctx.save()
  if (radar) {
    ctx.beginPath()
    ctx.arc(width / 2, height / 2, Math.min(width, height) / 2 - 3, 0, Math.PI * 2)
    ctx.clip()
  }
  // 所有地图要素都受已探索格裁切，未知区不会泄露建筑或地名。
  ctx.beginPath()
  if (revealMap) {
    const b = plan.bounds
    const [x, y] = screen(b.minX, b.maxZ)
    ctx.rect(x, y, (b.maxX - b.minX) * scale, (b.maxZ - b.minZ) * scale)
  } else for (const [x, y] of cells) ctx.rect(x, y, FOG_CELL_SIZE * scale + 0.5, FOG_CELL_SIZE * scale + 0.5)
  ctx.clip()
  ctx.fillStyle = '#293c35'
  ctx.fillRect(0, 0, width, height)
  for (const region of plan.regions) {
    const [x, y] = screen(...region.center)
    ctx.fillStyle = region.color
    ctx.globalAlpha = 0.45
    ctx.beginPath()
    if (region.bounds) {
      const [left, top] = screen(region.bounds.minX, region.bounds.maxZ)
      ctx.rect(left, top, (region.bounds.maxX - region.bounds.minX) * scale, (region.bounds.maxZ - region.bounds.minZ) * scale)
    } else ctx.arc(x, y, region.radius * scale, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
  if(plan.city) {
    const b=plan.city.water,[x,y]=screen(b.minX,b.maxZ)
    ctx.fillStyle='#62b8b1';ctx.fillRect(x,y,(b.maxX-b.minX)*scale,(b.maxZ-b.minZ)*scale)
    for(const p of plan.city.placements.filter(p=>p.building)) {
      ctx.save();ctx.translate(...screen(p.position[0],p.position[2]));ctx.rotate(p.rotation)
      ctx.fillStyle='#e2cf9f';ctx.fillRect(-p.footprint.width*scale/2,-p.footprint.depth*scale/2,p.footprint.width*scale,p.footprint.depth*scale);ctx.restore()
    }
    for(const b of plan.city.bridges) {
      const [x,y]=screen(b.x-b.width/2,b.z+b.length/2)
      ctx.fillStyle='#ded9b4';ctx.fillRect(x,y,b.width*scale,b.length*scale)
    }
  }
  const drawRoad = (road, color) => {
    const points = roadPoints(road)
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, road.width * scale)
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'
    ctx.beginPath()
    points.forEach((point, index) => index ? ctx.lineTo(...screen(...point)) : ctx.moveTo(...screen(...point)))
    ctx.stroke()
  }
  for (const town of plan.settlements || []) {
    const b = town.bounds
    if (b.maxX < xMin || b.minX > xMax || b.maxZ < zMin || b.minZ > zMax) continue
    const [tx, ty] = screen(b.minX, b.maxZ)
    ctx.fillStyle = '#41453b'
    ctx.fillRect(tx, ty, (b.maxX - b.minX) * scale, (b.maxZ - b.minZ) * scale)
    for (const block of town.blocks || []) {
      const [bx, by] = screen(block.bounds.minX + 7, block.bounds.maxZ - 7)
      ctx.fillStyle = { park: '#4a6543', industrial: '#695d4e', residential: '#555e51', commercial: '#696653', civic: '#59696a' }[block.kind] || '#41453b'
      ctx.fillRect(bx, by, (block.bounds.maxX - block.bounds.minX - 14) * scale, (block.bounds.maxZ - block.bounds.minZ - 14) * scale)
    }
    for (const road of town.roads) drawRoad(road, '#a29b75')
    for (const building of town.placements) {
      const [x, y] = screen(building.position[0], building.position[2])
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(building.rotation)
      ctx.fillStyle = '#b7b4a1'
      const w = building.footprint.width * building.scale * scale, d = building.footprint.depth * building.scale * scale
      ctx.fillRect(-w / 2, -d / 2, w, d)
      ctx.strokeStyle = '#171e1c'
      ctx.lineWidth = 1
      ctx.strokeRect(-w / 2, -d / 2, w, d)
      ctx.restore()
    }
  }
  for (const road of plan.roads || []) drawRoad(road, '#8d8d75')
  for (const b of plan.fortifications?.colliders || []) {
    ctx.save()
    ctx.translate(...screen(b.x, b.z)); ctx.rotate(b.rotation)
    ctx.fillStyle = '#b5aa86'
    ctx.fillRect(-b.halfWidth * scale, -b.halfDepth * scale, b.halfWidth * 2 * scale, b.halfDepth * 2 * scale)
    ctx.restore()
  }
  if (!radar) for (const gate of plan.fortifications?.gates || []) {
    const [x,y] = screen(gate.x, gate.z)
    ctx.fillStyle = '#efd7a0'; ctx.font = '12px system-ui'; ctx.textAlign = 'center'
    ctx.fillText(gate.name, x, y - 16)
  }
  // 已探索但不在当前观察范围内的区域压暗；刷新后仍保留探索记忆。
  const [px, py] = screen(position.x, position.z)
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, width, height)
  traceVisibility(ctx, px, py, scale, heading, vision)
  ctx.clip('evenodd')
  ctx.fillStyle = revealMap ? 'rgba(0, 0, 0, 0)' : 'rgba(0, 0, 0, 0.4)'
  ctx.fillRect(0, 0, width, height)
  ctx.restore()
  ctx.restore()

  // 坐标参考网格可跨越未知区；它不包含任何世界内容。
  ctx.save()
  if (radar) {
    ctx.beginPath()
    ctx.arc(width / 2, height / 2, Math.min(width, height) / 2 - 3, 0, Math.PI * 2)
    ctx.clip()
  }
  const grid = span > 400 ? 128 : span > 180 ? 64 : 32
  ctx.strokeStyle = 'rgba(164, 184, 162, 0.09)'
  ctx.lineWidth = 1
  for (let x = Math.ceil(xMin / grid) * grid; x <= xMax; x += grid) {
    const [sx] = screen(x, 0)
    ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, height); ctx.stroke()
  }
  for (let z = Math.ceil(zMin / grid) * grid; z <= zMax; z += grid) {
    const [, sy] = screen(0, z)
    ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(width, sy); ctx.stroke()
  }
  if (!radar) {
    ctx.font = '12px system-ui'
    ctx.textAlign = 'center'
    for(const p of plan.city?.landmarks || []) {
      if(!revealMap && !isExplored(fog,p.x,p.z))continue
      const [x,y]=screen(p.x,p.z);ctx.fillStyle='#f0dfaa';ctx.fillText(p.name,x,y-14)
    }
    for (const town of plan.settlements || []) {
      const x = (town.bounds.minX + town.bounds.maxX) / 2, z = (town.bounds.minZ + town.bounds.maxZ) / 2
      if (!revealMap && !isExplored(fog, x, z)) continue
      const [sx, sy] = screen(x, z)
      ctx.fillStyle = '#eee1b6'
      ctx.fillText(town.name, sx, sy - 13)
    }
  }
  if (px >= 0 && py >= 0 && px <= width && py <= height) {
    ctx.strokeStyle = 'rgba(150, 227, 187, 0.2)'
    ctx.lineWidth = 1
    ctx.beginPath(); traceVisibility(ctx, px, py, scale, heading, vision); ctx.stroke()
    ctx.translate(px, py)
    ctx.rotate(heading)
    ctx.shadowBlur = 10
    ctx.shadowColor = '#81e0b6'
    ctx.fillStyle = '#bcf5d8'
    ctx.strokeStyle = '#0c1d16'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(0, -8); ctx.lineTo(6, 6); ctx.lineTo(0, 3); ctx.lineTo(-6, 6); ctx.closePath()
    ctx.fill(); ctx.stroke()
  }
  ctx.restore()
  if (plan.bounds && !radar) {
    const [left, top] = screen(plan.bounds.minX, plan.bounds.maxZ)
    ctx.strokeStyle = '#849078'
    ctx.lineWidth = 2
    ctx.strokeRect(left, top, (plan.bounds.maxX - plan.bounds.minX) * scale, (plan.bounds.maxZ - plan.bounds.minZ) * scale)
  }
  if (radar) {
    ctx.strokeStyle = '#708574'
    ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.arc(width / 2, height / 2, Math.min(width, height) / 2 - 3, 0, Math.PI * 2); ctx.stroke()
  }
  ctx.fillStyle = '#b8c5b7'
  ctx.font = 'bold 11px system-ui'
  ctx.textAlign = 'center'
  ctx.fillText('N', width / 2, 14)
}
