// @ts-check
import React, { useState, useEffect, useRef } from 'react';
import {
  Input,
  Switch,
  Select,
  Tooltip,
  Button,
  Row,
  Col,
  message,
  Card,
  Radio,
  Alert,
  Modal,
  Popover,
  Form
} from 'antd';

import { QuestionCircleOutlined, LockOutlined, UnlockOutlined, ExclamationCircleOutlined, UpOutlined, DownOutlined, SaveOutlined, DeleteOutlined } from '@ant-design/icons';
import { getV4Icon } from '../../../../constants/v4IconMap';
import PropTypes from 'prop-types';
import {
  updateProject,
  delProject,
  getProject,
  upsetProject
} from '../../../../reducer/modules/project';
import { fetchGroupMsg } from '../../../../reducer/modules/group';
import { fetchGroupList } from '../../../../reducer/modules/group.js';
import { setBreadcrumb } from '../../../../reducer/modules/user';
import { connect } from 'react-redux';
const { TextArea } = Input;
import withRouter from '../../../../withRouter';
const FormItem = Form.Item;
const RadioGroup = Radio.Group;
const RadioButton = Radio.Button;
import constants from '../../../../constants/variable.js';
const confirm = Modal.confirm;
import { nameLengthLimit, entries, trim, htmlFilter } from '../../../../common';
import '../Setting.scss';
import ProjectTag from './ProjectTag.js';
// layout
const formItemLayout = {
  labelCol: {
    lg: { offset: 1, span: 3 },
    xs: { span: 24 },
    sm: { span: 6 }
  },
  wrapperCol: {
    lg: { span: 19 },
    xs: { span: 24 },
    sm: { span: 14 }
  },
  className: 'form-item'
};

const Option = Select.Option;

/**
 * @param {any} props
 */
