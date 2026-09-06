import { HUMAN_SCALE } from '../../world/worldMetrics.js'
import { zombieCatalog } from '../zombies/catalog.js'

export const PLAYER_ASSET_ID = 'character.player'

// 角色元数据不导入 Babylon；新增 NPC 在此登记，并在角色工厂注册。
export const characterCatalog = [
  {
    assetId: PLAYER_ASSET_ID,
    name: '幸存者 · 玩家',
    category: 'character',
    size: { width: 0.95, height: HUMAN_SCALE.referenceHeight, depth: 0.85 },
  },
  ...zombieCatalog,
]
