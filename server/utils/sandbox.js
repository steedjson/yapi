// @ts-nocheck — Node 内建模块（child_process/path）缺 @types/node，checkJs 下不可用；运行时逻辑由 test/server/sandbox.test.js 9 例覆盖
// 子进程隔离沙箱（替代 safeify/vm2）：脚本在独立进程执行，无 require/process
// 暴露，超时强杀。跨进程序列化会丢函数，assert/log/Random 由子进程还原真实
// 实现（见 sandbox_child.js 的标记还原）。
const child_process = require('child_process');
const path = require('path');

const CHILD_PATH = path.join(__dirname, 'sandbox_child.js');
const HARD_KILL_MS = 60000;
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;

/**
 * 执行沙箱隔离动态脚本
 * @param {Record<string, any>} context
 * @param {string} script
 * @returns {Promise<any>} 脚本改写后的沙箱对象（`return this` 语义）
 */
module.exports = async function sandboxFn(context, script) {
    const payload = JSON.stringify({
        script: String(script),
        // assert/log/Random 在 commons 侧本就是函数，JSON 序列化必然丢失，
        // 统一改为占位符，由子进程注入对应真实实现
        context: Object.assign({}, context, {
            assert: '__YAPI_SANDBOX_ASSERT__',
            log: '__YAPI_SANDBOX_LOG__',
            Random: '__YAPI_SANDBOX_RANDOM__'
        })
    });

    return new Promise((resolve, reject) => {
        const child = child_process.spawn(process.execPath, [CHILD_PATH], {
            stdio: ['pipe', 'pipe', 'pipe']
        });
        let out = '';
        let errText = '';
        let settled = false;

        const timer = setTimeout(() => {
            settled = true;
            child.kill('SIGKILL');
            reject(new Error('沙箱脚本执行超时（60s），进程已被强制终止'));
        }, HARD_KILL_MS);

        child.stdout.on('data', d => {
            if (out.length < MAX_OUTPUT_BYTES) out += d;
        });
        child.stderr.on('data', d => {
            if (errText.length < 8192) errText += d;
        });
        child.on('error', e => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(e);
        });
        child.on('close', code => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            let parsed;
            try {
                parsed = JSON.parse(out);
            } catch (e) {
                return reject(
                    new Error('沙箱结果解析失败: ' + (errText || e.message))
                );
            }
            if (parsed.error) {
                return reject(new Error(parsed.error));
            }
            if (code !== 0) {
                return reject(
                    new Error('沙箱子进程异常退出: ' + (errText || 'code ' + code))
                );
            }
            resolve(parsed);
        });

        child.stdin.write(payload);
        child.stdin.end();
    }).then(parsed => {
        // 子进程收集到的 log() 输出挂在返回对象上，供调用方合并展示
        const result =
            parsed.result === '' ? '' : JSON.parse(parsed.result || 'null');
        if (parsed.logs && parsed.logs.length && result && typeof result === 'object') {
            result.logs = (result.logs || []).concat(parsed.logs);
        }
        return result;
    });
};
