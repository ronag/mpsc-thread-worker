import tp from 'node:timers/promises'
import { workerData } from 'node:worker_threads'
import { align, READ_INDEX } from './util.js'

const { sharedState, sharedBuffer } = workerData

const buffer8 = Buffer.from(sharedBuffer)
const buffer32 = new Int32Array(sharedBuffer)
const state32 = new Int32Array(sharedState)

let pos = 0
while (true) {
  let len = 0

  while (true) {
    len = Atomics.load(buffer32, pos / 4)

    if (len > 0) {
      break
    }

    Atomics.store(state32, READ_INDEX, pos)

    if (len === 0) {
      await tp.setTimeout(40)
    } else if (len === -1) {
      pos = 0
    } else if (len === -2) {
      process.exit(0)
    }
  }

  const data = buffer8.subarray(pos + 4, pos + 4 + len)

  // XXX: Do something with the data...
  console.log(data.toString())

  pos = align(pos + len + 4)
}
