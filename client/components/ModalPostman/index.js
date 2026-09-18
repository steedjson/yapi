import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import './index.scss';
import { Alert, Modal, Row, Col, Collapse, Input, Tooltip } from 'antd';
import { EditOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import MockList from './MockList.js';
import MethodsList from './MethodsList.js';
import VariablesSelect from './VariablesSelect.js';
import { trim } from '../../common.js';

const { handleParamsValue } = require('common/utils.js');

// 深拷贝
function deepEqual(state) {
  return JSON.parse(JSON.stringify(state));
}

function closeRightTabsAndAddNewTab(arr, index, name, params) {
  let newParamsList = [].concat(arr);
  newParamsList.splice(index + 1, newParamsList.length - index);
  newParamsList.push({
    name: '',
    params: []
  });

  let curParams = params || [];
  let curname = name || '';
  newParamsList[index] = {
    ...newParamsList[index],
    name: curname,
    params: curParams
  };
  return newParamsList;
}

export default function ModalPostman(props) {
  const { visible, envType, id, inputValue } = props;
  const [methodsParamsList, setMethodsParamsList] = useState([
    {
      name: '',
      params: [],
      type: 'dataSource'
    }
  ]);
  const [constantInput, setConstantInput] = useState('');
  const [activeKey, setActiveKey] = useState('1');

  const mockClick = index => (curname, params) => {
    setMethodsParamsList(list => closeRightTabsAndAddNewTab(list, index, curname, params));
  };

  // 初始化列表:解析 {{ ... }} 表达式为方法参数列表
  const handleInitList = val => {
    val = val.replace(/^\{\{(.+)\}\}$/g, '$1');
    let valArr = val.split('|');

    if (valArr[0].indexOf('@') >= 0) {
      setActiveKey('2');
    } else if (valArr[0].indexOf('$') >= 0) {
      setActiveKey('3');
    }

    let paramsList = [
      {
        name: trim(valArr[0]),
        params: [],
        type: 'dataSource'
      }
    ];

    for (let i = 1; i < valArr.length; i++) {
      let nameArr = valArr[i].split(':');

      let paramArr = nameArr[1] && nameArr[1].split(',');
      paramArr =
        paramArr &&
        paramArr.map(item => {
          return trim(item);
        });
      let item = {
        name: trim(nameArr[0]),
        params: paramArr || []
      };
      paramsList.push(item);
    }

    setMethodsParamsList(paramsList);
    mockClick(valArr.length)();
  };

  // 挂载及 inputValue 变化时初始化常量输入与表达式解析(对应原 UNSAFE_componentWillMount)
  useEffect(() => {
    setConstantInput(inputValue || '');
    inputValue && handleInitList(inputValue);
  }, [inputValue]);

  //  处理常量输入
  const handleConstantsInput = val => {
    val = val.replace(/^\{\{(.+)\}\}$/g, '$1');
    setConstantInput(val);
    mockClick(0)(val);
  };

  const handleParamsInput = (e, clickIndex, paramsIndex) => {
    setMethodsParamsList(list => {
      let newParamsList = deepEqual(list);
      newParamsList[clickIndex].params[paramsIndex] = e;
      return newParamsList;
    });
  };

  // 处理错误
  const handleError = () => {
    return (
      <Alert
        message="请求“变量集”尚未运行,所以我们无法从其响应中提取的值。您可以在测试集合中测试这些变量。"
        type="warning"
      />
    );
  };

  // 初始化
  const setInit = () => {
    let initParamsList = [
      {
        name: '',
        params: [],
        type: 'dataSource'
      }
    ];
    setMethodsParamsList(initParamsList);
  };
  // 处理取消插入
  const handleCancel = () => {
    setInit();
    props.handleCancel();
  };

  // 处理插入
  const handleOk = installValue => {
    props.handleOk(installValue);
    setInit();
  };
  // 处理面板切换
  const handleCollapse = key => {
    setActiveKey(key);
  };

  const outputParams = () => {
    let str = '';
    let length = methodsParamsList.length;
    methodsParamsList.forEach((item, index) => {
      let isShow = item.name && length - 2 !== index;
      str += item.name;
      item.params.forEach((item, index) => {
        let isParams = index > 0;
        str += isParams ? ' , ' : ' : ';
        str += item;
      });
      str += isShow ? ' | ' : '';
    });
    return '{{ ' + str + ' }}';
  };

  //  处理表达式
  const handleValue = val => {
    return handleParamsValue(val, {});
  };

  return (
    <Modal
      title={
        <p>
          <EditOutlined /> 高级参数设置
        </p>
      }
      open={visible}
      onOk={() => handleOk(outputParams())}
      onCancel={handleCancel}
      wrapClassName="modal-postman"
      width={1024}
      maskClosable={false}
      okText="插入"
    >
      <Row className="modal-postman-form" type="flex">
        {methodsParamsList.map((item, index) => {
          return item.type === 'dataSource' ? (
            <Col span={8} className="modal-postman-col" key={index}>
              <Collapse
                className="modal-postman-collapse"
                activeKey={activeKey}
                onChange={handleCollapse}
                bordered={false}
                accordion
                items={[
                  {
                    key: '1',
                    label: <h3 className="mock-title">常量</h3>,
                    children: (
                      <Input
                        placeholder="基础参数值"
                        value={constantInput}
                        onChange={e => handleConstantsInput(e.target.value, index)}
                      />
                    )
                  },
                  {
                    key: '2',
                    label: <h3 className="mock-title">mock数据</h3>,
                    children: <MockList click={mockClick(index)} clickValue={item.name} />
                  },
                  ...(envType === 'case'
                    ? [
                        {
                          key: '3',
                          label: (
                            <h3 className="mock-title">
                              变量&nbsp;<Tooltip
                                placement="top"
                                title="YApi 提供了强大的变量参数功能，你可以在测试的时候使用前面接口的 参数 或 返回值 作为 后面接口的参数，即使接口之间存在依赖，也可以轻松 一键测试~"
                              >
                                <QuestionCircleOutlined />
                              </Tooltip>
                            </h3>
                          ),
                          children: (
                            <VariablesSelect id={id} click={mockClick(index)} clickValue={item.name} />
                          )
                        }
                      ]
                    : [])
                ]}
              />
            </Col>
          ) : (
            <Col span={8} className="modal-postman-col" key={index}>
              <MethodsList
                click={mockClick(index)}
                clickValue={item.name}
                params={item.params}
                paramsInput={handleParamsInput}
                clickIndex={index}
              />
            </Col>
          );
        })}
      </Row>
      <Row className="modal-postman-expression">
        <Col span={6}>
          <h3 className="title">表达式</h3>
        </Col>
        <Col span={18}>
          <span className="expression-item">{outputParams()}</span>
        </Col>
      </Row>
      <Row className="modal-postman-preview">
        <Col span={6}>
          <h3 className="title">预览</h3>
        </Col>
        <Col span={18}>
          <h3>{handleValue(outputParams()) || (outputParams() && handleError())}</h3>
        </Col>
      </Row>
    </Modal>
  );
}

ModalPostman.propTypes = {
  visible: PropTypes.bool,
  handleCancel: PropTypes.func,
  handleOk: PropTypes.func,
  inputValue: PropTypes.any,
  envType: PropTypes.string,
  id: PropTypes.number
};
