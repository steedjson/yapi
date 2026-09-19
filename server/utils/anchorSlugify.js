// @ts-check

/**
 * markdown-it-anchor 的安全 slug 生成器, 供 export-data / gen-services 两个导出管线的
 * `markdown.use(markdownItAnchor, { slugify: anchorSlugify })` 复用。
 *
 * 背景: anchor v10 默认 slugify 为 encodeURIComponent, 会把标题中的引号/尖括号编码为 %XX 序列;
 * 而导出管线末端存在历史遗留的 unescape(markdown.render(md)) 步骤, 会把这些 %XX 还原成原始字符,
 * 导致 " < > 重新出现在 <hN id> 与 TOC <a href> 属性位内部, 形成属性边界逃逸注入
 * (anchor v4 的 uslug 方案会直接丢弃此类字符, 故升级前无此问题)。
 *
 * 本实现只保留 Unicode 字母/数字/下划线/连字符:
 *   - 不产生任何 % 序列, unescape 无可复活;
 *   - 引号、尖括号、百分号等一律剔除, 属性位天然安全;
 *   - 保留中日韩等 \p{L} 字母, 站内中文标题的锚点与 TOC 跳转可用(v8 时代 uslug 丢弃 CJK 导致锚点失效, 此处顺带修复);
 *   - 空结果交由 anchor 自身处理(允许空 id, 与升级前行为一致), 重复 slug 由 anchor 按后缀 -1/-2 去重。
 *
 * 注意: 调整白名单规则须先回归 test/common/markdown.test.js 及两个插件的导出注入测试。
 * @param {any} value markdown-it-anchor 传入的标题文本
 * @returns {string}
 */
function anchorSlugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]+/gu, '');
}

module.exports = anchorSlugify;
