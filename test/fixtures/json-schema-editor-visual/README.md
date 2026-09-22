# json-schema-editor-visual 冻结夹具

来源：`json-schema-editor-visual@1.0.23`（npm pack，2026-09-22 提取）。
用途：批次 2 往返等价测试的旧编辑器动作模型（models/schema.js + utils.js + schema.js）。
依赖：underscore（node_modules 既有）+ 同目录 moox-lite.js（moox@1.0.2 兼容夹具，应用自带 immer 10）。
冻结原则：本目录为 vendored 历史代码，禁止修改（eslint 已豁免）；旧包已从依赖删除，
本夹具是等价性回归的唯一基线。