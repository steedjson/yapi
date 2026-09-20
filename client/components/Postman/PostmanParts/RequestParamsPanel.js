// @ts-check
/**
 * Postman 子组件：请求参数折叠面板（自 Postman.js 原位抽离的 JSX 子树）。
 *
 * 职责（单一）：渲染 PATH PARAMETERS / QUERY PARAMETERS / HEADERS / BODY(F9) 四个
 * 折叠面板——前三项的逐行键值对（名称由 ParamsName 展示单元渲染，值为受控输入，
 * query 带启用勾选、header 按 abled 只读）与 BODY 面板的装配，并把「改值 / 勾选 /
 * 打开高级参数插入」上抛父组件。
 *
 * 边界与等价性：
 *   - 只做受控展示 + 事件上抛：req_params / req_query / req_headers / req_body_* 全部
 *     来自父组件 state，本组件不持有业务状态（BODY 编辑器实例 ref 由父组件持有并
 *     下传，见 BodyPanel）；
 *   - 空列表面板仍以 className="hidden" 隐藏、写死的「添加…参数」按钮保持
 *     display:none（按钮对应的 addPathParam/addQuery/addHeader/addBody 在旧类组件上
 *     从未定义，属历史死引用，P6 迁移时已声明移除）；
 *   - defaultActiveKey / bordered / 各项 key 与 label 文案逐字保留；
 *   - 不引入包装 DOM 元素：根节点即原 <Collapse>。
 */
import React from 'react';
import PropTypes from 'prop-types';
import { Button, Input, Checkbox, Collapse, Tooltip } from 'antd';
import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import constants from '../../../constants/variable.js';
import ParamsName from './ParamsName.js';
import BodyPanel from './BodyPanel.js';

const HTTP_METHOD = constants.HTTP_METHOD;

/**
 * @param {any} props
 */
const RequestParamsPanel = props => {
  const {
    method,
    req_params = [],
    req_query = [],
    req_headers = [],
    req_body_type,
    req_body_form = [],
    req_body_other,
    editorRef,
    onChangeParam,
    onShowModal,
    onBodyChange,
    onFormChange
  } = props;

  return (
    <Collapse
      defaultActiveKey={['0', '1', '2', '3']}
      bordered={true}
      items={[
        {
          key: '0',
          className: req_params.length === 0 ? 'hidden' : '',
          label: 'PATH PARAMETERS',
          children: (
            <>
              {req_params.map((/** @type {any} */ item, /** @type {number} */ index) => {
                return (
                  <div key={index} className="key-value-wrap">
                    <ParamsName example={item.example} desc={item.desc} name={item.name} />
                    <span className="eq-symbol">=</span>
                    <Input
                      value={item.value}
                      className="value"
                      onChange={(/** @type {any} */ e) =>
                        onChangeParam('req_params', e.target.value, index)
                      }
                      placeholder="参数值"
                      id={`req_params_${index}`}
                      addonAfter={
                        <EditOutlined
                          onClick={() => onShowModal(item.value, index, 'req_params')}
                        />
                      }
                    />
                  </div>
                );
              })}
              <Button
                style={{ display: 'none' }}
                type="primary"
                icon={<PlusOutlined />}
              >
                添加Path参数
              </Button>
            </>
          )
        },
        {
          key: '1',
          className: req_query.length === 0 ? 'hidden' : '',
          label: 'QUERY PARAMETERS',
          children: (
            <>
              {req_query.map((/** @type {any} */ item, /** @type {number} */ index) => {
                return (
                  <div key={index} className="key-value-wrap">
                    <ParamsName example={item.example} desc={item.desc} name={item.name} />
                    &nbsp;
                    {item.required == 1 ? (
                      <Checkbox className="params-enable" checked={true} disabled />
                    ) : (
                      <Checkbox
                        className="params-enable"
                        checked={item.enable}
                        onChange={(/** @type {any} */ e) =>
                          onChangeParam('req_query', e.target.checked, index, 'enable')
                        }
                      />
                    )}
                    <span className="eq-symbol">=</span>
                    <Input
                      value={item.value}
                      className="value"
                      onChange={(/** @type {any} */ e) => onChangeParam('req_query', e.target.value, index)}
                      placeholder="参数值"
                      id={`req_query_${index}`}
                      addonAfter={
                        <EditOutlined
                          onClick={() => onShowModal(item.value, index, 'req_query')}
                        />
                      }
                    />
                  </div>
                );
              })}
              <Button style={{ display: 'none' }} type="primary" icon={<PlusOutlined />}>
                添加Query参数
              </Button>
            </>
          )
        },
        {
          key: '2',
          className: req_headers.length === 0 ? 'hidden' : '',
          label: 'HEADERS',
          children: (
            <>
              {req_headers.map((/** @type {any} */ item, /** @type {number} */ index) => {
                return (
                  <div key={index} className="key-value-wrap">
                    <ParamsName example={item.example} desc={item.desc} name={item.name} />
                    <span className="eq-symbol">=</span>
                    <Input
                      value={item.value}
                      disabled={!!item.abled}
                      className="value"
                      onChange={(/** @type {any} */ e) =>
                        onChangeParam('req_headers', e.target.value, index)
                      }
                      placeholder="参数值"
                      id={`req_headers_${index}`}
                      addonAfter={
                        !item.abled && (
                          <EditOutlined
                            onClick={() => onShowModal(item.value, index, 'req_headers')}
                          />
                        )
                      }
                    />
                  </div>
                );
              })}
              <Button style={{ display: 'none' }} type="primary" icon={<PlusOutlined />}>
                添加Header
              </Button>
            </>
          )
        },
        {
          key: '3',
          className:
            (/** @type {Record<string, any>} */ (HTTP_METHOD))[method].request_body &&
            ((req_body_type === 'form' && req_body_form.length > 0) || req_body_type !== 'form')
              ? 'POST'
              : 'hidden',
          label: (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Tooltip title="F9 全屏编辑">BODY(F9)</Tooltip>
            </div>
          ),
          children: (
            <BodyPanel
              method={method}
              req_body_type={req_body_type}
              req_body_form={req_body_form}
              req_body_other={req_body_other}
              editorRef={editorRef}
              onShowModal={onShowModal}
              onBodyChange={onBodyChange}
              onFormChange={onFormChange}
            />
          )
        }
      ]}
    />
  );
};

RequestParamsPanel.propTypes = {
  method: PropTypes.string,
  req_params: PropTypes.array,
  req_query: PropTypes.array,
  req_headers: PropTypes.array,
  req_body_type: PropTypes.string,
  req_body_form: PropTypes.array,
  req_body_other: PropTypes.string,
  /** 父组件持有的 raw 编辑器实例 ref（透传给 BodyPanel） */
  editorRef: PropTypes.any,
  /** 参数值/启用位变化（父 changeParam(name, value, index, key)） */
  onChangeParam: PropTypes.func,
  /** 打开高级参数插入弹窗（父 showModal(value, index, type)） */
  onShowModal: PropTypes.func,
  /** raw 编辑器内容变化（父 handleRequestBody，透传给 BodyPanel） */
  onBodyChange: PropTypes.func,
  /** form 行变化（父 changeBody，透传给 BodyPanel） */
  onFormChange: PropTypes.func
};

export default RequestParamsPanel;