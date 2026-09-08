// Append new named templates when their feature is introduced. Existing entries
// are replay rules: changing their initial resources requires another version.
export const ARRIVAL_TEMPLATES_V1=Object.freeze({
  'supplier-1':Object.freeze({id:'supplier-1',name:'货郎孙进',model:'npc.vendor',color:'#ad9363',
    source:'城外首批有限供货',wallet:100,health:100,maxHealth:100,attack:12,defense:0,courage:35,
    lots:Object.freeze([{itemType:'medicine',quantity:40},{itemType:'ration',quantity:80}])}),
  'gang-1':Object.freeze({id:'gang-1',name:'渡口赵六',model:'npc.citizen',color:'#796576',
    source:'渡口帮派来一名联络人，随身自有钱物',wallet:35,health:100,maxHealth:100,attack:14,defense:1,courage:60,
    lots:Object.freeze([{itemType:'ration',quantity:3},{itemType:'sword',quantity:1}])}),
})
