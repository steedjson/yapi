// @ts-check
/**
 * InterfaceEditForm 子组件：请求体设置区（自 InterfaceEditForm.js 原位抽离的 JSX 子树，
 * 「请求参数设置」面板内 BODY 部分）。
 *
 * 职责（单一）：渲染 req_body_type 单选框（form / json / file / raw）与四种取值下的
 * 编辑界面——form 行（添加参数 / 批量添加 / 拖拽排序）、json（JSON-SCHEMA 开关 +
 * schema 编辑器 / json5 提示 + AceEditor）、file（文件说明 TextArea）、raw（满宽
 * 多行 TextArea，antd5 写法 rows/autoSize + span=24，修复收缩成小方块的问题）。
 *
 * 边界与等价性：
 *   - 只做受控展示 + 事件上抛：req_body_type / req_body_other / req_body_form 与
 *     可见性（reqBodyType / reqBodyIsJsonSchema / isJson5 / 面板隐藏位）均由父组件提供，
 *     行编辑与 schema 变化经回调上抛父组件（setState 与 changeEditStatus 调度仍在父组件）；
 *   - antd Form 接线不变：req_body_type / req_body_is_json_schema / req_body_other 的
 *     name、valuePropName、initialValue 与抽取前逐字一致（json-schema 开关初值仍为
 *     `state.req_body_is_json_schema || !projectMsg.is_json5`，就地求值）；
 *   - 拖拽排序仍取表单实例的实时值：form 经 Form.useFormInstance() 从外层 <Form> 的
 *     context 取得（与父组件 useForm 的实例同一），getFieldValue 的调用时机与取值不变；
 *   - 编辑器接线不变：raw 分支的 AceEditor 由父组件持有实例（本组件只透传 data 与
 *     onChange），json 分支的 schema 编辑器为共用单例（见 schemaEditors.js）；
 *   - 不引入包装 DOM 元素：根节点为 Fragment，四个条件分支的兄弟顺序与各自的外层
 *     元素（<div> / <Row>）与抽取前一致。
 */
import React from 'react';
import PropTypes from 'prop-types';
import { Input, Tooltip, Button, Row, Col, Radio, Switch, Form } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import AceEditor from 'client/components/AceEditor/AceEditor';
import EasyDragSort from '../../../../../components/EasyDragSort/EasyDragSort.js';
import {
  HTTP_METHOD,
  Json5Example,
  checkIsJsonSchema
} from '../interfaceEditFormUtils/formDefaults.js';
import { requestBodyTpl } from '../interfaceEditFormUtils/paramTemplates.js';
import { ReqBodySchema } from './schemaEditors.js';

const TextArea = Input.TextArea;
const FormItem = Form.Item;
const RadioGroup = Radio.Group;

/**
 * @param {any} props
 */
