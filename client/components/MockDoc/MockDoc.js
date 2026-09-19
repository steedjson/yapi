// @ts-check
import './MockDoc.scss';
import React from 'react';
import PropTypes from 'prop-types';
import sanitizeHtml from '../../utils/sanitize.js';

// 组件用法 <MockDoc mock= mockData doc= docData />
// mockData: mock数据 格式为json
// docData：docData数据 格式为array

const defaultMock = {
  ersrcode: '@integer',
  'data|9-19': [
    '123',
    {
      name: '@name',
      name1: [
        {
          name3: '1'
        }
      ]
    }
  ],
  data1: '123',
  data3: {
    err: 'errCode',
    arr: [1, 2]
  }
};

const defaultDoc = [
  { type: 'strisng', key: 'ersrcode', required: true, desc: '错误编码' },
  { type: 'number', key: 'data[]', required: true, desc: '返回数据' },
  { type: 'object', key: 'data[].name', required: true, desc: '数据名' },
  { type: 'object', key: 'data[].name1[].name3', required: true, desc: '数据名1' },
  { type: 'object', key: 'data1', required: true, desc: '数据名1' },
  { type: 'object', key: 'data3.err', required: true, desc: '数据名1' },
  { type: 'object', key: 'data3', required: true, desc: '数据名1' },
  { type: 'object', key: 'data3.arr[]', required: true, desc: '数据名1' }
];

// 纯展示组件：React 18.3 起函数组件上的 defaultProps 会告警，
// 故用解构默认参数承接原 defaultProps，语义一致（props 未传即取默认值）
function MockDoc({ mock = defaultMock, doc = defaultDoc }) {
  let htmlData = mockToArr(mock);
  htmlData = arrToHtml(htmlData, doc);
  return (
    <div className="MockDoc">
      {htmlData.map(function(/** @type {any} */ item, /** @type {number} */ i) {
        {
          /*//类型：Object  必有字段  备注：qwqwqw*/
        }
        if (item.mes) {
          var mes = [];
          item.mes.type
            ? mes.push(
                <span key={i} className="keymes">
                  {' '}
                  / /类型：{item.mes.type}
                </span>
              )
            : '';
          item.mes.required
            ? mes.push(
                <span key={i + 1} className="keymes">
                  必有字段
                </span>
              )
            : '';
          item.mes.desc
            ? mes.push(
                <span key={i + 2} className="keymes">
                  备注：{item.mes.desc}
                </span>
              )
            : '';
        }
        return (
          <div className="jsonItem" key={i}>
            {<span className="jsonitemNum">{i + 1}.</span>}
            {produceSpace(item.space)}
            {setStrToHtml(item.str)}
            {mes}
          </div>
        );
      })}
    </div>
  );
}

MockDoc.propTypes = {
  mock: PropTypes.object,
  doc: PropTypes.array
};

/**
 * @param {number} count
 */
function produceSpace(count) {
  var space = [];
  for (var i = 0; i < count; i++) {
    space.push(<span key={i} className="spaces" />);
  }
  return space;
}

/**
 * @param {any} str
 */
function setStrToHtml(str) {
  return <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(`${str}`) }} />;
}
/**
 * @param {any} mockArr
 * @param {any} mock
 */
function arrToHtml(mockArr, mock) {
  for (var i in mockArr) {
    for (var item in mock) {
      if (mockArr[i].key && mockArr[i].key === mock[item].key) {
        mockArr[i].mes = mock[item];
      }
    }
  }
  return mockArr;
}

/**
 * @param {any} mock
 * @param {any} [html]
 * @param {any} [space]
 * @param {any} [key]
 */
function mockToArr(mock, html, space, key) {
  html = html || [];
  space = space || 0;
  key = key || [];
  if (typeof mock === 'object' && space === 0) {
    if (mock.constructor === Array) {
      html.push({
        space: space,
        str: '['
      });
      space++;
    } else {
      html.push({
        space: space,
        str: '{'
      });
      space++;
    }
  }
  for (var i in mock) {
    if (!Object.prototype.hasOwnProperty.call(mock, i)) {
      continue;
    }
    var index = i;
    if (/^\w+(\|\w+)?/.test(i)) {
      index = i.split('|')[0];
    }
    if (typeof mock[i] === 'object') {
      if (mock[i].constructor === Array) {
        // shuzu
        if (mock.constructor != Array) {
          if (key.length) {
            key.push('.' + index + '[]');
          } else {
            key.push(index + '[]');
          }
        } else {
          key.push('[]');
        }
        html.push({
          space: space,
          str: index + ' : [',
          key: key.join('')
        });
      } else {
        // object
        if (mock.constructor != Array) {
          if (key.length) {
            key.push('.' + index);
          } else {
            key.push(index);
          }
          html.push({
            space: space,
            str: index + ' : {'
          });
        } else {
          html.push({
            space: space,
            str: '{'
          });
        }
      }
      space++;
      mockToArr(mock[i], html, space, key);
      key.pop();
      space--;
    } else {
      if (mock.constructor === Array) {
        html.push({
          space: space,
          // mock.constructor === Array 会把 mock 收窄成数组类型，此处用 any 中转恢复字符串索引
          str: `<span class = "valueLight">${(/** @type {any} */ (mock))[i]}</span>` + ','
        });
      } else {
        if (mock.constructor != Array) {
          if (key.length) {
            html.push({
              space: space,
              str: index + ' : ' + `<span class = "valueLight">${mock[i]}</span>` + ',',
              key: key.join('') + '.' + index
            });
          } else {
            html.push({
              space: space,
              str: index + ' : ' + `<span class = "valueLight">${mock[i]}</span>` + ',',
              key: key.join('') + index
            });
          }
        } else {
          html.push({
            space: space,
            // 同上：constructor === Array 收窄后以 any 中转恢复字符串索引
            str: index + ' : ' + `<span class = "valueLight">${(/** @type {any} */ (mock))[i]}</span>` + ',',
            key: key.join('')
          });
        }
      }
    }
  }
  if (typeof mock === 'object') {
    html[html.length - 1].str = html[html.length - 1].str.substr(
      0,
      html[html.length - 1].str.length - 1
    );
    if (mock.constructor === Array) {
      space--;
      html.push({
        space: space,
        str: ']'
      });
    } else {
      space--;
      html.push({
        space: space,
        str: '}'
      });
    }
  }
  if (space != 0) {
    html[html.length - 1].str = html[html.length - 1].str + ',';
  }
  return html;
}

export default MockDoc;

