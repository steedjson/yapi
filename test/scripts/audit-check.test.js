// audit-check.js 退出码契约回归测试（离线：通过 PATH 注入假 npm，不访问真实 registry）
// 退出码约定见 scripts/audit-check.js 头注释：0 门禁通过 / 1 新增漏洞 / 2 audit 输出异常 / 3 参数或基线问题
import test from 'ava';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const SCRIPT = path.join(__dirname, '../../scripts/audit-check.js');

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function runScript(args, env) {
  return spawnSync(process.execPath, [SCRIPT].concat(args), {
    encoding: 'utf8',
    env: env || process.env
  });
}

// 生成一个假 npm 可执行文件并返回带 shim 前置 PATH 的环境，
// audit-check.js 会以 `npm audit --registry=... --json` 调用它
function makeNpmShim(stdout) {
  const dir = makeTempDir('audit-check-shim-');
  const npmPath = path.join(dir, 'npm');
  const body = typeof stdout === 'function' ? stdout() : stdout;
  fs.writeFileSync(
    npmPath,
    '#!/usr/bin/env node\nprocess.stdout.write(' + JSON.stringify(body) + ');\n'
  );
  fs.chmodSync(npmPath, 0o755);
  return Object.assign({}, process.env, { PATH: dir + path.delimiter + process.env.PATH });
}

function writeBaseline(content) {
  const dir = makeTempDir('audit-check-baseline-');
  const file = path.join(dir, 'baseline.json');
  fs.writeFileSync(file, content);
  return file;
}

test.serial('参数问题：基线文件不存在 → 退出码 3', t => {
  const res = runScript(['--baseline', '/nonexistent/audit-baseline.json']);
  t.is(res.status, 3);
  t.true(res.stderr.includes('无法读取基线文件'));
});

test.serial('参数问题：基线不是合法 JSON → 退出码 3', t => {
  const file = writeBaseline('{not valid json');
  const res = runScript(['--baseline', file]);
  t.is(res.status, 3);
  t.true(res.stderr.includes('不是合法 JSON'));
});

test.serial('参数问题：基线计数为负数 → 退出码 3', t => {
  const file = writeBaseline('{"critical":-1,"high":0,"moderate":0,"low":0,"total":0}');
  const res = runScript(['--baseline=' + file]);
  t.is(res.status, 3);
  t.true(res.stderr.includes('必须是非负整数'));
});

test.serial('参数问题：未知参数 → 退出码 3', t => {
  const res = runScript(['--wat']);
  t.is(res.status, 3);
  t.true(res.stderr.includes('未知参数'));
});

test.serial('audit 输出不可解析 → 退出码 2（与新增漏洞相区分）', t => {
  const env = makeNpmShim('this is not json');
  const file = writeBaseline('{"critical":0,"high":0,"moderate":0,"low":0,"total":0}');
  const res = runScript(['--baseline', file], env);
  t.is(res.status, 2);
  t.true(res.stderr.includes('无法解析为 JSON'));
});

test.serial('计数高于基线 → 退出码 1 并打印漏洞明细', t => {
  const auditJson = JSON.stringify({
    metadata: { vulnerabilities: { critical: 0, high: 1, moderate: 0, low: 0, total: 1 } },
    vulnerabilities: {
      lodash: { name: 'lodash', severity: 'high', via: [{ title: 'Prototype Pollution in lodash' }] }
    }
  });
  const env = makeNpmShim(auditJson);
  const file = writeBaseline('{"critical":0,"high":0,"moderate":0,"low":0,"total":0}');
  const res = runScript(['--baseline', file], env);
  t.is(res.status, 1);
  t.true(res.stderr.includes('门禁失败'));
  t.true(res.stderr.includes('lodash'));
});

test.serial('计数不高于基线 → 退出码 0', t => {
  const auditJson = JSON.stringify({
    metadata: { vulnerabilities: { critical: 3, high: 24, moderate: 8, low: 0, total: 35 } },
    vulnerabilities: {}
  });
  const env = makeNpmShim(auditJson);
  const file = writeBaseline('{"critical":3,"high":24,"moderate":8,"low":0,"total":35}');
  const res = runScript(['--baseline', file], env);
  t.is(res.status, 0);
  t.true(res.stdout.includes('通过'));
});
