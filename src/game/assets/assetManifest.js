import { cityAssetCatalog } from './city/catalog.js'
import { wuxiaCatalog } from './wuxia/catalog.js'
import { fortificationCatalog } from './fortifications/catalog.js'
import { environmentCatalog } from './environment/catalog.js'
import { characterCatalog } from './characters/catalog.js'

const names = {
  'nature.tree': '针叶树', 'nature.rock': '岩石', 'nature.broadleaf': '阔叶树',
  'nature.dead-tree': '枯树', 'nature.bush': '灌木', 'nature.reeds': '芦苇',
  'nature.flowers': '野花', 'nature.log-pile': '原木堆',
}

export const assetZoneLabels = Object.freeze({
  universal: '通用', city: '城市', village: '村庄', industrial: '岩地', farmland: '农田',
  forest: '森林', wetland: '湿地', roadside: '路旁', wilderness: '荒野',
})

const environmentZones = {
  'nature.tree': ['forest', 'wilderness'], 'nature.rock': ['wilderness'],
  'nature.broadleaf': ['forest', 'village', 'city'], 'nature.dead-tree': ['forest', 'wilderness'],
  'nature.bush': ['universal', 'wilderness'], 'nature.reeds': ['wetland'],
  'nature.flowers': ['farmland', 'wilderness'], 'nature.log-pile': ['forest', 'village'],
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

const environmentAssets = Object.entries(environmentCatalog).map(([assetId, definition]) => ({
  assetId, name: definition.name || names[assetId] || assetId, category: 'ecology',
  zones: definition.zones || environmentZones[assetId] || ['universal'],
  tags: definition.tags || [assetId.split('.')[0]], variant: definition.variant,
  size: environmentSize(definition),
}))
const characters = characterCatalog.map((item) => ({ ...item, zones: item.zones || ['universal'], tags: item.tags || ['player', 'xiake'] }))
const nature = [
  { assetId: 'nature.tree', name: names['nature.tree'], category: 'ecology', zones: environmentZones['nature.tree'], tags: ['nature'], size: { width: 3.2, height: 6.5, depth: 3.2 } },
  { assetId: 'nature.rock', name: names['nature.rock'], category: 'ecology', zones: environmentZones['nature.rock'], tags: ['nature'], size: { width: 2.4, height: 1.4, depth: 1.8 } },
  ...environmentAssets.filter((item) => item.category === 'ecology'),
]

export const assetTabs = [
  { id: 'city', label: '道路水桥', assets: cityAssetCatalog },
  { id: 'wuxia', label: '武侠建筑', assets: wuxiaCatalog },
  { id: 'fortifications', label: '城墙城门', assets: fortificationCatalog },
  { id: 'nature', label: '自然生态', assets: nature },
  { id: 'characters', label: '角色与百姓', assets: characters },
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
