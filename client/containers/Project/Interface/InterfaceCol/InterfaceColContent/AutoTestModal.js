// @ts-check
/**
 * InterfaceColContent 子组件：服务端自动化测试弹窗（自 InterfaceColContent.js 原位抽离的 JSX 子树）。
 *
 * 职责（单一）：渲染服务端自动化测试的配置项（环境选择 / 输出格式 / 消息通知 / 下载数据）
 * 与自动化测试 URL 展示、复制入口，并把各项变更按原有签名回调上抛。
 *
 * 边界与等价性：
 *   - 受控组件：visible / envValue / collapseKey / mode / email / download 由父组件以 props
 *     传入，本组件不持有状态；环境选择器（CaseEnv）与主工具栏共用同一组回调；
 *   - href / urlText / onCopyUrl 由父组件计算后传入（原实现为 localUrl + autoTestsUrl 的
 *     拼接与 copyUrl 调用），本组件不做 URL 组装，保持 URL 派生逻辑仍由父组件掌管；
 *   - 关闭（onCancel）由父组件 handleAuto 重置自动测试相关 state，与抽取前一致；
 *   - 不引入包装 DOM 元素：根节点即原父组件中的 <Modal>。
 */
import React from 'react';
import PropTypes from 'prop-types';
import { Tooltip, Button, Row, Col, Modal, Select, Switch } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import CaseEnv from 'client/components/CaseEnv';

const Option = Select.Option;

/**
 * @param {any} props
 */
const AutoTestModal = props => {
  const {
    visible,
    envList,
    envValue,
    collapseKey,
    onEnvChange,
    onCollapseChange,
    mode,
    email,
    download,
    onModeChange,
    onEmailChange,
    onDownloadChange,
    href,
    urlText,
    onCopyUrl,
    onCancel
  } = props;

  return (
    <Modal
      title="服务端自动化测试"
      width="780px"
      style={{
        minHeight: '500px'
      }}
      open={visible}
      onCancel={onCancel}
      className="autoTestsModal"
      footer={null}
    >
      <Row type="flex" justify="space-around" className="row" align="top">
        <Col span={3} className="label" style={{ paddingTop: '16px' }}>
          选择环境
          <Tooltip title="默认使用测试用例选择的环境">
            <QuestionCircleOutlined />
          </Tooltip>
          &nbsp;：
        </Col>
        <Col span={21}>
          <CaseEnv
            envList={envList}
            currProjectEnvChange={onEnvChange}
            envValue={envValue}
            collapseKey={collapseKey}
            changeClose={onCollapseChange}
          />
        </Col>
      </Row>
      <Row type="flex" justify="space-around" className="row" align="middle">
        <Col span={3} className="label">
          输出格式：
        </Col>
        <Col span={21}>
          <Select value={mode} onChange={onModeChange}>
            <Option key="html" value="html">
              html
            </Option>
            <Option key="json" value="json">
              json
            </Option>
          </Select>
        </Col>
      </Row>
      <Row type="flex" justify="space-around" className="row" align="middle">
        <Col span={3} className="label">
          消息通知
          <Tooltip title={'测试不通过时，会给项目组成员发送消息通知'}>
            <QuestionCircleOutlined
              style={{
                width: '10px'
              }}
            />
          </Tooltip>
          &nbsp;：
        </Col>
        <Col span={21}>
          <Switch
            checked={email}
            checkedChildren="开"
            unCheckedChildren="关"
            onChange={onEmailChange}
          />
        </Col>
      </Row>
      <Row type="flex" justify="space-around" className="row" align="middle">
        <Col span={3} className="label">
          下载数据
          <Tooltip title={'开启后，测试数据将被下载到本地'}>
            <QuestionCircleOutlined
              style={{
                width: '10px'
              }}
            />
          </Tooltip>
          &nbsp;：
        </Col>
        <Col span={21}>
          <Switch
            checked={download}
            checkedChildren="开"
            unCheckedChildren="关"
            onChange={onDownloadChange}
          />
        </Col>
      </Row>
      <Row type="flex" justify="space-around" className="row" align="middle">
        <Col span={21} className="autoTestUrl">
          <a
            target="_blank"
            rel="noopener noreferrer"
            href={href} >
            {urlText}
          </a>
        </Col>
        <Col span={3}>
          <Button className="copy-btn" onClick={() => onCopyUrl(href)}>
            复制
          </Button>
        </Col>
      </Row>
      <div className="autoTestMsg">
        注：访问该URL，可以测试所有用例，请确保YApi服务器可以访问到环境配置的 domain
      </div>
    </Modal>
  );
};

AutoTestModal.propTypes = {
  visible: PropTypes.bool,
  envList: PropTypes.array,
  /** 每个项目 id → 已选环境名（原 state.currColEnvObj） */
  envValue: PropTypes.object,
  collapseKey: PropTypes.any,
  onEnvChange: PropTypes.func,
  onCollapseChange: PropTypes.func,
  /** 输出格式：html / json */
  mode: PropTypes.string,
  email: PropTypes.bool,
  download: PropTypes.bool,
  onModeChange: PropTypes.func,
  onEmailChange: PropTypes.func,
  onDownloadChange: PropTypes.func,
  /** 自动化测试完整 URL（localUrl + autoTestsUrl），用于链接与复制 */
  href: PropTypes.string,
  /** URL 展示文本（autoTestsUrl，不含 localUrl 前缀） */
  urlText: PropTypes.string,
  onCopyUrl: PropTypes.func,
  onCancel: PropTypes.func
};

export default AutoTestModal;