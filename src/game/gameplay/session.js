import { createGameplay, executeGameplay, restoreGameplay } from './runtime.js'

const clone = value => structuredClone(value)
const failure = code => ({ok:false,code,events:[]})

/**
 * Owns one world's committed runtime state. The injected save adapter must use
 * an atomic compare-and-write against expectedRevision and configId.
 * No browser storage, scene, timers or callbacks are imported by this module.
 */
export function createGameplaySession(config, { saved, save } = {}) {
  if (typeof save !== 'function') throw new TypeError('A save adapter is required.')
  const opened = saved === undefined ? createGameplay(config) : restoreGameplay(config,saved)
  if (opened.ok === false) {
    const error = new Error(opened.code)
    error.code = opened.code
    throw error
  }
  const catalog = opened.catalog
  let state = opened.state, queue = Promise.resolve()
  let closed = false, recoveryRequired = false, saving = false, pending = 0

  async function apply(request) {
    if (closed) return failure('SESSION_CLOSED')
    if (recoveryRequired) return failure('RECOVERY_REQUIRED')
    const result = executeGameplay(state,catalog,request)
    if (!result.ok || result.duplicate) return result
    // Nothing observable is published before the adapter confirms the whole
    // checkpoint committed. Adapter mutation cannot affect the candidate.
    saving = true
    let receipt
    try {
      receipt = await save(clone(result.state),{
        configId:state.configId,expectedRevision:state.revision,
        nextRevision:result.state.revision,requestId:request.id,
      })
    } catch {
      // An exception may occur after a successful disk write. Retrying against
      // stale memory is unsafe: reopen from storage before another command.
      recoveryRequired = true
      return failure('SAVE_OUTCOME_UNKNOWN')
    } finally { saving = false }
    if (receipt?.status === 'rejected') {
      // 'rejected' guarantees this candidate was not written. A revision
      // conflict still requires reloading the state committed by another writer.
      if (receipt.code === 'STORAGE_CONFLICT') recoveryRequired = true
      return failure(receipt.code === 'STORAGE_CONFLICT' ? 'STORAGE_CONFLICT' : 'SAVE_REJECTED')
    }
    if (receipt?.status !== 'committed' || receipt.revision !== result.state.revision) {
      recoveryRequired = true
      return failure('SAVE_OUTCOME_UNKNOWN')
    }
    state = result.state
    return {...result,state:clone(state)}
  }

  return {
    snapshot: () => clone(state),
    status: () => ({closed,recoveryRequired,saving,pending,revision:state.revision}),
    dispatch(request) {
      if (closed) return Promise.resolve(failure('SESSION_CLOSED'))
      if (recoveryRequired) return Promise.resolve(failure('RECOVERY_REQUIRED'))
      // Bounded outstanding work; rejected queue entries consume no request ID.
      if (pending >= 32) return Promise.resolve(failure('QUEUE_FULL'))
      let submitted
      try { submitted = clone(request) } catch { return Promise.resolve(failure('INVALID_REQUEST')) }
      pending++
      const operation = queue.then(() => apply(submitted))
      const settled = operation.finally(() => { pending-- })
      queue = settled.catch(() => {})
      return settled
    },
    // Stops accepting/starting requests, but does not cancel a write in flight.
    // Await close before detaching a world or discarding its pending UI result.
    async close() { closed = true; await queue; return clone(state) },
  }
}
