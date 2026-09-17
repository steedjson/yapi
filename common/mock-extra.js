// @ts-check
/**
 * @author suxiaoxin
 * @info  mockJs 功能增强脚本
 */
var strRegex = /\${([a-zA-Z]+)\.?([a-zA-Z0-9_.]*)\}/i;
var varSplit = '.';
var mockSplit = '|';
var Mock = require('mockjs');
Mock.Random.extend({
  timestamp: function(){
    var time = new Date().getTime() + '';
    return +time.substr(0, time.length - 3)
  }
})

/**
 * @param {*} mockJSON mock 模板
 * @param {*} context 变量上下文（用于 ${var.path} 取值）
 * @returns {*} 生成的数据
 */
function mock(mockJSON, context) {
  context = context || {};
  /** @type {Record<string, (item: any) => any>} */
  var filtersMap = {
    regexp: handleRegexp
  };
  if(!mockJSON || typeof mockJSON !== 'object'){
    return mockJSON;
  }

  return parse(mockJSON);

  /**
   * @param {*} p 模板节点
   * @param {*} [c] 目标容器
   * @returns {*} 解析结果
   */
  function parse(p, c) {
    if(!c){
      c = Array.isArray(p) ? [] :  {}
    }

    for (var i in p) {
      if (!Object.prototype.hasOwnProperty.call(p, i)) {
        continue;
      }
      if (p[i] && typeof p[i] === 'object') {
        c[i] = (p[i].constructor === Array) ? [] : {};
        parse(p[i], c[i]);
      } else if(p[i] && typeof p[i] === 'string'){
        p[i] = handleStr(p[i]);        
        var filters = i.split(mockSplit),
          newFilters = /** @type {string[]} */ (([]).concat(/** @type {any} */ (filters)));
        c[i] = p[i];
        if (filters.length > 1) {
          for (var f = 1, l = filters.length, index; f < l; f++) {
            filters[f] = filters[f].toLowerCase();
            if (filters[f] in filtersMap) {
              if ((index = newFilters.indexOf(filters[f])) !== -1) {
                newFilters.splice(index, 1);
              }
              delete c[i];
              c[newFilters.join(mockSplit)] = filtersMap[filters[f]].call(p, p[i]);
            }
          }
        }
      }else{
        c[i] = p[i];
      }
    }
    return c;
  }

  /**
   * @param {*} item 正则表达式源文本
   * @returns {RegExp} 正则实例
   */
  function handleRegexp(item) {
    return new RegExp(item);
  }

  /**
   * @param {*} str 模板字符串
   * @returns {*} 变量替换后的值
   */
  function handleStr(str) {
    if (typeof str !== 'string' || str.indexOf('{') === -1 || str.indexOf('}') === -1 || str.indexOf('$') === -1) {
      return str;
    }

    let matchs = str.match(strRegex);
    if(matchs){
      let name = matchs[1] + (matchs[2]? '.' + matchs[2] : '');
      if(!name) return str;
      var names = name.split(varSplit);
      var data = context;
      
      if(typeof context[names[0]] === 'undefined'){
        return str;
      }
      names.forEach(function (n) {
        if (data === '') return '';
        if (n in data) {
          data = data[n];
        } else {
          data = '';
        }
      });
      return data;
    }
    return str;
  }
}

module.exports = mock;