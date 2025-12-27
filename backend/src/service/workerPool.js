const { Worker } = require('worker_threads');
const path = require('path');

class WorkerPool {
  constructor(workerPath, size = require('os').cpus().length || 2) {
    this.workerPath = workerPath;
    this.size = Math.max(1, size);
    this.workers = [];
    this.idle = [];
    this.queue = [];
    for (let i = 0; i < this.size; i++) this._addWorker();
  }

  _addWorker() {
    const worker = new Worker(this.workerPath);
    worker.on('message', (msg) => {
      // worker sent result for a running task
      if (worker._currentResolve) {
        worker._currentResolve(msg);
        worker._currentResolve = null;
        worker._currentReject = null;
      }
      this.idle.push(worker);
      this._runNext();
    });
    worker.on('error', (err) => {
      if (worker._currentReject) worker._currentReject(err);
      // replace worker
      try { worker.terminate(); } catch (e) {}
      const idx = this.workers.indexOf(worker);
      if (idx !== -1) this.workers.splice(idx, 1);
      const newW = new Worker(this.workerPath);
      this.workers.push(newW);
      this.idle.push(newW);
    });
    worker.on('exit', (code) => {
      // remove
      const idx = this.workers.indexOf(worker);
      if (idx !== -1) this.workers.splice(idx, 1);
      const idleIdx = this.idle.indexOf(worker);
      if (idleIdx !== -1) this.idle.splice(idleIdx, 1);
      // auto-recreate to maintain pool size
      if (this.workers.length < this.size) this._addWorker();
    });
    this.workers.push(worker);
    this.idle.push(worker);
  }

  _runNext() {
    if (this.queue.length === 0) return;
    if (this.idle.length === 0) return;
    const { payload, resolve, reject } = this.queue.shift();
    const worker = this.idle.shift();
    worker._currentResolve = resolve;
    worker._currentReject = reject;
    worker.postMessage(payload);
  }

  run(payload) {
    return new Promise((resolve, reject) => {
      this.queue.push({ payload, resolve, reject });
      this._runNext();
    });
  }

  destroy() {
    this.workers.forEach(w => { try { w.terminate(); } catch (e) {} });
    this.workers = [];
    this.idle = [];
    this.queue = [];
  }
}

module.exports = WorkerPool;
