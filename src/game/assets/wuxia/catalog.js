const recipes = [
  ['house-riverside','民宅 · 枕水人家',9,7,2,'#698e91','居','riverside','浅青木构、临水挑台与二楼护栏。'],
  ['house-workyard','民宅 · 晒谷人家',10,8,1,'#ad8a58','宅','workyard','竹晒盘、柴架和暖色农家小院。'],
  ['house-row','民宅 · 柳巷连宅',13,7,2,'#899579','居','row','双入口连宅，共用屋脊与分户窗格。'],
  ['house-scholar','民宅 · 书香小院',9,9,1,'#78919a','书','scholar','书卷陈设、石灯和素雅门廊。'],
  ['pawnshop','通宝当铺',10,8,1,'#b65c43','当','pawn','高柜、铜钱招牌、朱木门面与青瓦挑檐。'],
  ['apothecary','百草药铺',11,8,1,'#638c70','药','medicine','百子药柜、药罐和晒药竹盘，浅绿木构。'],
  ['house-cottage','民宅 · 春溪小筑',8,7,1,'#af885d','宅','home','暖白粉墙、竹篱花圃与素木窗。'],
  ['house-balcony','民宅 · 临风绣楼',8,8,2,'#99765b','居','balcony','双层屋檐、二楼木栏与花盆阳台。'],
  ['house-courtyard','民宅 · 青竹合院',14,12,1,'#779079','院','court','三面房舍围合小院，中央留出开敞石径。'],
  ['house-garden','民宅 · 桃花别院',11,9,1,'#ab766a','园','garden','错落侧屋、桃花树与低矮院墙。'],
  ['weaponshop','锻雪兵器铺',12,8,1,'#66828b','兵','weapons','侧棚下设剑架、铁砧和锻炉。'],
  ['inn','听雨客栈',14,10,2,'#b66e4c','客','inn','双层长廊、暖色灯笼与门前行李架。'],
  ['teahouse','清风茶楼',12,9,2,'#789878','茶','tea','开放茶棚、茶桌与青瓷壶，临街露台。'],
  ['tavern','杏花酒肆',11,8,1,'#bd8750','酒','wine','赭金木构，酒缸、长凳与杏色布棚。'],
  ['clothshop','云锦绸庄',10,8,1,'#a97d91','锦','cloth','粉黛门面，彩色布匹与织物陈列架。'],
  ['academy','明心书院',14,10,1,'#6c8c8c','书','books','宽阔正堂、侧廊和书卷架，青竹点景。'],
  ['escort','长风镖局',14,10,2,'#a1664b','镖','escort','高挑正楼、行镖旗、货箱与练武木桩。'],
  ['shrine','栖霞祠堂',12,10,1,'#b87759','祠','shrine','重檐正堂、香炉与成对石灯，清雅庄重。'],
]
export const wuxiaCatalog = recipes.map(([id,name,w,d,floors,accent,sign,kind,description]) => ({
  assetId:`wuxia.${id}`, name, category:'wuxia-building', zones:['city','village'], tags:['wuxia',kind],
  width:w, depth:d, floors, accent, sign, kind, description,
  size:{width:w+5,height:floors*3.4+4,depth:d+6}, footprint:{width:w+2,depth:d+3},
}))
export const wuxiaDefinitions = Object.fromEntries(wuxiaCatalog.map(item=>[item.assetId,item]))
