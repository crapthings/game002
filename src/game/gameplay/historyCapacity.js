// Diagnostics only. Actual admission still happens atomically in the reducers.
// All counts are persisted entries, not seconds of gameplay or free NPC slots.
export function historyCapacity(state) {
  const rows = [
    ['requests',state.journal,1],
    ['interaction',state.interactions.events,1],
    ['knowledge',state.social.events,1],
    ['combat',state.combat?.receipts,1],
    ['equipment',state.equipment?.events,1],
    ['property',state.property?.events,1],
    ['robbery',state.robbery?.events,2],
    ['crime',state.crime?.events,1],
    ['pursuit',state.pursuit?.events,1],
    ['village',state.village?.events,1],
  ].filter(([,entries]) => entries !== undefined)
  const channels = rows.map(([domain,entries,cost]) => {
    const remaining = Math.max(0,4096-entries.length)
    return {domain,used:entries.length,limit:4096,remaining,
      standaloneOperations:Math.floor(remaining/cost),
      status:remaining < cost ? 'full' : remaining <= 128 ? 'low' : 'available'}
  })
  return {
    status:channels.some(c => c.status === 'full') ? 'full' : channels.some(c => c.status === 'low') ? 'low' : 'available',
    channels,
    // Clock-only checkpoint does not append any of these histories.
    checkpointConsumesHistory:false,
  }
}
