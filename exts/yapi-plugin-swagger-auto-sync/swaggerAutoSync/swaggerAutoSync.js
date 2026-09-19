// @ts-check
import React, { useState, useEffect } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { formatTime } from 'client/common.js';
import { Switch, Button, Tooltip, message, Input, Select, Form } from 'antd';
import { QuestionCircleOutlined, SaveOutlined } from '@ant-design/icons';
import { handleSwaggerUrlData } from 'client/reducer/modules/project';
const FormItem = Form.Item;
const Option = Select.Option;
import axios from 'axios';

// layout
const formItemLayout = {
  labelCol: {
    lg: { span: 5 },
    xs: { span: 24 },
    sm: { span: 10 }
  },
  wrapperCol: {
    lg: { span: 16 },
    xs: { span: 24 },
    sm: { span: 12 }
  },
  className: 'form-item'
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
 * Swagger 自动同步设置表单。
 * @param {any} props
 */
function ProjectInterfaceSync(props) {
  const [form] = Form.useForm();
  const [sync_data, setSyncData] = useState(/** @type {any} */ ({ is_sync_open: false }));
  //默认每份钟同步一次,取一个随机数
  const [random_corn] = useState('*/2 * * * *');

  useEffect(() => {
    getSyncData();
  }, []);

  async function getSyncData() {
    let projectId = props.projectMsg._id;
    let result = await axios.get('/api/plugin/autoSync/get?project_id=' + projectId);
    if (result.data.errcode === 0) {
      if (result.data.data) {
        setSyncData(result.data.data);
        // antd3 时代字段 initialValue 在异步数据到达后会回填未触动的字段,
        // antd4 需显式 setFieldsValue
        const data = result.data.data;
        form.setFieldsValue({
          sync_mode: data.sync_mode,
          sync_json_url: data.sync_json_url,
          sync_cron: data.sync_cron ? data.sync_cron : random_corn
        });
      }
    }
  }

  const handleSubmit = async () => {
    /** @type {any} */
    let params = {
      project_id: props.projectId,
      is_sync_open: sync_data.is_sync_open,
      uid: props.projectMsg.uid
    };
    if (sync_data._id) {
      params.id = sync_data._id;
    }
    form.validateFields().then((/** @type {any} */ values) => {
      let assignValue = Object.assign(params, values);
      axios.post('/api/plugin/autoSync/save', assignValue).then((/** @type {any} */ res) => {
        if (res.data.errcode === 0) {
          message.success('保存成功');
        } else {
          message.error(res.data.errmsg);
        }
      });
    });
  };

  /**
   * @param {any} rule
   * @param {any} value
   * @param {any} callback
   */
  const validSwaggerUrl = async (rule, value, callback) => {
    if (!value) return;
    try {
      await props.handleSwaggerUrlData(value);
    } catch (e) {
      callback('swagger地址不正确');
    }
    callback();
  };

  // 是否开启
  const onChange = (/** @type {any} */ v) => {
    setSyncData((/** @type {any} */ prev) => ({
      ...prev,
      is_sync_open: v
    }));
  };

  /**
   * @param {any} rule
   * @param {any} value
   * @param {any} callback
   */
  const sync_cronCheck = (rule, value, callback) => {
    if (!value) return;
    value = value.trim();
    if (value.split(/ +/).length > 5) {
      callback('不支持秒级别的设置，建议使用 "*/10 * * * *" ,每隔10分钟更新');
    }
    callback();
  };

  return (
    <div className="m-panel">
      <Form form={form}>
        <FormItem label="是否开启自动同步" {...formItemLayout}>
          <Switch
            checked={sync_data.is_sync_open}
            onChange={onChange}
            checkedChildren="开"
            unCheckedChildren="关"
          />
          {sync_data.last_sync_time != null ? (
            <div>
              上次更新时间:<span className="logtime">{formatTime(sync_data.last_sync_time)}</span>
            </div>
          ) : null}
        </FormItem>

        <div>
          <FormItem
            {...formItemLayout}
            label={
              <span className="label">
                数据同步&nbsp;
                <Tooltip
                  title={
                    <div>
                      <h3 style={{ color: 'white' }}>普通模式</h3>
                      <p>不导入已存在的接口</p>
                      <br />
                      <h3 style={{ color: 'white' }}>智能合并</h3>
                      <p>
                        已存在的接口，将合并返回数据的 response，适用于导入了 swagger
                        数据，保留对数据结构的改动
                      </p>
                      <br />
                      <h3 style={{ color: 'white' }}>完全覆盖</h3>
                      <p>不保留旧数据，完全使用新数据，适用于接口定义完全交给后端定义</p>
                    </div>
                  }
                >
                  <QuestionCircleOutlined />
                </Tooltip>{' '}
              </span>
            }
            name="sync_mode"
            initialValue={sync_data.sync_mode}
            rules={[
              {
                required: true,
                message: '请选择同步方式!'
              }
            ]}
          >
            <Select>
              <Option value="normal">普通模式</Option>
              <Option value="good">智能合并</Option>
              <Option value="merge">完全覆盖</Option>
            </Select>
          </FormItem>

          <FormItem
            {...formItemLayout}
            label="项目的swagger json地址"
            name="sync_json_url"
            validateTrigger="onBlur"
            initialValue={sync_data.sync_json_url}
            rules={[
              {
                required: true,
                message: '输入swagger地址'
              },
              {
                validator: validSwaggerUrl
              }
            ]}
          >
            <Input />
          </FormItem>

          <FormItem
            {...formItemLayout}
            label={
              <span>
                类cron风格表达式(默认10分钟更新一次)&nbsp;
                <a href="https://blog.csdn.net/shouldnotappearcalm/article/details/89469047">
                  参考
                </a>
              </span>
            }
            name="sync_cron"
            initialValue={sync_data.sync_cron ? sync_data.sync_cron : random_corn}
            rules={[
              {
                required: true,
                message: '输入node-schedule的类cron表达式!'
              },
              {
                validator: sync_cronCheck
              }
            ]}
          >
            <Input />
          </FormItem>
        </div>
        <FormItem {...tailFormItemLayout}>
          <Button type="primary" icon={<SaveOutlined />} size="large" onClick={handleSubmit}>
            保存
          </Button>
        </FormItem>
      </Form>
    </div>
  );
}

ProjectInterfaceSync.propTypes = {
  match: PropTypes.object,
  projectId: PropTypes.number,
  projectMsg: PropTypes.object,
  handleSwaggerUrlData: PropTypes.func
};

export default connect(
  (/** @type {any} */ state) => {
    return {
      projectMsg: state.project.currProject
    };
  },
  {
    handleSwaggerUrlData
  }
)(ProjectInterfaceSync);
