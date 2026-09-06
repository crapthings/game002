const districtColors = { residential:'#91b893',commercial:'#d8b77c',industrial:'#a494b8',civic:'#79bdcd',park:'#447653' }
export const zoneColors = { city:'#998269',village:'#b39d64',woodland:'#426c55',meadow:'#829b60',farmland:'#a99c60',wetland:'#4c8790',quarry:'#99948d',scrubland:'#8b8360' }
export const zoneLabels = { city:'城市区域',village:'村庄区域',woodland:'森林',meadow:'草甸',farmland:'农田',wetland:'湿地',quarry:'采石场',scrubland:'灌木荒地' }

import { useMemo } from 'react'
import { sampleEcology } from '../game/world/biomes/sampleEcology.js'
import { createTopographySampler } from '../game/world/generation/topography.js'
import { terrainColor } from '../game/debug/terrainLayers.js'
import { getSpawnPlan } from '../game/spawning/createSpawnPlan.js'

export default function WorldPlanView({plan,selected,onSelect,focus,layers,baseMap='ecology'}) {
  const ecology = useMemo(() => {
    if (!plan.hierarchy) return []
    const cells = []
    const topography = plan.topography ? createTopographySampler(plan.topography) : null
    for (let z = -1024; z < 1024; z += 32) for (let x = -1024; x < 1024; x += 32) {
      const sample = sampleEcology(plan, x + 16, z + 16)
      cells.push({ x, z, terrain: topography?.sample(x + 16, z + 16), color: `rgb(${sample.color.map(value => Math.round(value * 255)).join(',')})` })
    }
    return cells
  }, [plan])
  const bounds=focus || plan.bounds
  const spanX=bounds.maxX-bounds.minX,spanZ=bounds.maxZ-bounds.minZ,pad=Math.max(spanX,spanZ)*0.06
  const line=Math.max(spanX,spanZ)/900
  return <svg role="img" aria-label={`种子 ${plan.seed} 的世界区域规划，北方为 +Z`} viewBox={`${bounds.minX-pad} ${-bounds.maxZ-pad} ${spanX+pad*2} ${spanZ+pad*2}`} className="h-full w-full select-none bg-[#0c1314]">
    <defs>{plan.regions.map(region=><clipPath key={region.id} id={`clip-${region.id}`}><rect x={region.bounds.minX} y={-region.bounds.maxZ} width={region.bounds.maxX-region.bounds.minX} height={region.bounds.maxZ-region.bounds.minZ}/></clipPath>)}</defs>
    {baseMap !== 'regions' && ecology.map(cell => <rect key={`${cell.x}:${cell.z}`} x={cell.x} y={-cell.z-32} width={32.2} height={32.2} fill={baseMap === 'ecology' || !cell.terrain ? cell.color : terrainColor(baseMap, cell.terrain)} pointerEvents="none"/>)}
    {plan.regions.map(region=>{
      const b=region.bounds,key=region.kind==='wilderness'?region.biome:region.kind
      return <g key={region.id}>
        <rect x={b.minX} y={-b.maxZ} width={b.maxX-b.minX} height={b.maxZ-b.minZ} fill={zoneColors[key] || region.color} fillOpacity={baseMap !== 'regions' && plan.hierarchy ? 0 : 0.8} stroke={layers.regions ? '#bdcabc' : 'none'} strokeWidth={line} pointerEvents="all" onClick={()=>onSelect(region.id)} className="cursor-pointer"><title>{region.name} · {zoneLabels[key]}</title></rect>
        {baseMap === 'ecology' && <g clipPath={`url(#clip-${region.id})`} pointerEvents="none">{region.ecology.map(patch=><circle key={patch.id} cx={patch.center[0]} cy={-patch.center[1]} r={patch.radius} fill={zoneColors[patch.biome]} fillOpacity="0.5" stroke="white" strokeOpacity="0.2" strokeWidth={line} strokeDasharray={`${line*3} ${line*4}`}/>)}</g>}
      </g>
    })}
    <g pointerEvents="none">
      {layers.spawns && getSpawnPlan(plan).points.map(point=><circle key={point.id} cx={point.x} cy={-point.z} r={line*2.2} fill="#ff9577"/>)}
      {layers.details && plan.hierarchy?.cells.map(cell => <rect key={cell.id} x={cell.bounds.minX} y={-cell.bounds.maxZ} width={256} height={256} fill="none" stroke="#d0ded0" strokeOpacity="0.35" strokeWidth={line*0.6} strokeDasharray={`${line*3} ${line*3}`}/>)}
      {layers.macros && plan.hierarchy?.macros.map(macro => <g key={macro.id}><rect x={macro.bounds.minX} y={-macro.bounds.maxZ} width={1024} height={1024} fill="none" stroke="#f6d294" strokeWidth={line*2.5}/><text x={macro.bounds.minX+15} y={-macro.bounds.maxZ+24} fill="#f6d294" fontSize={line*12}>{({forest:'林地带',lowland:'湿地低地',rural:'农业带',upland:'荒野高地'})[macro.theme]}</text></g>)}
      {layers.settlements && plan.settlements.map(town=><g key={town.id}>
        <rect x={town.bounds.minX} y={-town.bounds.maxZ} width={town.bounds.maxX-town.bounds.minX} height={town.bounds.maxZ-town.bounds.minZ} fill="#182827" fillOpacity="0.28" stroke="#eddec4" strokeWidth={line} strokeDasharray={`${line*5} ${line*3}`}/>
        {(town.blocks || []).map(block=><rect key={block.id} x={block.bounds.minX} y={-block.bounds.maxZ} width={block.bounds.maxX-block.bounds.minX} height={block.bounds.maxZ-block.bounds.minZ} fill={districtColors[block.kind]} fillOpacity="0.8" stroke="#243831" strokeWidth={line*0.6}/>)}
      </g>)}
      {layers.roads && [...plan.roads,...plan.settlements.flatMap(town=>town.roads)].map(road=><polyline key={road.id} points={(road.points || [road.from,road.to]).map(([x,z])=>`${x},${-z}`).join(' ')} fill="none" stroke="#e8d9b6" strokeWidth={road.width} strokeLinejoin="round" strokeLinecap="round" opacity="0.8"/>)}
      {layers.labels && plan.regions.map(region=><text key={region.id} x={region.center[0]} y={-region.bounds.maxZ+line*18} textAnchor="middle" fill="#fff6dc" fontSize={line*12} stroke="#192a23" strokeWidth={line*0.8} paintOrder="stroke">{region.name}{region.citySize ? ` · ${{small:'小',medium:'中',large:'大'}[region.citySize]}城` : ''}</text>)}
      {selected && (()=>{const b=plan.regions.find(region=>region.id===selected)?.bounds;return b && <rect x={b.minX} y={-b.maxZ} width={b.maxX-b.minX} height={b.maxZ-b.minZ} fill="none" stroke="#b9ffe0" strokeWidth={line*3}/>})()}
      <rect x={plan.bounds.minX} y={-plan.bounds.maxZ} width={plan.size} height={plan.size} fill="none" stroke="#d5dfd7" strokeWidth={line*2}/>
      <circle cx={plan.spawn[0]} cy={-plan.spawn[1]} r={line*5} fill="#fff1b5" stroke="#152620" strokeWidth={line*2}/>
    </g>
  </svg>
}
