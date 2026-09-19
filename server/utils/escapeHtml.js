// @ts-check

/**
 * HTML 文本转义, 供邮件 HTML 模板、测试报告、导出下载件等 HTML 拼接场景统一复用,
 * 阻断用户可控数据(用户名/接口名/路径/项目名等)的存储型 HTML 注入。
 * 上述数据均插入元素文本位置, 转义 & < > 即可。
 * 警告: 本实现不转义引号, 禁止用于用户可控的 HTML 属性位(引号可闭合属性边界注入事件处理器);
 * 当前各调用点的属性位插值仅含内部数字索引(id/href=#N), 不受此限。
 * 注意: 各处调用必须与本实现保持同步, 调整转义规则须先回归 reportHtml 与各插件导出。
 * @param {any} value 任意用户可控数据
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = escapeHtml;
