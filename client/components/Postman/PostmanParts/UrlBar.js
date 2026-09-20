// @ts-check
/**
 * Postman 子组件：请求地址栏（自 Postman.js 原位抽离的 JSX 子树）。
 *
 * 职责（单一）：渲染「方法（只读）/ 测试环境选择 / 接口路径（只读） + 发送 / 保存」
 * 一行，并上抛环境切换、环境配置、发送、保存四类事件。
 *
 * 边界与等价性：
 *   - 只做受控展示 + 事件上抛：method / case_env / env / path / hasPlugin / loading 全部
 *     来自父组件，本组件不持有状态（环境下拉为受控 value={case_env}，切换经 onSelect 上抛）；
 *   - 「环境配置」选项仍作为 Select 的最后一个 Option 内嵌 Button（原实现即如此，
 *     点击即打开环境设置弹窗，与父组件的 showEnvModal 接线一致）；
 *   - 发送按钮的 Tooltip 文案、loading 文案（发送/取消）与保存按钮文案（保存/更新）
 *     按原表达式逐字保留；
 *   - 不引入包装 DOM 元素：根节点即原 <div className="url">。
 */
import React from 'react';
import PropTypes from 'prop-types';
import { Button, Input, Select, Tooltip } from 'antd';
import constants from '../../../constants/variable.js';

const HTTP_METHOD = constants.HTTP_METHOD;
const InputGroup = Input.Group;
const Option = Select.Option;

/**
 * @param {any} props
 */
const UrlBar = props => {
  const {
    method,
    case_env,
    env,
    path,
    hasPlugin,
    loading,
    type,
    onSelectDomain,
    onShowEnvModal,
    onSend,
    onSave
  } = props;

  return (
    <div className="url">
      <InputGroup compact style={{ display: 'flex' }}>
        <Select disabled value={method} style={{ flexBasis: 60 }}>
          {Object.keys(HTTP_METHOD).map(name => (
            <Option value={name.toUpperCase()} key={name}>
              {name.toUpperCase()}
            </Option>
          ))}
        </Select>
        <Select
          value={case_env}
          style={{ flexBasis: 180, flexGrow: 1 }}
          onSelect={onSelectDomain}
        >
          {env.map((/** @type {any} */ item, /** @type {number} */ index) => (
            <Option value={item.name} key={index}>
              {item.name + '：' + item.domain}
            </Option>
          ))}
          <Option value="环境配置" disabled style={{ cursor: 'pointer', color: '#2395f1' }}>
            <Button type="primary" onClick={onShowEnvModal}>
              环境配置
            </Button>
          </Option>
        </Select>

        <Input
          disabled
          value={path}
          spellCheck="false"
          style={{ flexBasis: 180, flexGrow: 1 }}
        />
      </InputGroup>

      <Tooltip
        placement="bottom"
        title={(() => {
          if (hasPlugin) {
            return '发送请求';
          } else {
            return '请安装 cross-request 插件';
          }
        })()}
      >
        <Button
          disabled={!hasPlugin}
          onClick={onSend}
          type="primary"
          style={{ marginLeft: 10 }}
          loading={loading}
        >
          {loading ? '取消' : '发送'}
        </Button>
      </Tooltip>

      <Tooltip
        placement="bottom"
        title={() => {
          return type === 'inter' ? '保存到测试集' : '更新该用例';
        }}
      >
        <Button onClick={onSave} type="primary" style={{ marginLeft: 10 }}>
          {type === 'inter' ? '保存' : '更新'}
        </Button>
      </Tooltip>
    </div>
  );
};

UrlBar.propTypes = {
  method: PropTypes.string,
  case_env: PropTypes.string,
  env: PropTypes.array,
  path: PropTypes.string,
  hasPlugin: PropTypes.bool,
  loading: PropTypes.bool,
  /** enum[case, inter]，决定保存按钮文案 */
  type: PropTypes.string,
  /** 环境切换（父 selectDomain） */
  onSelectDomain: PropTypes.func,
  /** 打开环境设置弹窗（父 showEnvModal） */
  onShowEnvModal: PropTypes.func,
  /** 发送/取消（父 reqRealInterface，防双发语义在父组件） */
  onSend: PropTypes.func,
  /** 保存/更新（父 props.save，Run.js / InterfaceCaseContent 注入） */
  onSave: PropTypes.func
};

export default UrlBar;