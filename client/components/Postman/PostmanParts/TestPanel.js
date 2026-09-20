// @ts-check
/**
 * Postman 子组件：Test 面板（自 Postman.js 原位抽离的 JSX 子树，仅 type=case 时挂载）。
 *
 * 职责（单一）：渲染「测试脚本开关 + 脚本编辑器 + 可插入断言代码片段列表」。
 *
 * 边界与等价性：
 *   - 只做受控展示 + 事件上抛：enable_script / test_script 来自父组件 state，开关与
 *     编辑器变化经 onEnableScriptChange / onScriptChange 上抛；
 *   - 插入代码片段：子组件只上抛「片段 code」，父组件负责拼 '\n' 前缀并写入其持有的
 *     编辑器实例（aceEditorRef），故 onInsertCode 的实参与抽取前逐字一致；
 *   - 编辑器实例 ref 由父组件持有并下传（editorRef），与 BodyPanel 共用同一 ref
 *     （挂载顺序不变，故 aceEditorRef.current 的最终归属与抽取前一致）；
 *   - InsertCodeMap 已随本子组件迁至 ./insertCodeMap.js，Postman.js 仍按原路径
 *     转出（CommonSettingModal 等消费方零改动）；
 *   - 不引入包装 DOM 元素：根节点即原 React.Fragment。
 */
import React from 'react';
import PropTypes from 'prop-types';
import { Row, Col, Switch } from 'antd';
import AceEditor from 'client/components/AceEditor/AceEditor';
import { InsertCodeMap } from './insertCodeMap.js';

/**
 * @param {any} props
 */
const TestPanel = props => {
  const {
    enable_script,
    test_script,
    editorRef,
    onEnableScriptChange,
    onScriptChange,
    onInsertCode
  } = props;

  return (
    <React.Fragment>
      <h3 style={{ margin: '5px' }}>
        &nbsp;是否开启:&nbsp;
        <Switch
          checked={enable_script}
          onChange={(/** @type {any} */ e) => onEnableScriptChange(e)}
        />
      </h3>
      <p style={{ margin: '10px' }}>注：Test 脚本只有做自动化测试才执行</p>
      <Row>
        <Col span="18">
          <AceEditor
            onChange={onScriptChange}
            className="case-script"
            data={test_script}
            ref={(/** @type {any} */ editor) => {
              editorRef.current = editor;
            }}
          />
        </Col>
        <Col span="6">
          <div className="insert-code">
            {InsertCodeMap.map(item => {
              return (
                <div
                  style={{ cursor: 'pointer' }}
                  className="code-item"
                  key={item.title}
                  onClick={() => {
                    onInsertCode('\n' + item.code);
                  }}
                >
                  {item.title}
                </div>
              );
            })}
          </div>
        </Col>
      </Row>
    </React.Fragment>
  );
};

TestPanel.propTypes = {
  enable_script: PropTypes.bool,
  test_script: PropTypes.string,
  /** 父组件持有的脚本编辑器实例 ref（插入片段的写入目标） */
  editorRef: PropTypes.any,
  onEnableScriptChange: PropTypes.func,
  /** 脚本内容变化（父 onOpenTest，载荷为 { text }） */
  onScriptChange: PropTypes.func,
  /** 插入代码片段（父 handleInsertCode，实参已含 '\n' 前缀） */
  onInsertCode: PropTypes.func
};

export default TestPanel;