function ProjectMessage(props) {
  const [form] = Form.useForm();
  const tagRef = useRef(null);
  const protocol = 'http://';
  const [showDangerOptions, setShowDangerOptions] = useState(false);

  // 确认修改
  /**
   * @param {any} e
   */
  const handleOk = e => {
    e.preventDefault();
    const { updateProject, projectMsg, groupList } = props;
    form.validateFields().then((/** @type {any} */ values) => {
      let { tag } = tagRef.current.state;
      tag = tag.filter((/** @type {any} */ val) => {
        return val.name !== '';
      });
      let assignValue = Object.assign(projectMsg, values, { tag });

      values.protocol = protocol.split(':')[0];
      const group_id = assignValue.group_id;
      const selectGroup = groupList.find((/** @type {any} */ item) => {
        return item._id == group_id;
      });

      updateProject(assignValue)
        .then((/** @type {any} */ res) => {
          if (res.payload.data.errcode == 0) {
            props.getProject(props.projectId);
            message.success('修改成功! ');

            // 如果如果项目所在的分组位置发生改变
            props.fetchGroupMsg(group_id);
            // props.history.push('/group');
            let projectName = htmlFilter(assignValue.name);
            props.setBreadcrumb([
              {
                name: selectGroup.group_name,
                href: '/group/' + group_id
              },
              {
                name: projectName
              }
            ]);
          }
        })
        .catch(() => {});
      form.resetFields();
    });
  };

  /**
   * @param {any} tag
   */
  const tagSubmit = tag => {
    tagRef.current = tag;
  };

  const showConfirm = () => {
    confirm({
      title: '确认删除 ' + props.projectMsg.name + ' 项目吗？',
      content: (
        <div style={{ marginTop: '10px', fontSize: '13px', lineHeight: '25px' }}>
          <Alert
            message="警告：此操作非常危险,会删除该项目下面所有接口，并且无法恢复!"
            type="warning"
            banner
          />
          <div style={{ marginTop: '16px' }}>
            <p style={{ marginBottom: '8px' }}>
              <b>请输入项目名称确认此操作:</b>
            </p>
            <Input id="project_name" size="large" />
          </div>
        </div>
      ),
      onOk() {
        let groupName = trim((/** @type {any} */ (document.getElementById('project_name'))).value);
        if (props.projectMsg.name !== groupName) {
          message.error('项目名称有误');
          return new Promise((resolve, reject) => {
            reject('error');
          });
        } else {
          props.delProject(props.projectId).then((/** @type {any} */ res) => {
            if (res.payload.data.errcode == 0) {
              message.success('删除成功!');
              props.history.push('/group/' + props.projectMsg.group_id);
            }
          });
        }
      },
      icon: <DeleteOutlined />,
      onCancel() {}
    });
  };

  // 修改项目头像的背景颜色
  /**
   * @param {any} e
   */
  const changeProjectColor = e => {
    const { _id, color, icon } = props.projectMsg;
    props
      .upsetProject({ id: _id, color: e.target.value || color, icon })
      .then((/** @type {any} */ res) => {
      if (res.payload.data.errcode === 0) {
        props.getProject(props.projectId);
      }
    });
  };
  // 修改项目头像的图标
  /**
   * @param {any} e
   */
  const changeProjectIcon = e => {
    const { _id, color, icon } = props.projectMsg;
    props
      .upsetProject({ id: _id, color, icon: e.target.value || icon })
      .then((/** @type {any} */ res) => {
      if (res.payload.data.errcode === 0) {
        props.getProject(props.projectId);
      }
    });
  };

  // 点击“查看危险操作”按钮
  const toggleDangerOptions = () => {
    setShowDangerOptions(!showDangerOptions);
  };

  useEffect(() => {
    (async () => {
      await props.fetchGroupList();
      await props.fetchGroupMsg(props.projectMsg.group_id);
    })();
  }, []);

  const { projectMsg, currGroup } = props;
  const mockUrl =
    location.protocol +
    '//' +
    location.hostname +
    (location.port !== '' ? ':' + location.port : '') +
    `/mock/${projectMsg._id}${projectMsg.basepath}+$接口请求路径`;
  const {
    name,
    basepath,
    desc,
    project_type,
    group_id,
    switch_notice,
    strice,
    is_json5,
    tag
  } = projectMsg;
  let initFormValues = {
    name,
    basepath,
    desc,
    project_type,
    group_id,
    switch_notice,
    strice,
    is_json5,
    tag
  };

  // antd3 rc-form 会在渲染时对未触碰(pristine)字段应用最新 initialValue,
  // antd4 需在数据刷新时对未触碰字段显式回填
  useEffect(() => {
    const candidate = {
      name: initFormValues.name,
      basepath: initFormValues.basepath,
      desc: initFormValues.desc,
      project_type: initFormValues.project_type,
      group_id: initFormValues.group_id + '',
      switch_notice: initFormValues.switch_notice,
      strice: initFormValues.strice,
      is_json5: initFormValues.is_json5
    };
    const backfill = /** @type {any} */ ({});
    Object.keys(candidate).forEach((/** @type {any} */ key) => {
      if (!form.isFieldTouched(key)) {
        backfill[key] = (/** @type {Record<string, any>} */ (candidate))[key];
      }
    });
    form.setFieldsValue(backfill);
  }, [projectMsg]);

  const colorArr = entries(constants.PROJECT_COLOR);
  const colorSelector = (
    <RadioGroup onChange={changeProjectColor} value={projectMsg.color} className="color">
      {colorArr.map((item, index) => {
        return (
          <RadioButton
            key={index}
            value={item[0]}
            style={{ backgroundColor: item[1], color: '#fff', fontWeight: 'bold' }}
          >
            {item[0] === projectMsg.color ? React.createElement(getV4Icon('check')) : null}
          </RadioButton>
        );
      })}
    </RadioGroup>
  );
  const iconSelector = (
    <RadioGroup onChange={changeProjectIcon} value={projectMsg.icon} className="icon">
      {constants.PROJECT_ICON.map(item => {
        return (
          <RadioButton key={item} value={item} style={{ fontWeight: 'bold' }}>
            {React.createElement(getV4Icon(item))}
          </RadioButton>
        );
      })}
    </RadioGroup>
  );
  const selectDisbaled = projectMsg.role === 'owner' || projectMsg.role === 'admin';
  return (
    <div>
      <div className="m-panel">
        <Row className="project-setting">
          <Col xs={6} lg={{ offset: 1, span: 3 }} className="setting-logo">
            <Popover
              placement="bottom"
              title={colorSelector}
              content={iconSelector}
              trigger="click"
              overlayClassName="change-project-container"
            >
              {React.createElement(getV4Icon(projectMsg.icon || 'star-o'), {
                className: 'ui-logo',
                style: {
                  backgroundColor:
                    (/** @type {Record<string, any>} */ (constants.PROJECT_COLOR))[
                      projectMsg.color
                    ] || constants.PROJECT_COLOR.blue
                }
              })}
            </Popover>
          </Col>
          <Col xs={18} sm={15} lg={19} className="setting-intro">
            <h2 className="ui-title">
              {(currGroup.group_name || '') + ' / ' + (projectMsg.name || '')}
            </h2>
            {/* <p className="ui-desc">{projectMsg.desc}</p> */}
          </Col>
        </Row>
        <hr className="breakline" />
        <Form form={form}>
          <FormItem {...formItemLayout} label="项目ID">
            <span>{props.projectMsg._id}</span>
          </FormItem>
          <FormItem
            {...formItemLayout}
            label="项目名称"
            name="name"
            initialValue={initFormValues.name}
            rules={nameLengthLimit('项目')}
          >
            <Input />
          </FormItem>
          <FormItem
            {...formItemLayout}
            label="所属分组"
            name="group_id"
            initialValue={initFormValues.group_id + ''}
            rules={[
              {
                required: true,
                message: '请选择项目所属的分组!'
              }
            ]}
          >
            <Select disabled={!selectDisbaled}>
              {props.groupList.map((/** @type {any} */ item, /** @type {number} */ index) => (
                <Option value={item._id.toString()} key={index}>
                  {item.group_name}
                </Option>
              ))}
            </Select>
          </FormItem>

          <FormItem
            {...formItemLayout}
            label={
              <span>
                接口基本路径&nbsp;
                <Tooltip title="基本路径为空表示根路径">
                  <QuestionCircleOutlined />
                </Tooltip>
              </span>
            }
            name="basepath"
            initialValue={initFormValues.basepath}
            rules={[
              {
                required: false,
                message: '请输入基本路径! '
              }
            ]}
          >
            <Input />
          </FormItem>

          <FormItem
            {...formItemLayout}
            label={
              <span>
                MOCK地址&nbsp;
                <Tooltip title="具体使用方法请查看文档">
                  <QuestionCircleOutlined />
                </Tooltip>
              </span>
            }
          >
            <Input disabled value={mockUrl} onChange={() => {}} />
          </FormItem>

          <FormItem
            {...formItemLayout}
            label="描述"
            name="desc"
            initialValue={initFormValues.desc}
            rules={[
              {
                required: false
              }
            ]}
          >
            <TextArea rows={8} />
          </FormItem>

          <FormItem
            {...formItemLayout}
            label={
              <span>
                tag 信息&nbsp;
                <Tooltip title="定义 tag 信息，过滤接口">
                  <QuestionCircleOutlined />
                </Tooltip>
              </span>
            }
          >
            <ProjectTag tagMsg={tag} ref={tagSubmit} />
            {/* <Tag tagMsg={tag} ref={tagSubmit} /> */}
          </FormItem>
          <FormItem
            {...formItemLayout}
            label={
              <span>
                mock严格模式&nbsp;
                <Tooltip title="开启后 mock 请求会对 query，body form 的必须字段和 json schema 进行校验">
                  <QuestionCircleOutlined />
                </Tooltip>
              </span>
            }
            name="strice"
            valuePropName="checked"
            initialValue={initFormValues.strice}
          >
            <Switch checkedChildren="开" unCheckedChildren="关" />
          </FormItem>
          <FormItem
            {...formItemLayout}
            label={
              <span>
                开启json5&nbsp;
                <Tooltip title="开启后可在接口 body 和返回值中写 json 字段">
                  <QuestionCircleOutlined />
                </Tooltip>
              </span>
            }
            name="is_json5"
            valuePropName="checked"
            initialValue={initFormValues.is_json5}
          >
            <Switch checkedChildren="开" unCheckedChildren="关" />
          </FormItem>
          <FormItem
            {...formItemLayout}
            label="默认开启消息通知"
            name="switch_notice"
            valuePropName="checked"
            initialValue={initFormValues.switch_notice}
          >
            <Switch checkedChildren="开" unCheckedChildren="关" />
          </FormItem>

          <FormItem
            {...formItemLayout}
            label="权限"
            name="project_type"
            rules={[
              {
                required: true
              }
            ]}
            initialValue={initFormValues.project_type}
          >
            <RadioGroup>
              <Radio value="private" className="radio">
                <LockOutlined />
                私有
                <span className="radio-desc">只有组长和项目开发者可以索引并查看项目信息</span>
              </Radio>
              {projectMsg.role === 'admin' && (
                <Radio value="public" className="radio">
                  <UnlockOutlined />
                  公开
                  <span className="radio-desc">任何人都可以索引并查看项目信息</span>
                </Radio>
              )}
            </RadioGroup>
          </FormItem>
        </Form>

        <div className="btnwrap-changeproject">
          <Button
            className="m-btn btn-save"
            icon={<SaveOutlined />}
            type="primary"
            size="large"
            onClick={handleOk}
          >
            保 存
          </Button>
        </div>

        {/* 只有组长和管理员有权限删除项目 */}
        {projectMsg.role === 'owner' || projectMsg.role === 'admin' ? (
          <div className="danger-container">
            <div className="title">
              <h2 className="content">
                <ExclamationCircleOutlined /> 危险操作
              </h2>
              <Button onClick={toggleDangerOptions}>
                查 看{React.createElement(showDangerOptions ? UpOutlined : DownOutlined)}
              </Button>
            </div>
            {showDangerOptions ? (
              <Card hoverable={true} className="card-danger">
                <div className="card-danger-content">
                  <h3>删除项目</h3>
                  <p>项目一旦删除，将无法恢复数据，请慎重操作！</p>
                  <p>只有组长和管理员有权限删除项目。</p>
                </div>
                <Button type="danger" ghost className="card-danger-btn" onClick={showConfirm}>
                  删除
                </Button>
              </Card>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

ProjectMessage.propTypes = {
  projectId: PropTypes.number,
  updateProject: PropTypes.func,
  delProject: PropTypes.func,
  getProject: PropTypes.func,
  history: PropTypes.object,
  fetchGroupMsg: PropTypes.func,
  upsetProject: PropTypes.func,
  groupList: PropTypes.array,
  projectList: PropTypes.array,
  projectMsg: PropTypes.object,
  fetchGroupList: PropTypes.func,
  currGroup: PropTypes.object,
  setBreadcrumb: PropTypes.func
};

export default connect(
  (/** @type {any} */ state) => {
    return {
      projectList: state.project.projectList,
      groupList: state.group.groupList,
      projectMsg: state.project.currProject,
      currGroup: state.group.currGroup
    };
  },
  {
    updateProject,
    delProject,
    getProject,
    fetchGroupMsg,
    upsetProject,
    fetchGroupList,
    setBreadcrumb
  }
)(withRouter(ProjectMessage));
