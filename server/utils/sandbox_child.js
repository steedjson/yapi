// @ts-check
// 沙箱子进程入口（常驻模式）。安全边界 = 进程隔离：用户脚本运行在独立进程的
// 受限 vm 上下文中，无 require/process 暴露；同步死循环由 vm timeout 兜底，
// 异步挂起由父进程硬超时强杀。协议：父进程经 IPC 发送 { id, script, context }，
// 子进程回复 { id, result, logs } 或 { id, error, logs }；error 非空表示脚本
// 执行失败（message 已可读）。单条任务处理完毕不退出，继续监听下一条任务。
const vm = require('vm');

const MARK_ASSERT = '__YAPI_SANDBOX_ASSERT__';
const MARK_LOG = '__YAPI_SANDBOX_LOG__';
const MARK_RANDOM = '__YAPI_SANDBOX_RANDOM__';
const SYNC_TIMEOUT_MS = 3000;

process.on('message', (/** @type {*} */ input) => {
  /** @type {any[]} */
  const logs = [];
  /** @type {Record<string, any>} */
  const context = (input && input.context) || {};
  try {
    if (context.assert === MARK_ASSERT) context.assert = require('assert');
    if (context.log === MARK_LOG) {
      context.log = (/** @type {*} */ msg) => {
        logs.push(String(msg));
      };
    }
    if (context.Random === MARK_RANDOM) context.Random = require('mockjs').Random;

    const sandbox = vm.createContext(context);
    // async 包裹使脚本可用 await；.call(this) 保证 return this 返回沙箱对象。
    // timeout 只约束同步执行，异步挂起由父进程硬超时强杀。
    const wrapped =
      '(async function(){' +
      ((input && input.script) || '') +
      '\n;return this;}).call(this)';
    const result = vm.runInContext(wrapped, sandbox, {
      timeout: SYNC_TIMEOUT_MS
    });
    Promise.resolve(result).then(
      value => {
        let serialized;
        try {
          serialized = JSON.stringify(value);
        } catch (err) {
          return reply({
            id: input && input.id,
            error: '沙箱返回值序列化失败: ' + (/** @type {*} */ (err)).message,
            logs
          });
        }
        reply({ id: input && input.id, result: serialized, logs });
      },
      e => reply({ id: input && input.id, error: readableError(e), logs })
    );
  } catch (e) {
    reply({ id: input && input.id, error: readableError(e), logs });
  }
});

// IPC 通道被父进程关闭时 send 会同步抛错，此时直接退出让父进程补池即可。
/**
 * @param {*} payload 回复给父进程的消息体
 */
function reply(payload) {
  try {
    // process.send 在非 fork 场景为 undefined，此处保持原有"抛错即退出"语义
    (/** @type {*} */ (process).send)(payload);
  } catch (e) {
    process.exit(0);
  }
}

/**
 * @param {*} e 任意异常值
 * @returns {string} 可读错误描述
 */
function readableError(e) {
  return e && e.message ? e.name + ': ' + e.message : String(e);
}
