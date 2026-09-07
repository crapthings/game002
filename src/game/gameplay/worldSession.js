import { createGameplay, executeGameplay, restoreGameplay } from './runtime.js'

const clone = value => structuredClone(value)
const natural = n => Number.isSafeInteger(n) && n >= 0
const validTime = n => natural(n) && Number.isSafeInteger(n+100000)
const failure = code => ({ok:false,code,events:[]})

export function restoreWorldCheckpoint(config,saved) {
  if (saved?.version !== 1 || !natural(saved.sequence) || !validTime(saved.simulationAt) ||
    !saved.gameplay || saved.simulationAt < saved.gameplay.at) return failure('INVALID_CHECKPOINT')
  const result = restoreGameplay(config,saved.gameplay)
  if (!result.ok) return result
  return {ok:true,code:'RESTORED',catalog:result.catalog,
    checkpoint:{version:1,sequence:saved.sequence,simulationAt:saved.simulationAt,gameplay:result.state},events:[]}
}

// Alternative to createGameplaySession for worlds with an independent clock.
// Inject ONE atomic checkpoint store. Do not operate both session types on the
// same world. sequence protects clock-only saves as well as gameplay changes.
export function createWorldSession(config,{saved,save} = {}) {
  if (typeof save !== 'function') throw new TypeError('A checkpoint save adapter is required.')
  const opened = saved === undefined ? createGameplay(config) : restoreWorldCheckpoint(config,saved)
  if (opened.ok === false) throw Object.assign(new Error(opened.code),{code:opened.code})
  let current = opened.checkpoint ?? {version:1,sequence:0,simulationAt:0,gameplay:opened.state}
  const catalog = opened.catalog
  let queue = Promise.resolve(), pending = 0, closed = false, recoveryRequired = false, saving = false

  async function commit(candidate) {
    if (!natural(current.sequence+1)) return failure('REVISION_OVERFLOW')
    candidate.sequence = current.sequence+1
    let receipt
    saving = true
    try {
      receipt = await save(clone(candidate),{configId:current.gameplay.configId,
        expectedSequence:current.sequence,nextSequence:candidate.sequence})
    } catch {
      recoveryRequired = true
      return failure('SAVE_OUTCOME_UNKNOWN')
    } finally { saving = false }
    if (receipt?.status === 'rejected') {
      if (receipt.code === 'STORAGE_CONFLICT') recoveryRequired = true
      return failure(receipt.code === 'STORAGE_CONFLICT' ? 'STORAGE_CONFLICT' : 'SAVE_REJECTED')
    }
    if (receipt?.status !== 'committed' || receipt.sequence !== candidate.sequence) {
      recoveryRequired = true
      return failure('SAVE_OUTCOME_UNKNOWN')
    }
    current = candidate
    return null
  }

  function enqueue(operation) {
    if (closed) return Promise.resolve(failure('SESSION_CLOSED'))
    if (recoveryRequired) return Promise.resolve(failure('RECOVERY_REQUIRED'))
    if (pending >= 32) return Promise.resolve(failure('QUEUE_FULL'))
    pending++
    const result = queue.then(() => closed ? failure('SESSION_CLOSED') :
      recoveryRequired ? failure('RECOVERY_REQUIRED') : operation()).finally(() => { pending-- })
    queue = result.catch(() => {})
    return result
  }

  return {
    snapshot: () => clone(current),
    status: () => ({closed,recoveryRequired,saving,pending,sequence:current.sequence,simulationAt:current.simulationAt}),
    dispatch(request) {
      let submitted
      try { submitted = clone(request) } catch { return Promise.resolve(failure('INVALID_REQUEST')) }
      return enqueue(async () => {
        const result = executeGameplay(current.gameplay,catalog,submitted)
        // An old successful request must deduplicate even after a clock save.
        if (!result.ok || result.duplicate) return result
        if (!submitted.steps.every(s => validTime(s.context.at) && s.context.at >= current.simulationAt)) return failure('STALE_WORLD_TIME')
        const candidate = {version:1,sequence:current.sequence,simulationAt:result.state.at,gameplay:result.state}
        const error = await commit(candidate)
        return error ?? {...result,state:clone(current.gameplay)}
      })
    },
    checkpoint(at) {
      return enqueue(async () => {
        if (!validTime(at) || at < current.simulationAt) return failure('INVALID_TIME')
        // This does not append a gameplay request/event or advance its revision.
        // Even an initial at=0 call saves the newly created world explicitly.
        const error = await commit({...clone(current),simulationAt:at})
        return error ?? {ok:true,code:'CHECKPOINTED',checkpoint:clone(current),events:[]}
      })
    },
    async close() { closed = true; await queue; return clone(current) },
  }
}
