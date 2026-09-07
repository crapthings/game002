import { executeGameplay } from './runtime.js'

const failure = code => ({ok:false,code,events:[]})
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}

/** Prepare once from trusted policy, then retain this exact request for retries.
 * Preflight uses the same reducer but discards its candidate and events. It does
 * not reserve stock, save, or guarantee success against a later revision.
 */
export function prepareGameplayRequest(state,catalog,{id,steps} = {}) {
  let request
  try { request = structuredClone({id,expectedRevision:state?.revision,steps}) }
  catch { return failure('INVALID_REQUEST') }
  // A used ID must be retried with its original request, never reconstructed
  // using today's prices, evidence or revision.
  if (state?.journal?.some(entry => entry.id === id)) return failure('REQUEST_ID_ALREADY_USED')
  const result = executeGameplay(state,catalog,request)
  if (!result.ok) return result
  return {ok:true,code:'PREPARED',request:freeze(request)}
}
