export function createNavigationWorker(plan) {
  const worker = new Worker(new URL('./navigation.worker.js', import.meta.url), { type: 'module' })
  const pending = new Map()
  let serial = 0, closed = false, error = null
  // The immutable world plan is sent once. Later messages carry only geometry
  // deltas and bounded route requests, never meshes or another world snapshot.
  worker.postMessage({ type: 'init', plan })
  const failure = (type, reason) => type === 'route' ? [] : { status: 'blocked', reason }
  function settle(id, path) {
    const job = pending.get(id)
    if (!job) return
    clearTimeout(job.timeout)
    pending.delete(id)
    job.resolve(path)
  }
  function close() {
    if (closed) return
    closed = true
    worker.terminate()
    for (const [id, job] of pending) settle(id, failure(job.type, 'NAVIGATION_CLOSED'))
  }
  worker.onmessage = ({ data }) => {
    if (data.error) { error = data.error; console.warn('Navigation Worker:', error) }
    const job = pending.get(data.id)
    if (job) settle(data.id, data.error ? failure(job.type, 'NAVIGATION_ERROR') : job.type === 'route' ? data.path : data.result)
  }
  worker.onerror = event => {
    event.preventDefault()
    error = event.message || '寻路线程启动失败'
    console.warn('Navigation Worker:', error)
    close()
  }
  worker.onmessageerror = () => { error = '无法读取寻路结果'; close() }
  function request(type, payload) {
      if (closed || pending.size >= 8) return Promise.resolve(failure(type, closed ? 'NAVIGATION_CLOSED' : 'NAVIGATION_BUSY'))
      const id = ++serial
      return new Promise(resolve => {
        const timeout = setTimeout(() => settle(id, failure(type, 'NAVIGATION_TIMEOUT')), 3000)
        pending.set(id, { type, resolve, timeout })
        worker.postMessage({ type, id, ...payload })
      })
  }
  const install = (type, key, entry) => {
    if (!closed) worker.postMessage({ type, key, entry: { bounds: entry.bounds, colliders: entry.colliders } })
  }
  return {
    install: (key, entry) => install('chunk', key, entry),
    remove(key) { if (!closed) worker.postMessage({ type: 'remove', key }) },
    retain: (key, entry) => install('resident', key, entry),
    release(key) { if (!closed) worker.postMessage({ type: 'release', key }) },
    findRoute: (start, target) => request('route', { start, target }),
    findLocalRoute: (start, target) => request('local-route', { start, target }),
    findCityRoute: (start, target, options = {}) => request('city-route', { start, target, options }),
    requestGeometry: key => request('geometry', { key }),
    stats: () => ({ navigationPending: pending.size, navigationError: error }),
    dispose: close,
  }
}
