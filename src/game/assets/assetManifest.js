import { buildingCatalog } from './buildings/catalog.js'
import { villageBuildingCatalog } from './village/catalog.js'
import { environmentCatalog } from './environment/catalog.js'
import { characterCatalog } from './characters/catalog.js'
import { roadAssetCatalog } from './roads/catalog.js'

const names = {
  'nature.tree': '针叶树', 'nature.rock': '岩石', 'nature.broadleaf': '阔叶树',
  'nature.dead-tree': '枯树', 'nature.bush': '灌木', 'nature.reeds': '芦苇',
  'nature.flowers': '野花', 'nature.log-pile': '原木堆', 'rural.fence': '木围栏',
  'rural.hay-bale': '草捆', 'rural.crop-bed': '田垄', 'urban.lamp': '路灯',
  'urban.bench': '长椅', 'urban.dumpster': '垃圾箱', 'urban.barrier': '混凝土路障',
  'industry.crate': '木箱', 'industry.barrel': '锈蚀油桶', 'industry.container': '集装箱',
  'industry.generator': '发电机', 'industry.water-tank': '储水罐', 'industry.scrap': '废铁堆',
}

export const assetZoneLabels = Object.freeze({
  universal: '通用', city: '城市', village: '村庄', industrial: '工业区', farmland: '农田',
  forest: '森林', wetland: '湿地', roadside: '公路', wilderness: '荒野',
})

const environmentZones = {
  'nature.tree': ['forest', 'wilderness'], 'nature.rock': ['wilderness', 'industrial'],
  'nature.broadleaf': ['forest', 'village', 'city'], 'nature.dead-tree': ['forest', 'wilderness'],
  'nature.bush': ['universal', 'wilderness'], 'nature.reeds': ['wetland'],
  'nature.flowers': ['farmland', 'wilderness'], 'nature.log-pile': ['forest', 'village'],
  'rural.fence': ['village', 'farmland', 'wilderness'], 'rural.hay-bale': ['village', 'farmland'],
  'rural.crop-bed': ['village', 'farmland'], 'urban.lamp': ['city', 'village', 'roadside'],
  'urban.bench': ['city', 'village'], 'urban.dumpster': ['city', 'industrial'],
  'urban.barrier': ['city', 'industrial', 'roadside'], 'industry.crate': ['universal', 'industrial'],
  'industry.barrel': ['industrial', 'city', 'village'], 'industry.container': ['industrial', 'city', 'roadside'],
  'industry.generator': ['universal', 'industrial'], 'industry.water-tank': ['industrial', 'village', 'farmland'],
  'industry.scrap': ['industrial', 'city', 'wilderness'],
}

const environmentSize = (definition) => {
  let width = definition.footprint?.width || definition.radius * 2 || 1
  let depth = definition.footprint?.depth || definition.radius * 2 || 1
  let height = 1
  for (const part of definition.parts) {
    width = Math.max(width, Math.abs(part.position[0]) * 2 + part.size[0])
    height = Math.max(height, part.position[1] + part.size[1] / 2)
    depth = Math.max(depth, Math.abs(part.position[2]) * 2 + (part.size[2] || part.size[0]))
  }
  return { width, height, depth }
}

const cityZones = (item) => item.category === 'industrial'
  ? ['city', 'industrial']
  : item.id === 'gas-station' ? ['city', 'roadside'] : ['city']
const villageZones = (item) => [
  'village', ...(['industrial', 'utility'].includes(item.category) ? ['industrial'] : []),
  ...(item.feature === 'farm' || item.feature === 'grain' ? ['farmland'] : []),
]
const buildingAssets = (items, zonesFor) => items.map((item) => ({
  assetId: item.assetId, name: item.name, category: item.category, zones: item.zones || zonesFor(item),
  tags: item.tags || [item.category, `${item.floors}层`],
  size: { width: item.width, height: item.floors * item.floorHeight + (item.id==='fire-station'?4:2), depth: item.depth },
}))
const environmentAssets = Object.entries(environmentCatalog).map(([assetId, definition]) => ({
  assetId, name: definition.name || names[assetId] || assetId, category: assetId.startsWith('nature.') ? 'ecology' : 'prop',
  zones: definition.zones || environmentZones[assetId] || ['universal'],
  tags: definition.tags || [assetId.split('.')[0]], variant: definition.variant,
  size: environmentSize(definition),
}))
const characters = characterCatalog.map((item) => ({ ...item, zones: item.zones || ['universal'], tags: item.tags || ['player', 'survivor'] }))
const buildings = [...buildingAssets(buildingCatalog, cityZones), ...buildingAssets(villageBuildingCatalog, villageZones)]
const nature = [
  { assetId: 'nature.tree', name: names['nature.tree'], category: 'ecology', zones: environmentZones['nature.tree'], tags: ['nature'], size: { width: 3.2, height: 6.5, depth: 3.2 } },
  { assetId: 'nature.rock', name: names['nature.rock'], category: 'ecology', zones: environmentZones['nature.rock'], tags: ['nature'], size: { width: 2.4, height: 1.4, depth: 1.8 } },
  ...environmentAssets.filter((item) => item.category === 'ecology'),
]

export const assetTabs = [
  { id: 'roads', label: '道路', assets: roadAssetCatalog },
  { id: 'characters', label: '角色', assets: characters },
  { id: 'buildings', label: '建筑', assets: buildings },
  { id: 'nature', label: '自然生态', assets: nature },
  { id: 'props', label: '场景道具', assets: environmentAssets.filter((item) => item.category === 'prop') },
]

export const assetCatalog = assetTabs.flatMap((tab) => tab.assets.map((asset) => ({ ...asset, type: tab.id })))
export const assetCount = assetCatalog.length

// 生成器可按区域、资产形态和功能标签组合资产池；返回顺序固定，随机选择交给 seed 系统。
export function selectAssets({ zone, type, tags = [] } = {}) {
  return assetCatalog.filter((asset) => (
    (!zone || asset.zones.includes(zone) || asset.zones.includes('universal'))
    && (!type || asset.type === type)
    && tags.every((tag) => asset.tags.includes(tag))
  ))
}
