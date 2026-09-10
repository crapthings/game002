// Saved membership rules; append later versions instead of changing old roles.
export const FACTIONS_V1=Object.freeze([
  {id:'faction.yamen',name:'府衙',kind:'law',treasuryActorId:'guard',
    members:[{actorId:'guard',roles:['constable','case_officer','treasurer']},{actorId:'guard-2',roles:['constable','reinforcement']}],
    servicePlaceIds:['place.yamen-desk','place.yamen-patrol']},
  {id:'faction.guild',name:'商会',kind:'trade',treasuryActorId:'merchant',
    members:[{actorId:'merchant',roles:['shopkeeper','buyer','treasurer']},{actorId:'supplier-1',roles:['supplier']}],
    servicePlaceIds:['place.medicine','place.supplier-loading']},
  {id:'faction.river',name:'渡口帮',kind:'gang',treasuryActorId:'gang-1',
    members:[{actorId:'gang-1',roles:['runner','treasurer']}],servicePlaceIds:['place.river-meeting']},
])
export const FACTION_ROLE_WORDS=Object.freeze({constable:'捕快',case_officer:'接案调解',treasurer:'经手开支',reinforcement:'支援同僚',shopkeeper:'经营药铺',buyer:'采买货物',supplier:'供货',runner:'渡口跑腿'})
