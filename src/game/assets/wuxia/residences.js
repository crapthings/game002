// 财富差异由建筑体量、院落结构与生活陈设表达，所有尺寸保持米制。
export const residenceRecipes=[
  ['house-poor-shed','贫寒民宅 · 柴棚小屋',6,5,1,'#a58e6d','宅','poor-shed','泥灰墙、木板补窗、柴棚与水缸。'],
  ['house-poor-patched','贫寒民宅 · 补瓦陋居',7,6,1,'#99876f','宅','poor-patched','补瓦单间、晾晒架与窄门。'],
  ['house-poor-craft','贫寒民宅 · 巷尾匠户',8,5,1,'#a18762','宅','poor-craft','低矮作坊住宅，木料堆和小工作台。'],
  ['house-common-twin','普通民宅 · 两开间',10,7,1,'#a58f70','宅','common-twin','双开间平房，分户木门与日常水缸。'],
  ['house-common-wing','普通民宅 · 偏厦人家',11,9,1,'#859984','居','common-wing','正屋配短侧厢，围出小型生活院。'],
  ['house-common-loft','普通民宅 · 阁楼人家',8,7,2,'#9f9278','居','common-loft','窄面宽双层楼，小阳台与晾衣杆。'],
  ['house-comfort-court','小康民宅 · 三合小院',14,12,1,'#8ca199','院','comfort-court','三面厢房、院门、石径与整齐盆景。'],
  ['house-comfort-shop','小康民宅 · 商住楼',11,8,2,'#b39170','居','comfort-shop','下层家业柜台、二楼栏廊与花盆。'],
  ['house-comfort-garden','小康民宅 · 花庭宅',13,11,1,'#aa8c87','园','comfort-garden','侧厢与花树，配独立庭院石灯。'],
  ['house-rich-court','富户民宅 · 朱门深院',18,14,2,'#a66c58','府','rich-court','双层正楼、左右厢房、朱门与石灯。'],
  ['house-rich-library','富户民宅 · 藏书宅',16,13,2,'#78948e','书','rich-library','主楼、侧书房与院内书案，素雅青瓦。'],
  ['house-rich-garden','富户民宅 · 雅园别业',19,14,1,'#a18d75','园','rich-garden','宽阔三合院、庭园亭、花木与景石。'],
]
export const residenceTraits=Object.fromEntries(residenceRecipes.map(r=>{
  const tier=r[7].split('-')[0]
  return [`wuxia.${r[0]}`,{wealth:tier,layout:r[7].includes('court')||tier==='rich'?'court':r[7].includes('wing')||r[7].includes('garden')?'wing':'hall'}]
}))

// 每款民宅有独立立面配方；结构尺寸不变，便于既有城市直接更新模型。
export const residenceFacades={
  'poor-shed': {wall:'#c6b794',tile:'#898574',window:'shutter',rise:.70,trim:'plank'},
  'poor-patched': {wall:'#d1c0a0',tile:'#777f79',window:'slat',rise:.82,trim:'patch'},
  'poor-craft': {wall:'#cbb89b',tile:'#858e85',window:'shutter',rise:.65,trim:'plank',wide:true},
  'common-twin': {wall:'#eee0bd',tile:'#738d88',window:'slat',rise:.85,trim:'brick',split:true},
  'common-wing': {wall:'#e4dfc8',tile:'#69897e',window:'lattice',rise:.85,trim:'brick'},
  'common-loft': {wall:'#e6d5b4',tile:'#747d79',window:'shutter',rise:1.05,trim:'timber'},
  'comfort-court': {wall:'#f0e6cf',tile:'#6e9791',window:'lattice',rise:1,trim:'brick'},
  'comfort-shop': {wall:'#efdec0',tile:'#788d87',window:'slat',rise:.90,trim:'timber',wide:true},
  'comfort-garden': {wall:'#f2e3d5',tile:'#829b90',window:'round',rise:.90,trim:'plaster'},
  'rich-court': {wall:'#f1e4c8',tile:'#5e7f80',window:'lattice',rise:1.10,trim:'plaster',wide:true},
  'rich-library': {wall:'#e2e7d9',tile:'#557b83',window:'slat',rise:.95,trim:'timber',wide:true},
  'rich-garden': {wall:'#f1e9d6',tile:'#729889',window:'round',rise:1.05,trim:'plaster'},
  riverside: {wall:'#deeadf',tile:'#658d99',window:'slat',rise:.85,trim:'timber',wide:true},
  workyard: {wall:'#e4cea5',tile:'#92967f',window:'shutter',rise:.75,trim:'brick'},
  row: {wall:'#e1e3cd',tile:'#73897e',window:'lattice',rise:.85,trim:'timber',split:true},
  scholar: {wall:'#e9ebdf',tile:'#607f89',window:'round',rise:1.05,trim:'plaster'},
  home: {wall:'#f2dfba',tile:'#8e9d84',window:'shutter',rise:.85,trim:'brick'},
  balcony: {wall:'#eedbce',tile:'#7f9291',window:'lattice',rise:1.12,trim:'timber'},
  court: {wall:'#e5e8cf',tile:'#60867b',window:'slat',rise:.95,trim:'brick'},
  garden: {wall:'#f2ddd1',tile:'#83968c',window:'round',rise:.9,trim:'plaster'},
}
