// @ts-check
/**
 * InterfaceEditForm 子组件：「请求参数设置」面板（自 InterfaceEditForm.js 原位抽离的
 * JSX 子树）——标题 + Body/Query/Headers 单选框 + Query 与 Headers 两个区块。
 *
 * 职责（单一）：渲染请求参数设置区的标题与页签单选框，以及 Query / Headers 两个区块
 * （添加按钮、批量添加入口、拖拽排序的行列表）；BODY 区块经 children 槽位插入到
 * panel-sub 内的原有位置（抽取前 BODY 区块排在 Headers 之后，见 RequestBodySetting）。
 *
 * 边界与等价性：
 *   - 只做受控展示 + 事件上抛：选中页签（req_radio_type）、两个面板的隐藏位、行数据
 *     均来自父组件；页签切换、添加行、批量导入、拖拽排序、删除行经回调上抛；
 *   - 行模板仍走 paramTemplates 的 queryTpl / headerTpl（纯函数，契约未改），
 *     行内容与 delParams(index, name) 的实参与抽取前一致；
 *   - 拖拽排序仍取表单实例的实时值：form 经 Form.useFormInstance() 从外层 <Form> 的
 *     context 取得（与父组件 useForm 的实例同一），getFieldValue 的调用时机与取值不变；
 *   - 不引入包装 DOM 元素：根节点为 Fragment（h2 / container-radiogroup / panel-sub
 *     三者在原父组件中的兄弟顺序保持），children 在 panel-sub 内原位渲染。
 */
import React from 'react';
import { Button, Row, Col, Radio, Form } from 'antd';
import EasyDragSort from '../../../../../components/EasyDragSort/EasyDragSort.js';
import { HTTP_METHOD } from '../interfaceEditFormUtils/formDefaults.js';
import { queryTpl, headerTpl } from '../interfaceEditFormUtils/paramTemplates.js';

const FormItem = Form.Item;
const RadioButton = Radio.Button;
const RadioGroup = Radio.Group;

/**
 * @param {any} props
 */
const RequestParamsSetting = props => {
  const {
    method,
    req_radio_type,
    reqHideTabs,
    req_query,
    req_headers,
    onRadioChange,
    onAddParams,
    onShowBulk,
    onDragMove,
    onDelParams,
    children
  } = props;

  // 外层 <Form> 的表单实例（与父组件 useForm 同一实例）：拖拽排序取实时字段值
  const form = Form.useFormInstance();

  const QueryList = req_query.map((/** @type {any} */ item, /** @type {any} */ index) => {
    return queryTpl(item, index, onDelParams);
  });

  const headerList = req_headers.map((/** @type {any} */ item, /** @type {any} */ index) => {
    return headerTpl(item, index, onDelParams);
  });

  return (
    <>
      <h2 className="interface-title">请求参数设置</h2>

      <div className="container-radiogroup">
        <RadioGroup
          value={req_radio_type}
          size="large"
          className="radioGroup"
          onChange={onRadioChange}
        >
          {(/** @type {Record<string, any>} */ (HTTP_METHOD))[method].request_body ? (
            <RadioButton value="req-body">Body</RadioButton>
          ) : null}
          <RadioButton value="req-query">Query</RadioButton>
          <RadioButton value="req-headers">Headers</RadioButton>
        </RadioGroup>
      </div>

      <div className="panel-sub">
        <FormItem className={'interface-edit-item ' + reqHideTabs.query}>
          <Row type="flex" justify="space-around">
            <Col span={12}>
              <Button size="small" type="primary" onClick={() => onAddParams('req_query')}>
                添加Query参数
              </Button>
            </Col>
            <Col span={12}>
              <div className="bulk-import" onClick={() => onShowBulk('req_query')}>
                批量添加
              </div>
            </Col>
          </Row>
        </FormItem>

        <Row className={'interface-edit-item ' + reqHideTabs.query}>
          <Col>
            <EasyDragSort
              data={() => form.getFieldValue('req_query')}
              onChange={onDragMove('req_query')}
              onlyChild="easy_drag_sort_child"
            >
              {QueryList}
            </EasyDragSort>
          </Col>
        </Row>

        <FormItem className={'interface-edit-item ' + reqHideTabs.headers}>
          <Button size="small" type="primary" onClick={() => onAddParams('req_headers')}>
            添加Header
          </Button>
        </FormItem>

        <Row className={'interface-edit-item ' + reqHideTabs.headers}>
          <Col>
            <EasyDragSort
              data={() => form.getFieldValue('req_headers')}
              onChange={onDragMove('req_headers')}
              onlyChild="easy_drag_sort_child"
            >
              {headerList}
            </EasyDragSort>
          </Col>
        </Row>
        {children}
      </div>
    </>
  );
};

export default RequestParamsSetting;