# antd 6 升级可行性评估（2026-09-27）

> 结论先行：**可行，预估 2-3 人日单批次**，前置条件已全部就绪（React 19 迁移批 + 弃用 API 清扫批均已落地）。
> 破坏面高度收敛：全部 36 例测试失败可归因于 **Select 组件 DOM 重构** 单一根因；生产构建直接通过；类型层零错误。
> spike 状态固化于 `spike/antd6` 分支，迁移批可直接续跑。

## 一、spike 实测证据（antd 6.6.5 + @ant-design/cssinjs 2.1.2，v5-patch 移除）

| 门禁 | 结果 | 说明 |
|---|---|---|
| 静态残留（7 类已清扫 API） | **0** | 上一批清扫后的基线；`addonAfter/addonBefore/Input.Group/Button.Group/arrowPointAtCenter/dropdownStyle/overlayClassName` 在 client/exts 零残留（仅注释提及） |
| `npm run typecheck` | **0 错** | antd 6.6.5 自带类型与全仓 checkJs 白名单零冲突 |
| `npm run build-client` | **通过** | Rsbuild 产物完整；`antd/dist/reset.css` 在 v6 仍存在 |
| `npm test` | 36 失败 / 1060 通过 | 失败全部为 DOM 断言/选择器类（见 §二），无编译错、无逻辑错、无运行时崩溃 |
| message 静态方法 | **原生工作** | 此前依赖 v5-patch 的用例（Run 保存弹出全局提示）在 antd 6 下直接通过——antd 6 静态方法已原生支持 React 19 |
| 反应式依赖 | 已适配 | @ant-design/cssinjs 升 2.1.2（StyleProvider 兼容）；@ant-design/icons 5.6.1 构建通过 |

## 二、单一根因：Select 组件 DOM 重构

antd 6 Select 内部切换到 `@rc-component/select` 并默认启用 **CSS 变量模式**，DOM 结构变化：

| antd 5.29（旧） | antd 6.6.5（新） |
|---|---|
| `.ant-select-selection-placeholder` | `.ant-select-placeholder` |
| `.ant-select-selection-search-input` | `.ant-select-input` |
| `.ant-select-selector` / `.ant-select-selection-item` | `.ant-select-content` / `.ant-select-content-item(-prefix/-suffix)` |
| （无） | 新增 `css-var-root` / `ant-select-css-var` / `css-dev-only-do-not-override-*` 类 |

**失败分布（36 例）全部是使用 Select 的场景**：UsernameAutoComplete 5、CaseEnv 1、JsonSchemaEditor 渲染/交互 2+、Postman/PostmanContainer 6+、containers 页面级 17、visual 2——各处的类型/环境/分类选择框都走了同一个新 DOM。

## 三、漂移面清单（迁移批工作量主体）

1. **测试选择器/快照**：`ant-select-selection` 相关引用约 91 处、7 个测试文件（PostmanContainer 40、InterfaceEditFormContainer 38、InterfaceColContentContainer 4、MemberList 3、UsernameAutoComplete 2、JsonSchemaEditor 2、CaseEnv 2）——机械更新为 antd 6 新选择器或改为语义断言；
2. **生产样式**：`client/containers/Project/Interface/InterfaceList/Edit.scss` 2 处 `ant-select-selection` 引用——核对 antd 6 对应类名后等价迁移；
3. **CSS 变量模式验证**：antd 6 默认 css-var 模式，需真机验证四皮肤（gov/anime/dark/enterprise）token 映射 + `StyleProvider hashPriority="high"` 在新模式下的语义（css-var 模式下 hash 类作用可能弱化）+ darkAlgorithm；
4. **收尾警告项**（上批在册，与本批顺路清）：Form.Item「name 必须单子元素」×2、message 静态函数提示 ×1、async-validator callback 式 validator 弃用提示。

## 四、明确的风险与结论

- **无嵌套 antd3 遗留问题**：json-schema-editor-visual 已被自研编辑器替代（依赖全删），v6 无 antd3 共存负担；
- **v5-patch 退役**：antd 6 原生支持 React 19，`@ant-design/v5-patch-for-react-19` 直接移除（spike 已验证卸载后全链路可跑）；
- **Icons**：@ant-design/icons 5.6.1 构建通过，但建议迁移批同步评估升级（antd 6 官方搭配版本）；
- **回滚**：整 commit revert，无数据迁移。

## 五、建议执行顺序（单批次，2-3 人日）

1. 依赖切换：antd 6.6.5 + cssinjs 2.1.2 + icons 评估升级 + v5-patch 移除（spike 分支已就绪）；
2. 7 个测试文件选择器/快照更新 + Edit.scss 2 处等价迁移（§三.1/2）；
3. 全量测试归零 + `grep deprecated` 基线重钉；
4. 四皮肤 × 五页真机矩阵 + 深色算法核验（§三.3）；
5. 产物独立提交，回滚链复核。

## 六、spike 分支状态（spike/antd6）

- package.json：antd 6.6.5 + @ant-design/cssinjs 2.1.2，`@ant-design/v5-patch-for-react-19` 已卸载；
- `client/index.js` / `test/helpers/jsdom-setup.js`：补丁装载点已移除；
- 已知状态：36 例 Select DOM 断言待更新（起点清单），构建/类型零障碍。