const RequestBodySetting = props => {
  const {
    method,
    reqBodyType,
    reqBodyIsJsonSchema,
    isJson5,
    req_body_type,
    req_body_other,
    req_body_form,
    req_body_is_json_schema,
    bodyHideTab,
    onAddParams,
    onShowBulk,
    onDragMove,
    onDelParams,
    onReqBodyChange,
    onReqBodySchemaChange
  } = props;

  // 外层 <Form> 的表单实例（与父组件 useForm 同一实例）：拖拽排序取实时字段值
  const form = Form.useFormInstance();

  const req_body_other_use_schema_editor = checkIsJsonSchema(req_body_other) || '';

  const requestBodyList = req_body_form.map(
    (/** @type {any} */ item, /** @type {any} */ index) => {
      return requestBodyTpl(item, index, onDelParams);
    }
  );

  return (
    <>
      {(/** @type {Record<string, any>} */ (HTTP_METHOD))[method].request_body ? (
        <div>
          <FormItem
            className={'interface-edit-item ' + bodyHideTab}
            name="req_body_type"
            initialValue={req_body_type}
          >
            <RadioGroup>
              <Radio value="form">form</Radio>
              <Radio value="json">json</Radio>
              <Radio value="file">file</Radio>
              <Radio value="raw">raw</Radio>
            </RadioGroup>
          </FormItem>

          <Row
            className={'interface-edit-item ' + (reqBodyType === 'form' ? bodyHideTab : 'hide')}
          >
            <Col style={{ minHeight: '50px' }}>
              <Row type="flex" justify="space-around">
                <Col span="12" className="interface-edit-item">
                  <Button size="small" type="primary" onClick={() => onAddParams('req_body_form')}>
                    添加form参数
                  </Button>
                </Col>
                <Col span="12">
                  <div className="bulk-import" onClick={() => onShowBulk('req_body_form')}>
                    批量添加
                  </div>
                </Col>
              </Row>
              <EasyDragSort
                data={() => form.getFieldValue('req_body_form')}
                onChange={onDragMove('req_body_form')}
                onlyChild="easy_drag_sort_child"
              >
                {requestBodyList}
              </EasyDragSort>
            </Col>
          </Row>
        </div>
      ) : null}

      <Row className={'interface-edit-item ' + (reqBodyType === 'json' ? bodyHideTab : 'hide')}>
        <span>
          JSON-SCHEMA:&nbsp;
          {!isJson5 && (
            <Tooltip title="项目 -> 设置 开启 json5">
              <QuestionCircleOutlined />{' '}
            </Tooltip>
          )}
        </span>
        <FormItem
          name="req_body_is_json_schema"
          valuePropName="checked"
          initialValue={req_body_is_json_schema || !isJson5}
          noStyle
        >
          <Switch checkedChildren="开" unCheckedChildren="关" disabled={!isJson5} />
        </FormItem>

        <Col
          style={{ marginTop: '5px' }}
          className="interface-edit-json-info json-schema-editor-scope"
        >
          {!reqBodyIsJsonSchema ? (
            <span>
              基于 Json5, 参数描述信息用注释的方式实现{' '}
              <Tooltip title={<pre>{Json5Example}</pre>}>
                <QuestionCircleOutlined style={{ color: '#086dbf' }} />
              </Tooltip>
              “全局编辑”或 “退出全屏” 请按 F9
            </span>
          ) : (
            <ReqBodySchema
              onChange={onReqBodySchemaChange}
              isMock={true}
              data={req_body_other_use_schema_editor}
            />
          )}
        </Col>
        <Col>
          {!reqBodyIsJsonSchema && (
            <AceEditor
              className="interface-editor"
              data={req_body_other}
              onChange={onReqBodyChange}
              fullScreen={true}
            />
          )}
        </Col>
      </Row>

      {reqBodyType === 'file' && bodyHideTab !== 'hide' ? (
        <Row className="interface-edit-item">
          <Col className="interface-edit-item-other-body">
            <FormItem name="req_body_other" initialValue={req_body_other}>
              <TextArea placeholder="请填写该二进制请求体的说明，如文件格式、大小限制等" autosize={true} />
            </FormItem>
          </Col>
        </Row>
      ) : null}
      {reqBodyType === 'raw' && bodyHideTab !== 'hide' ? (
        <Row>
          <Col span={24} className="interface-edit-raw-body">
            <FormItem name="req_body_other" initialValue={req_body_other}>
              <TextArea
                placeholder="请输入 raw 请求体内容"
                rows={8}
                autoSize={{ minRows: 8 }}
                style={{ width: '100%', minHeight: '174px' }}
              />
            </FormItem>
          </Col>
        </Row>
      ) : null}
    </>
  );
};

RequestBodySetting.propTypes = {
  /** 当前方法（父 state.method，BODY 区仅在有请求体时渲染） */
  method: PropTypes.string,
  /** 经 useWatch 得到的请求体类型（父组件计算，含初始值回退语义） */
  reqBodyType: PropTypes.any,
  /** 经 useWatch 得到的「请求体为 json-schema」开关值（父组件计算，控制显隐） */
  reqBodyIsJsonSchema: PropTypes.any,
  /** 项目是否开启 json5（props.projectMsg.is_json5） */
  isJson5: PropTypes.bool,
  /** 请求体类型初值（父 state.req_body_type） */
  req_body_type: PropTypes.string,
  /** 请求体 raw 内容（父 state.req_body_other） */
  req_body_other: PropTypes.string,
  /** 请求体 form 行数据（父 state.req_body_form） */
  req_body_form: PropTypes.array,
  /** json-schema 开关初值来源（父 state.req_body_is_json_schema） */
  req_body_is_json_schema: PropTypes.any,
  /** BODY 面板隐藏位（父 state.hideTabs.req.body） */
  bodyHideTab: PropTypes.string,
  /** 添加一行 form 参数（父 addParams） */
  onAddParams: PropTypes.func,
  /** 打开批量导入弹窗（父 showBulk） */
  onShowBulk: PropTypes.func,
  /** 行拖拽排序回调工厂（父 handleDragMove） */
  onDragMove: PropTypes.func,
  /** 删除 form 行（父 delParams） */
  onDelParams: PropTypes.func,
  /** raw 编辑器内容变化（父 handleReqBody） */
  onReqBodyChange: PropTypes.func,
  /** schema 编辑器内容变化（父 handleReqBodySchemaChange） */
  onReqBodySchemaChange: PropTypes.func
};

export default RequestBodySetting;