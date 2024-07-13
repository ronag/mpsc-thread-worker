import assert from 'node:assert'
import { isMainThread, Worker, threadId } from 'node:worker_threads'
import { register as registerLeakFree } from 'on-exit-leak-free'
import { align, READ_INDEX, WRITE_INDEX } from './util.js'

export async function create({ size = 1024 * 1024 }) {
  const bc = new BroadcastChannel('_worker_stream')

  if (isMainThread) {
    const sharedState = new SharedArrayBuffer(128)
    const sharedBuffer = new SharedArrayBuffer(size)

    const worker = new Worker(new URL('./worker.js', import.meta.url), {
      workerData: { sharedState, sharedBuffer },
    })
    const writer = makeWriter({ sharedState, sharedBuffer })

    bc.onmessage = ({ data }) => {
      if (data.type === 'init:req') {
        bc.postMessage({
          type: 'init:res',
          threadId: data.threadId,
          sharedState,
          sharedBuffer,
        })
      }
    }

    registerLeakFree(() => {
      writer.flushSync()
      worker.terminate()
    })

    return writer
  } else {
    return new Promise((resolve) => {
      bc.onmessage = ({ data }) => {
        if (data.type === 'init:res' && data.threadId === threadId) {
          resolve(makeWriter(data))
        }
      }
      bc.postMessage({ type: 'init:req', threadId })
    })
  }
}

function makeWriter({ sharedState, sharedBuffer }) {
  const state32 = new Int32Array(sharedState)
  const buffer8 = Buffer.from(sharedBuffer)
  const buffer32 = new Int32Array(sharedBuffer)

  function acquire(len) {
    let currPos
    let nextPos
    do {
      currPos = Atomics.load(state32, WRITE_INDEX) * 4
      nextPos = align(currPos + len)
      assert(currPos % 4 === 0)
      assert(nextPos % 4 === 0)
    } while (Atomics.compareExchange(state32, 0, currPos / 4, nextPos / 4) !== currPos / 4)

    return currPos
  }

  return {
    // XXX: Support strings also.
    write(data) {
      if (data.byteLength === 0 || data.byteLength > sharedBuffer.byteLength - 4) {
        throw new Error('invalid data.byteLength')
      }

      const pos = acquire(data.length + 4)

      // XXX: pos can overflow 2^31 * 4..

      // XXX: This should wrap around and send -1
      // to signal wrap around.
      // dataPos = pos % sharedBuffer.byteLength

      data.copy(buffer8, pos + 4)
      Atomics.store(buffer32, pos / 4, data.length)
    },
    flushSync() {
      Atomics.store(buffer32, acquire(4) / 4, -2) // Send EOF

      const writePos = Atomics.load(state32, WRITE_INDEX)
      let readPos = Atomics.load(state32, READ_INDEX)
      while (readPos < writePos) {
        Atomics.wait(state32, READ_INDEX, readPos, 100)
        readPos = Atomics.load(state32, READ_INDEX)
      }
    },
  }
}
