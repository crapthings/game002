export const npcCatalog=[
  ['citizen','百姓 · 布衣男子','#82958b',false],
  ['citizen-woman','百姓 · 素衣女子','#b99b91',true],
  ['vendor','集市摊贩','#b99d6b',false],
  ['porter','挑担货郎','#7c9686',false],
  ['guard','巡城衙役','#705c58',false],
].map(([role,name,color,female])=>({assetId:`npc.${role}`,role,name,color,female,category:'character',zones:['city'],tags:['npc',role],size:{width:role==='porter'?2.2:.7,height:1.75,depth:.7},description:'城内生活角色：站立、行走与职业装束。'}))
export const npcDefinitions=Object.fromEntries(npcCatalog.map(a=>[a.assetId,a]))
