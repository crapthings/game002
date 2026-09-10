export const STANDING_V1=Object.freeze({
  requiredCompletions:2,
  issuers:[{actorId:'merchant',kind:'guild_helper',organizationId:'faction.guild',service:'medicine_discount'},
    {actorId:'resident-2',kind:'trusted_neighbor',organizationId:null,service:'rent_and_training'}],
  discount:{medicine:1,ration:1},
})
export const GROWTH_V1=Object.freeze({mentorId:'resident-2',skillId:'martial-basics-v1',price:5,durationMs:30000,attackBonus:2,
  rentAmount:5,rentDurationMs:1440000,sampleMs:1000,maxSampleGapMs:1500})
