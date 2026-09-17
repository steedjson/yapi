// @ts-check
// 常驻沙箱进程池（替代逐次 spawn 的冷启动）：维护 2~4 个 fork 出来的常驻
// Worker，任务经 IPC 派发，省去每次 45ms+ 的 Node 冷启动开销。跨进程序列化
// 会丢函数，assert/log/Random 占位符由子进程还原真实实现（见 sandbox_child.js）。
// 可靠性保护：单任务 5s 硬超时强杀 Worker 并补池；Worker 崩溃自动重建并拒绝
// 其在途任务；单个 Worker 累计执行 1000 次后优雅轮换重启，防范长期内存泄露。
const child_process = require('child_process');
const os = require('os');
const path = require('path');

const CHILD_PATH = path.join(__dirname, 'sandbox_child.js');
// 进程池容量：随 CPU 核数伸缩，收敛在 2~4 个，避免小机器资源占用过大
const POOL_SIZE = Math.max(2, Math.min(4, os.cpus().length));
// 单任务硬超时：超时强杀 Worker 并补充新进程，防止异步挂起占死池子
const TASK_TIMEOUT_MS = 5000;
// 单个 Worker 累计执行任务数上限，达到后轮换重启
const MAX_TASKS_PER_WORKER = 1000;

/**
 * @typedef {Object} SandboxTask 一次待执行的沙箱任务
 * @property {{ id: number, script: string, context: Record<string, any> }} payload 派发给子进程的任务体
 * @property {(value: any) => void} resolve 成功回调（脚本改写后的沙箱对象）
 * @property {(reason: Error) => void} reject 失败回调
 */

/**
 * @typedef {Object} PoolWorker 常驻池化 Worker
 * @property {import('child_process').ChildProcess | null} child 常驻子进程
 * @property {boolean} busy 是否正在执行任务
 * @property {number} execCount 累计执行任务数（达上限后优雅轮换）
 * @property {SandboxTask | null} current 在途任务
 * @property {ReturnType<typeof setTimeout> | null} timer 单任务硬超时定时器
 */

/** @type {{ workers: PoolWorker[], queue: SandboxTask[] }} */
const pool = {
  workers: [],
  queue: []
};
let nextTaskId = 0;
let initialized = false;
let destroyed = false;

/**
 * 执行沙箱隔离动态脚本
 * @param {Record<string, any>} context
 * @param {string} script
 * @returns {Promise<any>} 脚本改写后的沙箱对象（`return this` 语义）
 */
function sandboxFn(context, script) {
  ensurePool();
  const payload = {
    id: ++nextTaskId,
    script: String(script),
    // assert/log/Random 在 commons 侧本就是函数，JSON 序列化必然丢失，
    // 统一改为占位符，由子进程注入对应真实实现
    context: Object.assign({}, context, {
      assert: '__YAPI_SANDBOX_ASSERT__',
      log: '__YAPI_SANDBOX_LOG__',
      Random: '__YAPI_SANDBOX_RANDOM__'
    })
  };
  return new Promise((resolve, reject) => {
    dispatch({ payload, resolve, reject });
  });
}

// 测试完成后调用可销毁进程池，避免 AVA 因存活的子进程挂起
sandboxFn.destroy = function destroy() {
  destroyed = true;
  const queued = pool.queue.splice(0, pool.queue.length);
  queued.forEach(task => task.reject(new Error('沙箱进程池已销毁')));
  pool.workers.splice(0).forEach(killWorker);
};

function ensurePool() {
  if (initialized) return;
  initialized = true;
  for (let i = 0; i < POOL_SIZE; i++) {
    spawnWorker();
  }
}

/** @returns {PoolWorker | null} 新建的 Worker；池已销毁时返回 null */
function spawnWorker() {
  if (destroyed) return null;
  /** @type {PoolWorker} */
  const worker = { child: null, busy: false, execCount: 0, current: null, timer: null };
  const child = child_process.fork(CHILD_PATH, {
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: process.env
  });
  worker.child = child;

  // 池子进程不阻碍宿主进程退出：AVA 测试结束或服务关闭时无需等待空闲 Worker
  child.unref();
  // stdout/stderr 在 stdio 配置下必然存在；@types/node 将其标注为 Readable，
  // 但运行时是带 unref 的流对象，故按运行时真实能力断言
  if (child.stdout) (/** @type {*} */ (child.stdout)).unref();
  if (child.stderr) (/** @type {*} */ (child.stderr)).unref();
  if (child.channel && typeof child.channel.unref === 'function') {
    child.channel.unref();
  }

  child.on('message', msg => onWorkerMessage(worker, msg));
  child.on('exit', () => onWorkerDeath(worker));
  child.on('error', () => onWorkerDeath(worker));

  pool.workers.push(worker);
  return worker;
}

