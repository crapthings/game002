// 生态负责地表、密度和装饰权重；城市/村庄负责聚落，不把生态写死在建筑模型中。
export const biomeCatalog = {
  woodland: { name: '混合林', color: [0.19, 0.28, 0.19], elevation: 5, roughness: 4, density: 0.85, assets: [['nature.tree', 5], ['nature.broadleaf', 4], ['nature.bush', 3], ['nature.log-pile', 1], ['nature.rock', 2]] },
  meadow: { name: '草甸', color: [0.32, 0.35, 0.21], elevation: 1, roughness: 1.8, density: 0.32, assets: [['nature.bush', 4], ['nature.broadleaf', 1], ['nature.rock', 2], ['nature.flowers', 2]] },
  farmland: { name: '草野', color: [0.37, 0.32, 0.20], elevation: 0, roughness: 0.6, density: 0.36, assets: [['nature.flowers', 5], ['nature.dry-grass', 2], ['nature.bush', 1], ['nature.rock', 2]] },
  wetland: { name: '湿地', color: [0.19, 0.27, 0.25], elevation: -1.5, roughness: 0.45, density: 0.55, assets: [['nature.reeds', 6], ['nature.dead-tree', 2], ['nature.rock', 1], ['nature.bush', 1]] },
  scrubland: { name: '灌木荒地', color: [0.34, 0.32, 0.25], elevation: 2, roughness: 2.5, density: 0.3, assets: [['nature.bush', 4], ['nature.dead-tree', 2], ['nature.rock', 3], ['nature.log-pile', 1]] },
  quarry: { name: '岩地', color: [0.40, 0.39, 0.35], elevation: 7, roughness: 5, density: 0.5, assets: [['nature.rock', 14], ['nature.dead-tree', 2], ['nature.bush', 1]] },
}
export const chooseBiomeAsset = (biome, random) => {
  let value = random() * biome.assets.reduce((sum, item) => sum + item[1], 0)
  for (const [id, weight] of biome.assets) { value -= weight; if (value <= 0) return id }
  return biome.assets.at(-1)[0]
}
