// @ts-check
import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Switch, Button, Tooltip, message, Form } from 'antd';

import { QuestionCircleOutlined } from '@ant-design/icons';
const FormItem = Form.Item;
import AceEditor from '../../../../components/AceEditor/AceEditor';
// project 切片已迁至 Zustand（批次4），本组件的 redux 依赖随迁移全部移除
import useProjectStore from '../../../../store/projectStore';

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

/**
 * 全局 mock 脚本配置。原类组件经 Hooks 现代化迁移，渲染结构与行为保持一致：
 * - 旧 @connect 改为 Zustand store 订阅（批次4）；
 * - 旧 UNSAFE_componentWillMount 首帧前回填（is_mock_open / project_mock_script）
 *   改为 useState 惰性初始化，首帧渲染输出一致；旧实现不响应 projectMsg 后续
 *   变化，惰性初始化仅取一次，行为保持一致。
 */
/**
 * @param {any} props
 */
const ProjectMock = props => {
  const { projectId } = props;
  const projectMsg = useProjectStore(state => state.currProject);
  const updateProjectMock = useProjectStore(state => state.updateProjectMock);
  const getProject = useProjectStore(state => state.getProject);

  const [isMockOpen, setIsMockOpen] = useState(() => projectMsg.is_mock_open);
  const [projectMockScript, setProjectMockScript] = useState(() => projectMsg.project_mock_script);

  const handleSubmit = async () => {
    let params = {
      id: projectId,
      project_mock_script: projectMockScript,
      is_mock_open: isMockOpen
    };

    let result = await updateProjectMock(params);

    if (result && result.data.errcode === 0) {
      message.success('保存成功');
      await getProject(projectId);
    } else {
      message.success('保存失败, ' + ((result && result.data.errmsg) || '请稍后重试'));
    }
  };

  // 是否开启
  /**
   * @param {any} v
   */
  const onChange = v => {
    setIsMockOpen(v);
  };

  /**
   * @param {any} e
   */
  const handleMockJsInput = e => {
    setProjectMockScript(e.text);
  };

  return (
    <div className="m-panel">
      <Form>
        <FormItem
          label={
            <span>
              是否开启&nbsp;<a
                target="_blank"
                rel="noopener noreferrer"
                href="https://hellosean1025.github.io/yapi/documents/project.html#%E5%85%A8%E5%B1%80mock"
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
            checked={isMockOpen}
            onChange={onChange}
            checkedChildren="开"
            unCheckedChildren="关"
          />
        </FormItem>
        <FormItem label="Mock脚本" {...formItemLayout}>
          <AceEditor
            data={projectMockScript}
            onChange={handleMockJsInput}
            style={{ minHeight: '500px' }}
          />
        </FormItem>
        <FormItem {...tailFormItemLayout}>
          <Button type="primary" htmlType="submit" onClick={handleSubmit}>
            保存
          </Button>
        </FormItem>
      </Form>
    </div>
  );
};

ProjectMock.propTypes = {
  projectId: PropTypes.number
};

export default ProjectMock;
