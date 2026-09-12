// @ts-check
/**
 * @param {string} name
 * @returns {any}
 */
const requireAny = name => require(name);
const fs = requireAny('fs');
const sysPath = requireAny('path');
const css = fs.readFileSync(sysPath.join(__dirname, './defaultTheme.css'));
module.exports = '<style>' + css + '</style>';
