import React from 'react';
import PropTypes from 'prop-types';
import { Input, Button, Select, Form } from 'antd';
const FormItem = Form.Item;
const Option = Select.Option;
function AddInterfaceForm(props) {
  const [form] = Form.useForm();
  const formItemLayout = {
    labelCol: {
      xs: { span: 24 },
      sm: { span: 6 }
    },
    wrapperCol: {
      xs: { span: 24 },
      sm: { span: 14 }
    }
  };

  const handleSubmit = values => {
    props.onSubmit(values);
  };

  return (
    <Form form={form} onFinish={handleSubmit}>
      <FormItem
        {...formItemLayout}
        label="分类名"
        name="name"
        initialValue={props.catdata ? props.catdata.name || null : null}
        rules={[
          {
            required: true,
            message: '请输入分类名称!'
          }
        ]}
      >
        <Input placeholder="分类名称" />
      </FormItem>
      {!props.catdata && props.categories ? (
        <FormItem
          {...formItemLayout}
          label="父分类"
          name="parent_id"
          initialValue={props.parentId || 0}
        >
          <Select>
            <Option value={0}>顶级分类</Option>
            {props.categories.map(item => (
              <Option key={item._id} value={item._id}>
                {item.label}
              </Option>
            ))}
          </Select>
        </FormItem>
      ) : null}

      <FormItem
        {...formItemLayout}
        label="备注"
        name="desc"
        initialValue={props.catdata ? props.catdata.desc || null : null}
      >
        <Input placeholder="备注" />
      </FormItem>

      <FormItem className="catModalfoot" wrapperCol={{ span: 24, offset: 8 }}>
        <Button onClick={props.onCancel} style={{ marginRight: '10px' }}>
          取消
        </Button>
        <FormItem noStyle shouldUpdate={true}>
          {() => (
            <Button type="primary" htmlType="submit" // antd4 下 getFieldsError 惯用法行为变化,改按必填值是否已填控制禁用
              disabled={!form.getFieldValue('name')}>
              提交
            </Button>
          )}
        </FormItem>
      </FormItem>
    </Form>
  );
}

AddInterfaceForm.propTypes = {
  onSubmit: PropTypes.func,
  onCancel: PropTypes.func,
  catdata: PropTypes.object,
  categories: PropTypes.array,
  parentId: PropTypes.number
};

export default AddInterfaceForm;
