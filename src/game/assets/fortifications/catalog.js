export const fortificationCatalog = [
  { assetId: 'fort.wall', name: '青石城墙 · 三十二米', category: 'fortification', zones: ['city'], tags: ['wall'], size: { width: 32, height: 14, depth: 10 }, length: 32 },
  { assetId: 'fort.wall-short', name: '青石城墙 · 收口段', category: 'fortification', zones: ['city'], tags: ['wall'], size: { width: 16, height: 14, depth: 10 }, length: 16 },
  { assetId: 'fort.gate', name: '四方雄关 · 重檐城门', category: 'fortification', zones: ['city'], tags: ['gate'], size: { width: 42, height: 29, depth: 28 }, description: '青砖城台、切石拱券、木纹朱门、铜钉铜环与双重飞檐；配石栏、吊灯和山形纹章，门扇常开。' },
  { assetId: 'fort.corner', name: '镇城角楼', category: 'fortification', zones: ['city'], tags: ['tower'], size: { width: 24, height: 24, depth: 24 } },
]
export const fortificationDefinitions = Object.fromEntries(fortificationCatalog.map(asset => [asset.assetId, asset]))
