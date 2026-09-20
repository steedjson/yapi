// @ts-check
/**
 * Postman 子组件：BODY 面板（自 Postman.js 原位抽离的 JSX 子树，Collapse 第 4 项的 children）。
 *
 * 职责（单一）：按 req_body_type 渲染 raw（AceEditor + 高级参数设置入口）/ form
 * （逐行键值对，file 类型行提示 Chrome 安全策略）/ file（原生文件选择框）三种请求体
 * 编辑界面，并把编辑与「高级参数插入」上抛父组件。
 *
 * 边界与等价性：
 *   - 只做受控展示 + 事件上抛：本体内容一律来自父组件 state（req_body_other /
 *     req_body_type / req_body_form），本组件不持有业务状态；
 *   - 编辑器实例 ref 由父组件持有并下传（editorRef），ref 回调写法与抽取前一致——
 *     showModal('req_body_other') 需要经该实例读取光标偏移（getCursorIndex）；
 *   - 可见性表达式（checkRequestBodyIsRaw(method, req_body_type) 的 display、
 *     HTTP_METHOD[method].request_body 门控）按原样保留；
 *   - 不引入包装 DOM 元素：根节点即原 Fragment，三个分支的 <div> 层级不变。
 */
import React from 'react';
import PropTypes from 'prop-types';
import { Button, Input, Checkbox, Tooltip } from 'antd';
import { EditOutlined, PlusOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import AceEditor from 'client/components/AceEditor/AceEditor';
import constants from '../../../constants/variable.js';
import ParamsName from './ParamsName.js';
const { checkRequestBodyIsRaw } = require('common/postmanLib.js');

const HTTP_METHOD = constants.HTTP_METHOD;

/**
 * @param {any} props
 */
const BodyPanel = props => {
  const {
    method,
    req_body_type,
    req_body_form = [],
    req_body_other,
    editorRef,
    onShowModal,
    onBodyChange,
    onFormChange
  } = props;

  return (
    <>
      <div
        style={{ display: checkRequestBodyIsRaw(method, req_body_type) ? 'block' : 'none' }}
      >
        {req_body_type === 'json' && (
          <div className="adv-button">
            <Button
              onClick={() => onShowModal(req_body_other, 0, 'req_body_other')}
            >
              高级参数设置
            </Button>
            <Tooltip title="高级参数设置只在json字段值中生效">
              {'  '}
              <QuestionCircleOutlined />
            </Tooltip>
          </div>
        )}

        <AceEditor
          className="pretty-editor"
          ref={(/** @type {any} */ editor) => (editorRef.current = editor)}
          data={req_body_other}
          mode={req_body_type === 'json' ? null : 'text'}
          onChange={onBodyChange}
          fullScreen={true}
        />
      </div>

      {(/** @type {Record<string, any>} */ (HTTP_METHOD))[method].request_body &&
        req_body_type === 'form' && (
          <div>
            {req_body_form.map((/** @type {any} */ item, /** @type {number} */ index) => {
              return (
                <div key={index} className="key-value-wrap">
                  <ParamsName
                    example={item.example}
                    desc={item.desc}
                    name={item.name}
                  />
                  &nbsp;
                  {item.required == 1 ? (
                    <Checkbox className="params-enable" checked={true} disabled />
                  ) : (
                    <Checkbox
                      className="params-enable"
                      checked={item.enable}
                      onChange={(/** @type {any} */ e) => onFormChange(e.target.checked, index, 'enable')}
                    />
                  )}
                  <span className="eq-symbol">=</span>
                  {item.type === 'file' ? (
                    '因Chrome最新版安全策略限制，不再支持文件上传'
                    // <Input
                    //   type="file"
                    //   id={'file_' + index}
                    //   onChange={e => changeBody(e.target.value, index, 'value')}
                    //   multiple
                    //   className="value"
                    // />
                  ) : (
                    <Input
                      value={item.value}
                      className="value"
                      onChange={(/** @type {any} */ e) => onFormChange(e.target.value, index)}
                      placeholder="参数值"
                      id={`req_body_form_${index}`}
                      addonAfter={
                        <EditOutlined
                          onClick={() => onShowModal(item.value, index, 'req_body_form')}
                        />
                      }
                    />
                  )}
                </div>
              );
            })}
            <Button
              style={{ display: 'none' }}
              type="primary"
              icon={<PlusOutlined />}
            >
              添加Form参数
            </Button>
          </div>
        )}
      {(/** @type {Record<string, any>} */ (HTTP_METHOD))[method].request_body &&
        req_body_type === 'file' && (
          <div>
            <Input type="file" id="single-file" />
          </div>
        )}
    </>
  );
};

BodyPanel.propTypes = {
  method: PropTypes.string,
  req_body_type: PropTypes.string,
  req_body_form: PropTypes.array,
  req_body_other: PropTypes.string,
  /** 父组件持有的 raw 编辑器实例 ref（showModal 读取光标偏移用） */
  editorRef: PropTypes.any,
  /** 打开高级参数插入弹窗（父 showModal(value, index, type)） */
  onShowModal: PropTypes.func,
  /** raw 编辑器内容变化（父 handleRequestBody，载荷为 { text }） */
  onBodyChange: PropTypes.func,
  /** form 行变化（父 changeBody(value, index, key)） */
  onFormChange: PropTypes.func
};

export default BodyPanel;