#!/usr/bin/env node
// @ts-check
// 从 YAPI_* 环境变量生成最小 config.json（JSON 输出到 stdout，由 entrypoint 重定向落盘）。
// 只覆盖核心项（端口 / 管理员账号 / 数据库连接）；邮箱、LDAP、MongoDB 集群、
// closeRegister 等完整配置请挂载 config.json，或用 YAPI_EXTRA_CONFIG_JSON 合并
// （如 YAPI_EXTRA_CONFIG_JSON='{"closeRegister":true,"mail":{...}}'）。

/**
 * 读取环境变量，空串视同未设置
 * @param {string} name 环境变量名
 * @param {string} fallback 默认值
 * @returns {string}
 */
function env(name, fallback) {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

const connectString = env('YAPI_DB_CONNECTSTRING', '');

/** @type {*} */
const config = {
  port: env('YAPI_PORT', '3000'),
  adminAccount: env('YAPI_ADMIN_ACCOUNT', 'admin@admin.com'),
  db: connectString
    ? {
        connectString: connectString,
        user: env('YAPI_DB_USER', ''),
        pass: env('YAPI_DB_PASS', '')
      }
    : {
        servername: env('YAPI_DB_SERVERNAME', '127.0.0.1'),
        DATABASE: env('YAPI_DB_DATABASE', 'yapi'),
        port: parseInt(env('YAPI_DB_PORT', '27017'), 10),
        user: env('YAPI_DB_USER', ''),
        pass: env('YAPI_DB_PASS', ''),
        authSource: env('YAPI_DB_AUTH_SOURCE', '')
      }
};

if (env('YAPI_CLOSE_REGISTER', '') === 'true') {
  config.closeRegister = true;
}

const extra = process.env.YAPI_EXTRA_CONFIG_JSON;
if (extra !== undefined && extra !== '') {
  try {
    Object.assign(config, JSON.parse(extra));
  } catch (/** @type {any} */ err) {
    console.error(`[gen-config] YAPI_EXTRA_CONFIG_JSON 不是合法 JSON: ${err.message}`);
    process.exit(1);
  }
}

process.stdout.write(`${JSON.stringify(config, null, 2)}\n`);
