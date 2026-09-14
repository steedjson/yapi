// 沙箱子进程入口。安全边界 = 进程隔离：用户脚本运行在独立进程的受限 vm 上下文中，
// 无 require/process 暴露；同步死循环由 vm timeout 兜底，异步挂起由父进程强杀。
// 协议：stdin 收 {script, context} JSON；stdout 回 {result, logs} JSON；
// error 非空表示脚本执行失败（message 已可读）。
const vm = require('vm');

const MARK_ASSERT = '__YAPI_SANDBOX_ASSERT__';
const MARK_LOG = '__YAPI_SANDBOX_LOG__';
const MARK_RANDOM = '__YAPI_SANDBOX_RANDOM__';
const SYNC_TIMEOUT_MS = 3000;

let raw = '';
process.stdin.on('data', chunk => (raw += chunk));
process.stdin.on('end', () => {
  finish(run(tryParse(raw)));
});

function tryParse(raw) {
  try {
    return JSON.parse(raw);
  } catch (e) {
    return { script: '', context: {}, error: '沙箱输入解析失败: ' + e.message };
  }
}

function run(input) {
  const childLogs = [];
  let context = input.context || {};
  try {
    if (context.assert === MARK_ASSERT) context.assert = require('assert');
    if (context.log === MARK_LOG) {
      context.log = msg => {
        childLogs.push(String(msg));
      };
    }
    if (context.Random === MARK_RANDOM) context.Random = require('mockjs').Random;

    const sandbox = vm.createContext(context);
    // async 包裹使脚本可用 await；.call(this) 保证 return this 返回沙箱对象。
    // timeout 只约束同步执行，异步挂起由父进程 HARD_KILL_MS 强杀。
    const wrapped =
      '(async function(){' + input.script + '\n;return this;}).call(this)';
    const result = vm.runInContext(wrapped, sandbox, {
      timeout: SYNC_TIMEOUT_MS
    });
    return Promise.resolve(result).then(value => ({
      result: JSON.stringify(value),
      logs: childLogs
    }));
  } catch (e) {
    return Promise.resolve({
      error: e && e.message ? e.name + ': ' + e.message : String(e),
      logs: childLogs
    });
  }
}

function finish(outcome) {
  outcome.then(
    payload => {
      process.stdout.write(JSON.stringify(payload));
      process.exit(0);
    },
    e => {
      process.stdout.write(
        JSON.stringify({ error: e && e.message ? e.message : String(e) })
      );
      process.exit(0);
    }
  );
}
