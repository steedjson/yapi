import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { useSelector, useDispatch } from 'react-redux';
import { Button, message, Form } from 'antd';

const FormItem = Form.Item;
import './project-request.scss';
import AceEditor from 'client/components/AceEditor/AceEditor';
import { updateProjectScript, getProject } from '../../../../reducer/modules/project';

/**
 * 请求配置面板。原类组件经 Hooks 现代化迁移，渲染结构与行为保持一致：
 * - 旧 @connect 改为 useSelector/useDispatch；
 * - 旧 UNSAFE_componentWillMount 首帧前回填（pre_script / after_script）改为
 *   useState 惰性初始化，首帧渲染输出一致；旧实现不响应 projectMsg 后续变化，
 *   惰性初始化仅取一次，行为保持一致。
 */
const ProjectRequest = props => {
  const { projectId } = props;
  const dispatch = useDispatch();
  const projectMsg = useSelector(state => state.project.currProject);

  const [preScript, setPreScript] = useState(() => projectMsg.pre_script);
  const [afterScript, setAfterScript] = useState(() => projectMsg.after_script);

  const handleSubmit = async () => {
    let result = await dispatch(
      updateProjectScript({
        id: projectId,
        pre_script: preScript,
        after_script: afterScript
      })
    );
    if (result.payload.data.errcode === 0) {
      message.success('保存成功');
      await dispatch(getProject(projectId));
    } else {
      message.success('保存失败, ' + result.payload.data.errmsg);
    }
  };

  const formItemLayout = {
    labelCol: {
      xs: { span: 24 },
      sm: { span: 6 }
    },
    wrapperCol: {
      xs: { span: 24 },
      sm: { span: 16 }
    }
  };

  const tailFormItemLayout = {
    wrapperCol: {
      xs: {
        span: 24,
        offset: 0
      },
      sm: {
        span: 16,
        offset: 8
      }
    }
  };

  return (
    <div className="project-request">
      {/* 保存按钮经 onClick 提交,不依赖表单 onSubmit */}
      <Form>
        <FormItem {...formItemLayout} label="Pre-request Script(请求参数处理脚本)">
          <AceEditor
            data={preScript}
            onChange={editor => setPreScript(editor.text)}
            fullScreen={true}
            className="request-editor"
          />
        </FormItem>
        <FormItem {...formItemLayout} label="Pre-response Script(响应数据处理脚本)">
          <AceEditor
            data={afterScript}
            onChange={editor => setAfterScript(editor.text)}
            fullScreen={true}
            className="request-editor"
          />
        </FormItem>
        <FormItem {...tailFormItemLayout}>
          <Button onClick={handleSubmit} type="primary">
            保存
          </Button>
        </FormItem>
      </Form>
    </div>
  );
};

ProjectRequest.propTypes = {
  projectId: PropTypes.number
};

export default ProjectRequest;
