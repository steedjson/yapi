// @ts-check
/**
 * InterfaceColContent 子组件：通用规则配置弹窗（自 InterfaceColContent.js 原位抽离的 JSX 子树）。
 *
 * 职责（单一）：渲染「检查 HttpCode / 检查返回 json / 检查返回数据结构 / 全局测试脚本」
 * 四项通用规则配置表单，并在用户编辑时把新的 commonSetting 片段回调上抛。
 *
 * 边界与等价性：
 *   - 受控组件：commonSetting 由父组件以 props 传入，本组件不持有业务状态；表单控件
 *     全部受控回显，编辑动作通过 onChangeCommonSetting(partial) 上抛，由父组件以
 *     {...state.commonSetting, ...partial} 浅合并（等价原实现各内联 handler 的写法）；
 *   - 脚本编辑器的 ref（aceEditorRef）与「插入代码」动作只服务于本弹窗，随组件下放为
 *     组件内局部 ref（不新增业务状态）；
 *   - changeCommonFieldSetting 由原父组件原位迁移，仅把 patchState({commonSetting: ...})
 *     换成 onChangeCommonSetting(片段)，合并结果与原实现逐字段一致；
 *   - AceEditor onChange 载荷（mockEditor.curData，形如 { text }）在本组件内取 .text 后
 *     拼入 commonSetting.checkScript.content 片段上抛；
 *   - 刻意保留原实现的一处既有行为：脚本开关开启时原代码展开的是 state.checkScript
 *     （顶层不存在，等价于 {}），因此合并结果只带 enable、content 丢失。此处按原样保留
 *     （{ checkScript: { enable: e } }），避免顺手修复导致行为/ DOM 变化；
 *   - 不引入包装 DOM 元素：根节点即原父组件中的 <Modal>。
 */
import React, { useRef } from 'react';
import PropTypes from 'prop-types';
import { Input, Row, Col, Modal, Switch, Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import AceEditor from 'client/components/AceEditor/AceEditor';
import { InsertCodeMap } from 'client/components/Postman/Postman.js';

const defaultModalStyle = {
  top: 10
};

/**
 * @param {any} props
 */
const CommonSettingModal = props => {
  const { visible, commonSetting, onChangeCommonSetting, onOk, onCancel } = props;

  // 脚本编辑器实例：仅本弹窗的「插入代码」使用
  const aceEditorRef = useRef(null);

  /**
   * @param {any} code
   */
  const handleInsertCode = code => {
    aceEditorRef.current.editor.insertCode(code);
  };

  /**
   * @param {any} key
   */
  const changeCommonFieldSetting = key => {
    return (/** @type {any} */ e) => {
      let value = e;
      if (typeof e === 'object' && e) {
        value = e.target.value;
      }
      const { checkResponseField } = commonSetting;
      onChangeCommonSetting({
        checkResponseField: {
          ...checkResponseField,
          [key]: value
        }
      });
    };
  };

  return (
    <Modal
        title="通用规则配置"
        open={visible}
        onOk={onOk}
        onCancel={onCancel}
        width={'1000px'}
        style={defaultModalStyle}
      >
      <div className="common-setting-modal">
        <Row className="setting-item">
          <Col className="col-item" span="4">
            <label>检查HttpCode:&nbsp;<Tooltip title={'检查 http code 是否为 200'}>
              <QuestionCircleOutlined style={{ width: '10px' }} />
            </Tooltip></label>
          </Col>
          <Col className="col-item"  span="18">
            <Switch onChange={(/** @type {any} */ e) => {
              onChangeCommonSetting({
                checkHttpCodeIs200: e
              });
            }} checked={commonSetting.checkHttpCodeIs200}  checkedChildren="开" unCheckedChildren="关" />
          </Col>
        </Row>

        <Row className="setting-item">
          <Col className="col-item"  span="4">
            <label>检查返回json:&nbsp;<Tooltip title={'检查接口返回数据字段值，比如检查 code 是不是等于 0'}>
              <QuestionCircleOutlined style={{ width: '10px' }} />
            </Tooltip></label>
          </Col>
          <Col  className="col-item" span="6">
            <Input value={commonSetting.checkResponseField.name} onChange={changeCommonFieldSetting('name')} placeholder="字段名"  />
          </Col>
          <Col  className="col-item" span="6">
            <Input  onChange={changeCommonFieldSetting('value')}  value={commonSetting.checkResponseField.value}   placeholder="值"  />
          </Col>
          <Col  className="col-item" span="6">
            <Switch  onChange={changeCommonFieldSetting('enable')}  checked={commonSetting.checkResponseField.enable}  checkedChildren="开" unCheckedChildren="关"  />
          </Col>
        </Row>

        <Row className="setting-item">
          <Col className="col-item" span="4">
            <label>检查返回数据结构:&nbsp;<Tooltip title={'只有 response 基于 json-schema 方式定义，该检查才会生效'}>
              <QuestionCircleOutlined style={{ width: '10px' }} />
            </Tooltip></label>
          </Col>
          <Col className="col-item"  span="18">
            <Switch onChange={(/** @type {any} */ e) => {
              onChangeCommonSetting({
                checkResponseSchema: e
              });
            }} checked={commonSetting.checkResponseSchema}  checkedChildren="开" unCheckedChildren="关" />
          </Col>
        </Row>

        <Row className="setting-item">
          <Col className="col-item  " span="4">
            <label>全局测试脚本:&nbsp;<Tooltip title={'在跑自动化测试时，优先调用全局脚本，只有全局脚本通过测试，才会开始跑case自定义的测试脚本'}>
              <QuestionCircleOutlined style={{ width: '10px' }} />
            </Tooltip></label>
          </Col>
          <Col className="col-item"  span="14">
            <div><Switch onChange={(/** @type {any} */ e) => {
              // 与抽取前一致：原实现展开的是 state.checkScript（顶层不存在），
              // 结果片段仅含 enable，不得顺手改为 commonSetting.checkScript
              onChangeCommonSetting({
                checkScript: {
                  enable: e
                }
              });
            }} checked={commonSetting.checkScript.enable}  checkedChildren="开" unCheckedChildren="关"  /></div>
            <AceEditor
              onChange={(/** @type {any} */ d) => {
                onChangeCommonSetting({
                  checkScript: {
                    ...commonSetting.checkScript,
                    content: d.text
                  }
                });
              }}
              className="case-script"
              data={commonSetting.checkScript.content}
              ref={(/** @type {any} */ aceEditor) => {
                aceEditorRef.current = aceEditor;
              }}
            />
          </Col>
          <Col span="6">
            <div className="insert-code">
              {InsertCodeMap.map((/** @type {any} */ item) => {
                return (
                  <div
                    style={{ cursor: 'pointer' }}
                    className="code-item"
                    key={item.title}
                    onClick={() => {
                      handleInsertCode('\n' + item.code);
                    }}
                  >
                    {item.title}
                  </div>
                );
              })}
            </div>
          </Col>
        </Row>


      </div>
    </Modal>
  );
};

CommonSettingModal.propTypes = {
  visible: PropTypes.bool,
  /** 通用规则配置对象（父组件 state.commonSetting） */
  commonSetting: PropTypes.object,
  /** 上抛 commonSetting 片段，由父组件浅合并 */
  onChangeCommonSetting: PropTypes.func,
  onOk: PropTypes.func,
  onCancel: PropTypes.func
};

export default CommonSettingModal;