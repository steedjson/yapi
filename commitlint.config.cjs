// commit message 校验：对齐原 validate-commit-msg 配置
// （types 自定义集合、subject 非空、header 最长 100；warnOnFail 原为 false，此处用 error 级）。
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', ['feat', 'fix', 'docs', 'test', 'chore', 'refactor', 'opti']],
    'subject-empty': [2, 'never'],
    'header-max-length': [2, 'always', 100]
  }
};
