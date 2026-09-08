export function createNavigationWorker(plan) {
  const worker = new Worker(new URL('./navigation.worker.js', import.meta.url), { type: 'module' })
  const pending = new Map()
  let serial = 0, closed = false, error = null
  // Send geometry once, then only install/evict deltas and small route requests.
  worker.postMessage({ type: 'init', plan: {
    bounds: plan.bounds,
    fortifications: { colliders: plan.fortifications?.colliders ?? [], elevation: plan.fortifications?.elevation },
    city: plan.city ? { water: plan.city.water, bridges: plan.city.bridges } : null,
  } })
  function settle(id, path) {
    const job = pending.get(id)
    if (!job) return
    clearTimeout(job.timeout)
    pending.delete(id)
    job.resolve(path)
  }
  function close() {
    closed = true
    worker.terminate()
    for (const id of pending.keys()) settle(id, [])
  }
  worker.onmessage = ({ data }) => {
    if (data.error) { error = data.error; console.warn('Navigation Worker:', error) }
    settle(data.id, data.path)
  }
  worker.onerror = event => {
    event.preventDefault()
    error = event.message || '寻路线程启动失败'
    console.warn('Navigation Worker:', error)
    close()
  }
  worker.onmessageerror = () => { error = '无法读取寻路结果'; close() }
  return {
    install(key, entry) { if (!closed) worker.postMessage({ type: 'chunk', key, entry: { bounds: entry.bounds, colliders: entry.colliders } }) },
    remove(key) { if (!closed) worker.postMessage({ type: 'remove', key }) },
    findRoute(start, target) {
      if (closed || pending.size >= 8) return Promise.resolve([])
      const id = ++serial
      return new Promise(resolve => {
        const timeout = setTimeout(() => settle(id, []), 3000)
        pending.set(id, { resolve, timeout })
        worker.postMessage({ type: 'route', id, start, target })
      })
    },
    stats: () => ({ navigationPending: pending.size, navigationError: error }),
    dispose: close,
  }
}
