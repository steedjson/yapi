// @ts-check
/**
 * InterfaceEditForm 子组件：「返回数据设置」面板（自 InterfaceEditForm.js 原位抽离的
 * JSX 子树）——标题（含 json-schema 开关）+ JSON/RAW 单选框 + 模板/预览页签与两个编辑区。
 *
 * 职责（单一）：渲染返回数据设置区的标题、json-schema 开关、JSON/RAW 单选框，以及
 * JSON 分支（模板/预览页签、schema 编辑器或 json5 提示 + AceEditor、mock 预览容器）
 * 与 RAW 分支（TextArea）。
 *
 * 边界与等价性：
 *   - 只做受控展示 + 事件上抛：res_body_type / res_body / jsonType 与显隐判定
 *     （resBodyType / resBodyIsJsonSchema / isJson5）均由父组件提供；页签切换、
 *     编辑器内容变化、schema 内容变化经回调上抛父组件；
 *   - antd Form 接线不变：res_body_is_json_schema（valuePropName="checked"）与
 *     res_body 的 name / initialValue 与抽取前逐字一致（开关初值仍为
 *     `state.res_body_is_json_schema || !projectMsg.is_json5`，就地求值）；
 *   - 编辑器接线不变：res_body 的 AceEditor 实例由父组件持有并经 editorRef 下传
 *     （ref 回调写法不变，handleMockPreview 仍经该实例读取 curData）；schema 编辑器为
 *     共用单例（见 schemaEditors.js）；#mock-preview 容器 id 与父组件持有的 mockEditor
 *     实例一一对应，显隐表达式（jsonType === 'preview'）与抽取前一致；
 *   - 不引入包装 DOM 元素：根节点为 Fragment（h2 / container-radiogroup / panel-sub
 *     三者在原父组件中的兄弟顺序保持）。
 */
import React from 'react';
import PropTypes from 'prop-types';
import { Input, Tooltip, Row, Col, Radio, Switch, Tabs, Form } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import AceEditor from 'client/components/AceEditor/AceEditor';
import { Json5Example, checkIsJsonSchema } from '../interfaceEditFormUtils/formDefaults.js';
import { ResBodySchema } from './schemaEditors.js';

const TextArea = Input.TextArea;
const FormItem = Form.Item;
const RadioButton = Radio.Button;
const RadioGroup = Radio.Group;

/**
 * @param {any} props
 */
const ResponseSetting = props => {
  const {
    isJson5,
    resBodyType,
    resBodyIsJsonSchema,
    res_body_type,
    res_body,
    res_body_is_json_schema,
    jsonType,
    onJsonTypeChange,
    onResBodyChange,
    onResBodySchemaChange,
    editorRef
  } = props;

  const res_body_use_schema_editor = checkIsJsonSchema(res_body) || '';

  return (
    <>
      <h2 className="interface-title">
        返回数据设置&nbsp;
        {!isJson5 && (
          <Tooltip title="项目 -> 设置 开启 json5">
            <QuestionCircleOutlined />{' '}
          </Tooltip>
        )}
        <FormItem
          name="res_body_is_json_schema"
          valuePropName="checked"
          initialValue={res_body_is_json_schema || !isJson5}
          noStyle
        >
          <Switch
            checkedChildren="json-schema"
            unCheckedChildren="json"
            disabled={!isJson5}
          />
        </FormItem>
      </h2>
      <div className="container-radiogroup">
        <FormItem name="res_body_type" initialValue={res_body_type} noStyle>
          <RadioGroup size="large" className="radioGroup">
            <RadioButton value="json">JSON</RadioButton>
            <RadioButton value="raw">RAW</RadioButton>
          </RadioGroup>
        </FormItem>
      </div>
      <div className="panel-sub">
        <Row
          className="interface-edit-item"
          style={{
            display: resBodyType === 'json' ? 'block' : 'none'
          }}
        >
          <Col>
            <Tabs
              size="large"
              defaultActiveKey="tpl"
              onChange={onJsonTypeChange}
              items={[
                { label: '模板', key: 'tpl' },
                { label: '预览', key: 'preview' }
              ]}
            />
            <div style={{ marginTop: '10px' }}>
              {!resBodyIsJsonSchema ? (
                <div style={{ padding: '10px 0', fontSize: '15px' }}>
                  <span>
                    基于 mockjs 和 json5,使用注释方式写参数说明{' '}
                    <Tooltip title={<pre>{Json5Example}</pre>}>
                      <QuestionCircleOutlined style={{ color: '#086dbf' }} />
                    </Tooltip>{' '}
                    ,具体使用方法请{' '}
                    <span
                      className="href"
                      onClick={() =>
                        window.open('https://hellosean1025.github.io/yapi/documents/mock.html', '_blank')
                      }
                    >
                      查看文档
                    </span>
                  </span>
                  ，“全局编辑”或 “退出全屏” 请按 <span style={{ fontWeight: '500' }}>F9</span>
                </div>
              ) : (
                <div
                  className="json-schema-editor-scope"
                  style={{ display: jsonType === 'tpl' ? 'block' : 'none' }}
                >
                  <ResBodySchema
                    onChange={onResBodySchemaChange}
                    isMock={true}
                    data={res_body_use_schema_editor}
                  />
                </div>
              )}
              {!resBodyIsJsonSchema && jsonType === 'tpl' && (
                <AceEditor
                  className="interface-editor"
                  data={res_body}
                  onChange={onResBodyChange}
                  ref={(/** @type {any} */ editor) => (editorRef.current = editor)}
                  fullScreen={true}
                />
              )}
              <div
                id="mock-preview"
                style={{
                  backgroundColor: '#eee',
                  lineHeight: '20px',
                  minHeight: '300px',
                  display: jsonType === 'preview' ? 'block' : 'none'
                }}
              />
            </div>
          </Col>
        </Row>

        <Row
          className="interface-edit-item"
          style={{
            display: resBodyType === 'raw' ? 'block' : 'none'
          }}
        >
          <Col>
            <FormItem name="res_body" initialValue={res_body}>
              <TextArea style={{ minHeight: '150px' }} placeholder="" />
            </FormItem>
          </Col>
        </Row>
      </div>
    </>
  );
};

ResponseSetting.propTypes = {
  /** 项目是否开启 json5（props.projectMsg.is_json5） */
  isJson5: PropTypes.bool,
  /** 经 useWatch 得到的返回体类型（父组件计算，控制两个编辑区的显隐） */
  resBodyType: PropTypes.any,
  /** 经 useWatch 得到的「返回体为 json-schema」开关值（父组件计算，控制显隐） */
  resBodyIsJsonSchema: PropTypes.any,
  /** 返回体类型初值（父 state.res_body_type） */
  res_body_type: PropTypes.string,
  /** 返回体 raw 内容（父 state.res_body） */
  res_body: PropTypes.string,
  /** json-schema 开关初值来源（父 state.res_body_is_json_schema） */
  res_body_is_json_schema: PropTypes.any,
  /** 模板/预览页签的选中值（父 state.jsonType） */
  jsonType: PropTypes.string,
  /** 模板/预览页签切换（父 handleJsonType，key === 'preview' 时附带触发 mock 预览） */
  onJsonTypeChange: PropTypes.func,
  /** 模板页 AceEditor 内容变化（父 handleResBody） */
  onResBodyChange: PropTypes.func,
  /** schema 编辑器内容变化（父 handleResBodySchemaChange） */
  onResBodySchemaChange: PropTypes.func,
  /** 父组件持有的模板页 AceEditor 实例 ref（handleMockPreview 经它读取 curData） */
  editorRef: PropTypes.any
};

export default ResponseSetting;