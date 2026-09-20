// @ts-check
/**
 * Postman 子组件：Response 面板（自 Postman.js 原位抽离的 JSX 子树，Tabs 的 res 页）。
 *
 * 职责（单一）：展示一次请求的返回——状态行（成功/失败配色）、请求数据查看入口、
 * json-schema 校验告警、响应头编辑器与响应体（HTML 响应可自动预览 iframe，其余走
 * 只读编辑器）。
 *
 * 边界与等价性：
 *   - 只做受控展示 + 事件上抛：loading / resStatusCode / resStatusText / test_valid_msg /
 *     test_res_header / test_res_body / autoPreviewHTML 全部来自父组件 state；「自动预览
 *     HTML」勾选经 onAutoPreviewChange 上抛（父 applyState({ autoPreviewHTML })），
 *     本组件不持有状态；
 *   - HTML 预览判定：原实现渲染期调用 testResponseBodyIsHTML()（读父组件 stateRef 里的
 *     响应头）与 state.autoPreviewHTML 取与，抽取后由父组件计算 previewHtml 下传，
 *     判定时机与取值等价；
 *   - iframe 安全属性逐字保留：sandbox=""（全量 sandbox，禁止被测服务脚本执行）+
 *     srcDoc 静态预览；
 *   - 不引入包装 DOM 元素：根节点即原 <Spin>（页签 children 的根）。
 */
import React from 'react';
import PropTypes from 'prop-types';
import { Alert, Checkbox, Spin, Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import AceEditor from 'client/components/AceEditor/AceEditor';
const { handleContentType } = require('common/postmanLib.js');

/**
 * @param {any} props
 */
const ResponsePanel = props => {
  const {
    loading,
    resStatusCode,
    resStatusText,
    test_valid_msg,
    autoPreviewHTML,
    test_res_header,
    test_res_body,
    previewHtml,
    onAutoPreviewChange
  } = props;

  return (
    <Spin spinning={loading}>
      <h2
        style={{ display: resStatusCode ? '' : 'none' }}
        className={
          'res-code ' +
          (resStatusCode >= 200 && resStatusCode < 400 && !loading ? 'success' : 'fail')
        }
      >
        {resStatusCode + '  ' + resStatusText}
      </h2>
      <div>
        <a rel="noopener noreferrer" target="_blank" href="https://juejin.im/post/5c888a3e5188257dee0322af">
          YApi 新版如何查看 http 请求数据
        </a>
      </div>
      {test_valid_msg && (
        <Alert
          message={
            <span>
              Warning &nbsp;
              <Tooltip title="针对定义为 json schema 的返回数据进行格式校验">
                <QuestionCircleOutlined />
              </Tooltip>
            </span>
          }
          type="warning"
          showIcon
          description={test_valid_msg}
        />
      )}

      <div className="container-header-body">
        <div className="header">
          <div className="container-title">
            <h4>Headers</h4>
          </div>
          <AceEditor
            callback={(/** @type {any} */ editor) => {
              editor.renderer.setShowGutter(false);
            }}
            readOnly={true}
            className="pretty-editor-header"
            data={test_res_header}
            mode="json"
          />
        </div>
        <div className="resizer">
          <div className="container-title">
            <h4 style={{ visibility: 'hidden' }}>1</h4>
          </div>
        </div>
        <div className="body">
          <div className="container-title">
            <h4>Body</h4>
            <Checkbox
              checked={autoPreviewHTML}
              onChange={(/** @type {any} */ e) => onAutoPreviewChange(e.target.checked)}
            >
              <span>自动预览HTML</span>
            </Checkbox>
          </div>
          {previewHtml ? (
            <iframe
              className="pretty-editor-body"
              // 响应体来自被测服务, 属不可信内容: 全量 sandbox 禁止脚本执行, 仅做静态 HTML 预览
              sandbox=""
              srcDoc={test_res_body}
            />
          ) : (
            <AceEditor
              readOnly={true}
              className="pretty-editor-body"
              data={test_res_body}
              mode={handleContentType(test_res_header)}
            />
          )}
        </div>
      </div>
    </Spin>
  );
};

ResponsePanel.propTypes = {
  loading: PropTypes.bool,
  resStatusCode: PropTypes.any,
  resStatusText: PropTypes.any,
  /** 返回数据与定义结构不符时的校验信息（空串/缺省时不渲染告警） */
  test_valid_msg: PropTypes.any,
  autoPreviewHTML: PropTypes.bool,
  test_res_header: PropTypes.any,
  test_res_body: PropTypes.any,
  /** 是否渲染 HTML 预览 iframe（父组件按响应头 Content-Type 计算） */
  previewHtml: PropTypes.bool,
  onAutoPreviewChange: PropTypes.func
};

export default ResponsePanel;