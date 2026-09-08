/** Measurements are local diagnostics, never gameplay time or save truth. */
export function createLivingMetrics() {
  const data={saveCount:0,saveFailures:0,saveLastMs:null,saveTotalMs:0,saveMaxMs:null}
  let saveStarted=null
  return {
    async save(adapter,checkpoint,meta) {
      const started=performance.now();saveStarted=started
      try {
        const result=await adapter(checkpoint,meta)
        if(result?.status!=='committed')data.saveFailures++
        return result
      } catch(error){data.saveFailures++;throw error}
      finally {
        const elapsed=performance.now()-started
        data.saveCount++;data.saveLastMs=elapsed;data.saveTotalMs+=elapsed;data.saveMaxMs=Math.max(data.saveMaxMs??0,elapsed);saveStarted=null
      }
    },
    read:()=>({...data,saveMeanMs:data.saveCount?data.saveTotalMs/data.saveCount:null,savePendingMs:saveStarted===null?null:performance.now()-saveStarted}),
  }
}
