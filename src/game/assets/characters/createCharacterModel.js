import { npcDefinitions } from '../../npcs/catalog.js'
import { createNpcModel } from '../../npcs/createNpcModel.js'
import { createPlayer } from '../../entities/createPlayer.js'
import { PLAYER_ASSET_ID } from './catalog.js'

const factories = { [PLAYER_ASSET_ID]: createPlayer }

// 保留角色的关节、动画与释放接口，不合并成静态建筑模板。
export function createCharacterModel(scene, assetId) {
  if(npcDefinitions[assetId])return createNpcModel(scene,assetId)
  const factory = factories[assetId]
  if (!factory) throw new Error(`未知角色资产：${assetId}`)
  return factory(scene)
}
