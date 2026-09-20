// @ts-check
/**
 * InterfaceEditForm 子组件：「备 注」区块（自 InterfaceEditForm.js 原位抽离的 JSX 子树）。
 *
 * 职责（单一）：渲染备注标题与 MarkdownEditor（编辑区的 html / markdown 由父组件在
 * 提交时经实例方法读取）。
 *
 * 边界与等价性：
 *   - 只做受控展示：编辑器内容值由父组件提供（父 state.markdown || state.desc，
 *     就地求值语义不变）；编辑器实例 ref 由父组件持有并经 editorRef 下传，
 *     handleFinish 仍经该实例读取 getHtml / getMarkdown；
 *   - antd Form 接线不变：FormItem 的 className 与内层 wrapper div 结构逐字保留；
 *   - 不引入包装 DOM 元素：根节点为 Fragment（h2 + panel-sub 的兄弟顺序保持）。
 */
import React from 'react';
import PropTypes from 'prop-types';
import { Form } from 'antd';
import MarkdownEditor from '../../../../../components/MarkdownEditor/index';

const FormItem = Form.Item;

/**
 * @param {any} props
 */
const RemarkSetting = props => {
  const { editorRef, value } = props;

  return (
    <>
      <h2 className="interface-title">备 注</h2>
      <div className="panel-sub">
        <FormItem className={'interface-edit-item'}>
          <div>
            <MarkdownEditor
              ref={editorRef}
              className="remark-editor"
              value={value}
              height={500}
            />
          </div>
        </FormItem>
      </div>
    </>
  );
};

RemarkSetting.propTypes = {
  /** 父组件持有的 MarkdownEditor 实例 ref（提交时读取 html / markdown） */
  editorRef: PropTypes.any,
  /** 编辑器内容（父 state.markdown || state.desc） */
  value: PropTypes.any
};

export default RemarkSetting;