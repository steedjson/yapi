// ESLint 9 flat config：取代 .eslintrc.js + .eslintignore。
// 规则保持宽松（recommended 级别，无风格规则），历史代码仅需通过语法与正确性检查。
const babelParser = require('@babel/eslint-parser');
const js = require('@eslint/js');
const globals = require('globals');
const reactPlugin = require('eslint-plugin-react');
const importPlugin = require('eslint-plugin-import');

module.exports = [
  {
    // 原 .eslintignore（node_modules 默认忽略，此处显式保留并补充产物/备份目录）
    ignores: [
      '**/node_modules/**',
      'static/**',
      'backup-before-refactor/**',
      'log/**',
      'runtime/**',
      'iconfont/**',
      // ydoc 文档目录，index.jsx 为 front matter 配置而非源码
      'docs/**',
      'common/json-schema-mockjs.js',
      // 第三方 vendored 压缩产物，不属于本项目代码
      'common/tui-editor/dist/**'
    ]
  },
  {
    files: ['**/*.js', '**/*.jsx'],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        // 单一来源复用 babel.config.js（含 legacy decorators，解析 @withRouter 等装饰器）
        babelOptions: {
          configFile: require.resolve('./babel.config.js')
        },
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true
        }
      },
      // 原 env: browser + commonjs + es6 + node
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.commonjs,
        ...globals.es2015,
        ...globals.es2017,
        ...globals.es2020
      }
    },
    plugins: {
      react: reactPlugin,
      import: importPlugin
    },
    settings: {
      react: {
        version: 'detect'
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactPlugin.configs.flat.recommended.rules,
      // 维持旧配置的宽松项
      'no-console': 'off',
      'no-empty': 'off',
      'react/display-name': 'off',
      'react/no-find-dom-node': 'off',
      // 旧配置即关闭：别名/混合模块解析误报过多
      'import/no-unresolved': 'off',
      // ESLint 9 默认 caughtErrors: 'all'，恢复 ESLint 3 时代行为（catch 参数不检查），
      // 避免 17 处历史 catch(e){} 报错
      'no-unused-vars': [
        'error',
        {
          args: 'after-used',
          caughtErrors: 'none'
        }
      ],
      // withRouter 注入的 history/location/match props 无法被 prop-types 识别，且存量代码未声明 propTypes
      'react/prop-types': 'off'
    }
  }
];
