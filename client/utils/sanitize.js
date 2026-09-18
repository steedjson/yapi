// @ts-check
const DOMPurify = require('dompurify');

/**
 * 清洗 HTML 字符串,防止 XSS 攻击
 * @param {string} dirty 待清洗的 HTML 字符串
 * @returns {string} 消毒后的安全 HTML
 */
module.exports = function sanitizeHtml(dirty) {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li',
      'code', 'pre', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'span', 'div',
      'del', 'sup', 'sub', 'hr'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'target', 'rel',
      'style', 'colspan', 'rowspan'],
    ALLOW_DATA_ATTR: false
  });
};
