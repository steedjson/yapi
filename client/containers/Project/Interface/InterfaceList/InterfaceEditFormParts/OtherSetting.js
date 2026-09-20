// @ts-check
/**
 * InterfaceEditForm 子组件：「其 他」区块（自 InterfaceEditForm.js 原位抽离的 JSX 子树）。
 *
 * 职责（单一）：渲染消息通知（switch_notice）与开放接口（api_opened）两个开关项。
 *
 * 边界与等价性：
 *   - 只做受控展示：两个开关的初值分别来自父组件 props.noticed 与 state.api_opened
 *     （就地求值语义不变），开关本身由 antd Form 接管（本组件不持有状态）；
 *   - antd Form 接线不变：name / valuePropName="checked" / initialValue 与抽取前逐字一致；
 *   - 不引入包装 DOM 元素：根节点为 Fragment（h2 + panel-sub 的兄弟顺序保持）。
 */
import React from 'react';
import PropTypes from 'prop-types';
import { Tooltip, Switch, Form } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { formItemLayout } from '../interfaceEditFormUtils/formDefaults.js';

const FormItem = Form.Item;

/**
 * @param {any} props
 */
const OtherSetting = props => {
  const { noticed, api_opened } = props;

  return (
    <>
      <h2 className="interface-title">其 他</h2>
      <div className="panel-sub">
        <FormItem
          className={'interface-edit-item'}
          {...formItemLayout}
          label={
            <span>
              消息通知&nbsp;
              <Tooltip title={'开启消息通知，可在 项目设置 里修改'}>
                <QuestionCircleOutlined style={{ width: '10px' }} />
              </Tooltip>
            </span>
          }
          name="switch_notice"
          valuePropName="checked"
          initialValue={noticed}
        >
          <Switch checkedChildren="开" unCheckedChildren="关" />
        </FormItem>
        <FormItem
          className={'interface-edit-item'}
          {...formItemLayout}
          label={
            <span>
              开放接口&nbsp;
              <Tooltip title={'用户可以在 数据导出 时选择只导出公开接口'}>
                <QuestionCircleOutlined style={{ width: '10px' }} />
              </Tooltip>
            </span>
          }
          name="api_opened"
          valuePropName="checked"
          initialValue={api_opened}
        >
          <Switch checkedChildren="开" unCheckedChildren="关" />
        </FormItem>
      </div>
    </>
  );
};

OtherSetting.propTypes = {
  /** 消息通知初值（props.noticed，来自项目 switch_notice 设置） */
  noticed: PropTypes.bool,
  /** 开放接口初值（父 state.api_opened） */
  api_opened: PropTypes.any
};

export default OtherSetting;