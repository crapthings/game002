export const cityAssetCatalog=[
  {assetId:'city.bridge-stone',name:'碧溪石拱桥',category:'infrastructure',zones:['city'],tags:['bridge','water'],size:{width:13,height:3.5,depth:18}},
  {assetId:'city.bridge-wood',name:'清波木拱桥',category:'infrastructure',zones:['city'],tags:['bridge','water'],size:{width:9,height:3.5,depth:18}},
]
export const cityAssetDefinitions=Object.fromEntries(cityAssetCatalog.map(a=>[a.assetId,a]))
