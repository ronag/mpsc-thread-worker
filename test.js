import { create } from './index.js'
import { isMainThread, threadId, Worker } from 'worker_threads'

const writer = await create({ size: 1024 * 1024 })

if (isMainThread) {
  writer.write(Buffer.from('Hello, World from main thread!'))

  const workers = new Array(4)
    .fill(null)
    .map(() => new Worker(new URL('./test.js', import.meta.url)))
  await Promise.all(workers.map((worker) => new Promise((resolve) => worker.on('exit', resolve))))
} else {
  writer.write(Buffer.from('Hello, World from worker!'))
}
