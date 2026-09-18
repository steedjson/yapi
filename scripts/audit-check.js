#!/usr/bin/env node
'use strict';

/**
 * audit:ci —— npm audit 基线差分门禁（零依赖，仅 Node 内置模块）
 *
 * 行为：
 *   1. 读取基线 JSON（默认 scripts/audit-baseline.json，可用 --baseline <path> 覆盖）；
 *   2. 通过 spawnSync 运行 `npm audit --registry=https://registry.npmjs.org --json`。
 *      注意：存在漏洞时 npm audit 退出码为 1，此处仍然解析其 stdout JSON，不因退出码直接失败；
 *   3. 将 critical/high/moderate/low 与 total 计数与基线对比：
 *      - 任一计数高于基线 → exit 1，并打印漏洞明细（name/severity/via 标题）；
 *      - 全部不高于基线 → exit 0，打印对比摘要；低于基线时提示可下调基线。
 *
 * 退出码约定：
 *   0  门禁通过（所有计数均不高于基线）
 *   1  门禁失败（存在高于基线的计数，即新增漏洞）
 *   2  npm audit 执行/输出异常（网络失败、JSON 无法解析等），与“新增漏洞”相区分
 *   3  命令行参数或基线文件问题
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SEVERITIES = ['critical', 'high', 'moderate', 'low'];
const AUDIT_ARGS = ['audit', '--registry=https://registry.npmjs.org', '--json'];
const AUDIT_TIMEOUT_MS = 300000;
const SEVERITY_ORDER = { critical: 0, high: 1, moderate: 2, low: 3 };

function fail(code, message) {
  process.stderr.write(`[audit:ci] ${message}\n`);
  process.exit(code);
}

function severityRank(severity) {
  return SEVERITY_ORDER[severity] !== undefined ? SEVERITY_ORDER[severity] : 9;
}

function parseArgs(argv) {
  const opts = { baseline: path.join(__dirname, 'audit-baseline.json') };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--baseline') {
      if (i + 1 >= argv.length) {
        fail(3, '--baseline 需要跟一个文件路径，例如 --baseline /tmp/audit-baseline.json');
      }
      opts.baseline = argv[++i];
    } else if (arg.startsWith('--baseline=')) {
      const value = arg.slice('--baseline='.length);
      if (!value) fail(3, '--baseline= 之后的文件路径不能为空');
      opts.baseline = value;
    } else {
      fail(3, `未知参数：${arg}（本脚本仅支持 --baseline <path>）`);
    }
  }
  return opts;
}

function loadBaseline(baselinePath) {
  let raw;
  try {
    raw = fs.readFileSync(baselinePath, 'utf8');
  } catch (err) {
    fail(3, `无法读取基线文件 ${baselinePath}：${err.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    fail(3, `基线文件 ${baselinePath} 不是合法 JSON：${err.message}`);
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    fail(3, `基线文件 ${baselinePath} 格式非法：应为 JSON 对象，包含 ${SEVERITIES.join('/')} 与 total 计数`);
  }

  const baseline = {};
  for (const key of SEVERITIES.concat('total')) {
    const value = parsed[key];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      fail(3, `基线文件 ${baselinePath} 格式非法：${key} 必须是非负整数，当前为 ${JSON.stringify(value)}`);
    }
    baseline[key] = value;
  }
  return baseline;
}

function runNpmAudit() {
  const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmBin, AUDIT_ARGS, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: AUDIT_TIMEOUT_MS
  });

  if (result.error || result.signal) {
    const reason = result.error ? result.error.message : `收到信号 ${result.signal}`;
    fail(2, `npm audit 未能正常执行（${reason}）。请检查 npm 是否可用，以及能否访问 https://registry.npmjs.org。`);
  }

  let audit;
  try {
    audit = JSON.parse(result.stdout);
  } catch (err) {
    fail(
      2,
      'npm audit 的 stdout 无法解析为 JSON（可能是网络异常或 npm 输出被污染；这与“新增漏洞”失败是不同情况）：\n' +
        `  解析错误：${err.message}\n` +
        `  stdout 前 500 字符：${String(result.stdout || '').slice(0, 500)}\n` +
        `  stderr 前 500 字符：${String(result.stderr || '').slice(0, 500)}`
    );
  }

  if (audit === null || typeof audit !== 'object' || Array.isArray(audit)) {
    fail(2, 'npm audit 输出的 JSON 结构不符合预期（顶层应为对象）。');
  }

  if (audit.error && typeof audit.error === 'object') {
    const code = audit.error.code || 'UNKNOWN';
    const summary = audit.error.summary || '';
    fail(2, `npm audit 自身报错（可能是网络/registry 问题，而非新增漏洞）：[${code}] ${summary}`);
  }

  const metadata = audit.metadata && audit.metadata.vulnerabilities;
  if (!metadata || typeof metadata !== 'object') {
    fail(2, 'npm audit 输出缺少 metadata.vulnerabilities 计数信息（npm 版本过旧或输出异常）。');
  }

  const current = {};
  for (const severity of SEVERITIES) {
    current[severity] = Number(metadata[severity]) || 0;
  }
  current.total = Number(metadata.total);
  if (!Number.isInteger(current.total)) {
    current.total = SEVERITIES.reduce((sum, severity) => sum + current[severity], 0);
  }
  return { audit, current };
}

function viaTitle(via) {
  if (typeof via === 'string') return `间接依赖 ${via}`;
  if (via && typeof via === 'object' && typeof via.title === 'string') return via.title;
  return '未知来源';
}

function collectFindings(audit) {
  const vulnerabilities = audit.vulnerabilities || {};
  return Object.keys(vulnerabilities)
    .map((name) => {
      const entry = vulnerabilities[name];
      return {
        name: entry.name || name,
        severity: SEVERITY_ORDER[entry.severity] !== undefined ? entry.severity : 'unknown',
        via: (Array.isArray(entry.via) ? entry.via : []).map(viaTitle)
      };
    })
    .sort(
      (a, b) => severityRank(a.severity) - severityRank(b.severity) || a.name.localeCompare(b.name)
    );
}

function pad(value, width) {
  return String(value).padStart(width);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const baseline = loadBaseline(opts.baseline);
  const { audit, current } = runNpmAudit();

  console.log(`[audit:ci] npm audit 基线差分对比（基线文件：${opts.baseline}）：`);
  console.log('  severity      baseline  current   delta');
  let hasExceeded = false;
  for (const key of SEVERITIES.concat('total')) {
    const delta = current[key] - baseline[key];
    if (delta > 0) hasExceeded = true;
    const mark = delta > 0 ? '  <-- 高于基线' : delta < 0 ? '  （低于基线，可下调）' : '';
    console.log(
      `  ${key.padEnd(10)}  ${pad(baseline[key], 8)}  ${pad(current[key], 7)}  ${pad(delta, 6)}${mark}`
    );
  }

  if (hasExceeded) {
    const findings = collectFindings(audit);
    process.stderr.write('\n[audit:ci] 门禁失败：存在高于基线的漏洞计数（新增漏洞），明细如下：\n');
    process.stderr.write(
      `[audit:ci] 当前共 ${findings.length} 个漏洞条目（来自 npm audit 输出的 vulnerabilities）：\n`
    );
    for (const finding of findings) {
      const viaText = finding.via.length > 0 ? finding.via.join(' | ') : '未知来源';
      process.stderr.write(`  - [${finding.severity}] ${finding.name} | via: ${viaText}\n`);
    }
    process.exit(1);
  }

  console.log('[audit:ci] 通过：所有 severity 与 total 计数均不高于基线。');
  const anyBelow = SEVERITIES.concat('total').some((key) => current[key] < baseline[key]);
  if (anyBelow) {
    console.log('[audit:ci] 提示：当前计数低于基线，可在修复漏洞后更新基线文件下调阈值。');
  }
  process.exit(0);
}

main();
