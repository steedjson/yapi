// @ts-check
import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useParams } from 'react-router-dom';
import { Switch, Button, message, Tooltip, Radio, Form } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import MockCol from './MockCol/MockCol.js';
import mockEditor from 'client/components/AceEditor/mockEditor';
import constants from '../../client/constants/variable.js';
const FormItem = Form.Item;

/**
 * 高级 Mock Tab 容器。原类组件经 Hooks 现代化迁移，渲染结构与行为保持一致：
 * - 旧 withRouter 注入的 props.match.params 改为 useParams；
 * - 旧 constructor state 改为 useState（单对象 patch，保持浅合并语义），
 *   旧 UNSAFE_componentWillMount 改为挂载期 useEffect；
 * - getAdvMockData 中 mockEditor 的 data 读取时机保持原样：axios 返回后
 *   setState 尚未提交，读取的是更新前的 state（latestRef 镜像等价旧 this.state）；
 * - mockEditor 库本身不迁移，仍以命令式调用挂载编辑器。
 */
const AdvMock = () => {
  const { id, actionId } = /** @type {any} */ (useParams());

  const [state, setState] = useState({
    enable: false,
    mock_script: '',
    tab: 'case'
  });
  /**
   * @param {any} patch
   */
  const patchState = patch => setState((/** @type {any} */ prevState) => ({ ...prevState, ...patch }));

  // 镜像最新 state：异步回调中的读取等价于旧类组件的实时 this.state
  const latestRef = useRef({});
  latestRef.current = { state, actionId };

  async function getAdvMockData() {
    let interfaceId = latestRef.current.actionId;
    let result = await axios.get('/api/plugin/advmock/get?interface_id=' + interfaceId);
    if (result.data.errcode === 0) {
      let mockData = result.data.data;
      patchState({
        enable: mockData.enable,
        mock_script: mockData.mock_script
      });
    }

    mockEditor({
      container: 'mock-script',
      data: latestRef.current.state.mock_script,
      onChange: function(/** @type {any} */ d) {
        patchState({
          mock_script: d.text
        });
      }
    });
  }

  // 对应旧 UNSAFE_componentWillMount
  useEffect(() => {
    getAdvMockData();
  }, []);

  const handleSubmit = () => {
    let projectId = id;
    let interfaceId = actionId;
    let params = {
      project_id: projectId,
      interface_id: interfaceId,
      mock_script: state.mock_script,
      enable: state.enable
    };
    axios.post('/api/plugin/advmock/save', params).then((/** @type {any} */ res) => {
      if (res.data.errcode === 0) {
        message.success('保存成功');
      } else {
        message.error(res.data.errmsg);
      }
    });
  };

  const onChange = (/** @type {any} */ v) => {
    patchState({
      enable: v
    });
  };

  const handleTapChange = (/** @type {any} */ e) => {
    patchState({
      tab: e.target.value
    });
  };

  const formItemLayout = {
    labelCol: {
      sm: { span: 4 }
    },
    wrapperCol: {
      sm: { span: 16 }
    }
  };
  const tailFormItemLayout = {
    wrapperCol: {
      sm: {
        span: 16,
        offset: 11
      }
    }
  };
  const { tab } = state;
  const isShowCase = tab === 'case';
  return (
    <div style={{ padding: '20px 10px' }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <Radio.Group value={tab} size="large" onChange={handleTapChange}>
          <Radio.Button value="case">期望</Radio.Button>
          <Radio.Button value="script">脚本</Radio.Button>
        </Radio.Group>
      </div>
      <div style={{ display: isShowCase ? 'none' : '' }}>
        <Form onFinish={handleSubmit}>
          <FormItem
            label={
              <span>
                是否开启&nbsp;<a
                  target="_blank"
                  rel="noopener noreferrer"
                  href={constants.docHref.adv_mock_script}
                >
                  <Tooltip title="点击查看文档">
                    <QuestionCircleOutlined />
                  </Tooltip>
                </a>
              </span>
            }
            {...formItemLayout}
          >
            <Switch
              checked={state.enable}
              onChange={onChange}
              checkedChildren="开"
              unCheckedChildren="关"
            />
          </FormItem>

          <FormItem label="Mock脚本" {...formItemLayout}>
            <div id="mock-script" style={{ minHeight: '500px' }} />
          </FormItem>
          <FormItem {...tailFormItemLayout}>
            <Button type="primary" htmlType="submit">
              保存
            </Button>
          </FormItem>
        </Form>
      </div>
      <div style={{ display: isShowCase ? '' : 'none' }}>
        <MockCol />
      </div>
    </div>
  );
};

export default AdvMock;
