import { HUMAN_SCALE } from '../../world/worldMetrics.js'

export const PLAYER_ASSET_ID = 'character.player'

// 角色元数据不导入 Babylon；新增 NPC 在此登记，并在角色工厂注册。
export const characterCatalog = [
  {
    assetId: PLAYER_ASSET_ID,
    name: '无名侠客 · 玩家',
    description: '宽檐斗笠、束发、墨青交领布衣与深色披风。空手行走江湖，支持两段跳与空中翻滚。',
    category: 'character',
    size: { width: 1.08, height: HUMAN_SCALE.referenceHeight, depth: 1.08 },
  },
]
