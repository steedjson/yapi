import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { Button, Input, Tooltip, Select, message, Row, Col, Radio, Form } from 'antd';

import {
  QuestionCircleOutlined,
  LockOutlined,
  UnlockOutlined,
  PlusOutlined
} from '@ant-design/icons';
import { addProject } from '../../reducer/modules/project.js';
import { fetchGroupList } from '../../reducer/modules/group.js';
import { setBreadcrumb } from '../../reducer/modules/user';
const { TextArea } = Input;
const FormItem = Form.Item;
const Option = Select.Option;
const RadioGroup = Radio.Group;
import { pickRandomProperty, handlePath as handlePathUtil, nameLengthLimit } from '../../common';
import constants from '../../constants/variable.js';
import withRouter from '../../withRouter';
import './Addproject.scss';

const formItemLayout = {
  labelCol: {
    lg: { span: 3 },
    xs: { span: 24 },
    sm: { span: 6 }
  },
  wrapperCol: {
    lg: { span: 21 },
    xs: { span: 24 },
    sm: { span: 14 }
  },
  className: 'form-item'
};

function ProjectList(props) {
  const [form] = Form.useForm();
  const [groupList, setGroupList] = useState([]);
  const [currGroupId, setCurrGroupId] = useState(null);

  useEffect(() => {
    (async () => {
      props.setBreadcrumb([{ name: '新建项目' }]);
      if (!props.currGroup._id) {
        await props.fetchGroupList();
      }
    })();
  }, []);

  // 对齐原 UNSAFE_componentWillMount:分组列表就绪后同步本地 state
  useEffect(() => {
    if (props.groupList.length === 0) {
      return;
    }
    setGroupList(props.groupList);
    setCurrGroupId(props.currGroup._id ? props.currGroup._id : props.groupList[0]._id);
  }, [props.groupList, props.currGroup]);

  // 对齐 antd3 的 initialValue pristine 回填语义:分组初始值就绪后写入表单
  useEffect(() => {
    if (currGroupId != null) {
      form.setFieldsValue({ group: currGroupId + '' });
    }
  }, [currGroupId]);

  const handlePath = e => {
    let val = e.target.value;
    form.setFieldsValue({
      basepath: handlePathUtil(val)
    });
  };

  // 确认添加项目
  const handleOk = e => {
    e.preventDefault();
    form.validateFields().then(values => {
      values.group_id = values.group;
      values.icon = constants.PROJECT_ICON[0];
      values.color = pickRandomProperty(constants.PROJECT_COLOR);
      props.addProject(values).then(res => {
        if (res.payload.data.errcode == 0) {
          form.resetFields();
          message.success('创建成功! ');
          props.history.push('/project/' + res.payload.data.data._id + '/interface/api');
        }
      });
    });
  };

  return (
    <div className="g-row">
      <div className="g-row m-container">
        <Form form={form}>
          <FormItem {...formItemLayout} label="项目名称" name="name" rules={nameLengthLimit('项目')}>
            <Input />
          </FormItem>

          <FormItem
            {...formItemLayout}
            label="所属分组"
            name="group"
            initialValue={currGroupId + ''}
            rules={[
              {
                required: true,
                message: '请选择项目所属的分组!'
              }
            ]}
          >
            <Select>
              {groupList.map((item, index) => (
                <Option
                  disabled={
                    !(item.role === 'dev' || item.role === 'owner' || item.role === 'admin')
                  }
                  value={item._id.toString()}
                  key={index}
                >
                  {item.group_name}
                </Option>
              ))}
            </Select>
          </FormItem>

          <hr className="breakline" />

          <FormItem
            {...formItemLayout}
            label={
              <span>
                基本路径&nbsp;
                <Tooltip title="接口基本路径，为空是根路径">
                  <QuestionCircleOutlined />
                </Tooltip>
              </span>
            }
            name="basepath"
            rules={[
              {
                required: false,
                message: '请输入项目基本路径'
              }
            ]}
          >
            <Input onBlur={handlePath} />
          </FormItem>

          <FormItem
            {...formItemLayout}
            label="描述"
            name="desc"
            rules={[
              {
                required: false,
                message: '描述不超过144字!',
                max: 144
              }
            ]}
          >
            <TextArea rows={4} />
          </FormItem>

          <FormItem
            {...formItemLayout}
            label="权限"
            name="project_type"
            initialValue="private"
            rules={[
              {
                required: true
              }
            ]}
          >
            <RadioGroup>
              <Radio value="private" className="radio">
                <LockOutlined />
                私有
                <span className="radio-desc">只有组长和项目开发者可以索引并查看项目信息</span>
              </Radio>
              {/* <Radio value="public" className="radio">
                <UnlockOutlined />公开
                <span className="radio-desc">任何人都可以索引并查看项目信息</span>
              </Radio> */}
            </RadioGroup>
          </FormItem>
        </Form>
        <Row>
          <Col sm={{ offset: 6 }} lg={{ offset: 3 }}>
            <Button className="m-btn" icon={<PlusOutlined />} type="primary" onClick={handleOk}>
              创建项目
            </Button>
          </Col>
        </Row>
      </div>
    </div>
  );
}

ProjectList.propTypes = {
  groupList: PropTypes.array,
  currGroup: PropTypes.object,
  addProject: PropTypes.func,
  history: PropTypes.object,
  setBreadcrumb: PropTypes.func,
  fetchGroupList: PropTypes.func
};

export default connect(
  state => {
    return {
      groupList: state.group.groupList,
      currGroup: state.group.currGroup
    };
  },
  {
    fetchGroupList,
    addProject,
    setBreadcrumb
  }
)(withRouter(ProjectList));