/**
 * @param {SandboxTask} task 待派发任务
 * @returns {void}
 */
function dispatch(task) {
  if (destroyed) {
    return task.reject(new Error('沙箱进程池已销毁'));
  }
  const worker = pool.workers.find(w => !w.busy);
  if (worker) {
    runTask(worker, task);
  } else {
    // 全部 Worker 忙碌，进入 FIFO 等待队列，由 pump() 在任务完成时派发
    pool.queue.push(task);
  }
}

function pump() {
  while (!destroyed && pool.queue.length > 0) {
    const worker = pool.workers.find(w => !w.busy);
    if (!worker) return;
    runTask(worker, /** @type {SandboxTask} */ (pool.queue.shift()));
  }
}

/**
 * @param {PoolWorker} worker 执行任务的 Worker
 * @param {SandboxTask} task 任务体
 * @returns {void}
 */
function runTask(worker, task) {
  worker.busy = true;
  worker.current = task;
  // 硬超时守护：异步挂起无法被子进程自身打断，只能由父进程强杀并补池
  worker.timer = setTimeout(() => {
    const current = worker.current;
    removeWorker(worker);
    killWorker(worker);
    if (!destroyed) spawnWorker();
    if (current) {
      current.reject(
        new Error(
          '沙箱脚本执行超时（' + TASK_TIMEOUT_MS / 1000 + 's），工作进程已被强制终止'
        )
      );
    }
    pump();
  }, TASK_TIMEOUT_MS);
  try {
    // child 在池生命周期内非空；为空时保持原语义（抛错 → 走崩溃路径）
    (/** @type {*} */ (worker.child)).send(task.payload, (/** @type {*} */ err) => {
      // 发送失败说明进程已死，走崩溃路径：任务 reject + 补池 + 派发队列
      if (err) onWorkerDeath(worker);
    });
  } catch (e) {
    onWorkerDeath(worker);
  }
}

/**
 * @param {PoolWorker} worker 上报结果的 Worker
 * @param {*} msg 子进程 IPC 消息
 * @returns {void}
 */
function onWorkerMessage(worker, msg) {
  const task = worker.current;
  // 每个 Worker 同一时刻只有一个在途任务，id 不匹配的响应直接丢弃
  if (!task || !msg || msg.id !== task.payload.id) return;
  finishTask(worker, () => {
    if (msg.error) {
      task.reject(new Error(msg.error));
      return;
    }
    try {
      const result = msg.result === '' ? '' : JSON.parse(msg.result || 'null');
      if (msg.logs && msg.logs.length && result && typeof result === 'object') {
        result.logs = (result.logs || []).concat(msg.logs);
      }
      task.resolve(result);
    } catch (e) {
      task.reject(new Error('沙箱结果解析失败: ' + (/** @type {*} */ (e)).message));
    }
  });
}

/**
 * @param {PoolWorker} worker 完成任务的 Worker
 * @param {() => void} settle 结算回调（resolve/reject 在途任务）
 * @returns {void}
 */
function finishTask(worker, settle) {
  if (worker.timer) {
    clearTimeout(worker.timer);
    worker.timer = null;
  }
  worker.current = null;
  worker.busy = false;
  worker.execCount += 1;
  settle();

  // 优雅轮换：在任务间隙换新进程，防范长期运行的内存泄露
  if (worker.execCount >= MAX_TASKS_PER_WORKER && !destroyed) {
    removeWorker(worker);
    killWorker(worker);
    spawnWorker();
  }
  pump();
}

/**
 * Worker 意外崩溃：拒绝其在途任务并自动补齐池大小
 * @param {PoolWorker} worker 已崩溃的 Worker
 * @returns {void}
 */
function onWorkerDeath(worker) {
  if (removeWorker(worker) === false) return;
  if (worker.current) {
    const task = worker.current;
    worker.current = null;
    task.reject(new Error('沙箱子进程异常退出'));
  }
  if (!destroyed) spawnWorker();
  pump();
}

/**
 * 从池中摘除 Worker
 * @param {PoolWorker} worker 目标 Worker
 * @returns {boolean} 已不在池中（超时强杀/轮换/销毁处理过）返回 false
 */
function removeWorker(worker) {
  const idx = pool.workers.indexOf(worker);
  if (idx === -1) return false;
  pool.workers.splice(idx, 1);
  if (worker.timer) {
    clearTimeout(worker.timer);
    worker.timer = null;
  }
  return true;
}

/**
 * @param {PoolWorker} worker 目标 Worker
 * @returns {void}
 */
function killWorker(worker) {
  try {
    (/** @type {*} */ (worker.child)).kill('SIGKILL');
  } catch (e) {
    // 进程已退出时忽略
  }
}

module.exports = sandboxFn;
