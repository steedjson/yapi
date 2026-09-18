import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Row, Input, Select, Tooltip } from 'antd';
import { DownOutlined } from '@ant-design/icons';
const Option = Select.Option;

// 深拷贝
function deepEqual(state) {
  return JSON.parse(JSON.stringify(state));
}

const METHODS_LIST = [
  { name: 'md5', type: false, params: [], desc: 'md5加密' },
  { name: 'lower', type: false, params: [], desc: '所有字母变成小写' },
  { name: 'length', type: false, params: [], desc: '数据长度' },
  { name: 'substr', type: true, component: 'doubleInput', params: [], desc: '截取部分字符串' },
  { name: 'sha', type: true, component: 'select', params: ['sha1'], desc: 'sha加密' },
  { name: 'base64', type: false, params: [], desc: 'base64加密' },
  { name: 'unbase64', type: false, params: [], desc: 'base64解密' },
  { name: 'concat', type: true, component: 'input', params: [], desc: '连接字符串' },
  { name: 'lconcat', type: true, component: 'input', params: [], desc: '左连接' },
  { name: 'upper', type: false, desc: '所有字母变成大写' },
  { name: 'number', type: false, desc: '字符串转换为数字类型' }
];

export default function MethodsList(props) {
  const { click, clickValue, clickIndex, params, paramsInput } = props;
  const [list, setList] = useState(METHODS_LIST);
  const [moreFlag, setMoreFlag] = useState(true);

  useEffect(() => {
    const index = METHODS_LIST.findIndex(item => item.name === clickValue);
    setMoreFlag(index > 3 ? false : true);
  }, [clickValue]);

  const showMore = () => {
    setMoreFlag(false);
  };

  const inputComponent = query => {
    const { params: inputParams } = query;
    return (
      <Input
        size="small"
        placeholder="请输入参数"
        value={inputParams[0]}
        onChange={e => handleParamsChange(e.target.value, query.clickIndex, query.paramsIndex, 0)}
      />
    );
  };

  const doubleInputComponent = query => {
    const { params: inputParams } = query;
    return (
      <div>
        <Input
          size="small"
          placeholder="start"
          value={inputParams[0]}
          onChange={e => handleParamsChange(e.target.value, query.clickIndex, query.paramsIndex, 0)}
        />
        <Input
          size="small"
          placeholder="length"
          value={inputParams[1]}
          onChange={e => handleParamsChange(e.target.value, query.clickIndex, query.paramsIndex, 1)}
        />
      </div>
    );
  };

  const selectComponent = query => {
    const subname = ['sha1', 'sha224', 'sha256', 'sha384', 'sha512'];
    const { params: selectParams } = query;
    return (
      <Select
        value={selectParams[0] || 'sha1'}
        placeholder="请选择"
        style={{ width: 150 }}
        size="small"
        onChange={e => handleParamsChange(e, query.clickIndex, query.paramsIndex, 0)}
      >
        {subname.map((item, index) => {
          return (
            <Option value={item} key={index}>
              {item}
            </Option>
          );
        })}
      </Select>
    );
  };

  // 处理参数输入
  function handleParamsChange(value, changeClickIndex, paramsIndex, index) {
    const newList = deepEqual(list);
    newList[paramsIndex].params[index] = value;
    setList(newList);
    paramsInput(value, changeClickIndex, index);
  }

  // 组件选择
  function handleComponent(item, componentClickIndex, index, componentParams) {
    const query = {
      clickIndex: componentClickIndex,
      paramsIndex: index,
      params: componentParams
    };
    switch (item.component) {
      case 'select':
        return selectComponent(query);
      case 'input':
        return inputComponent(query);
      case 'doubleInput':
        return doubleInputComponent(query);
      default:
        break;
    }
  }

  const showList = moreFlag ? list.slice(0, 4) : list;

  return (
    <div className="modal-postman-form-method">
      <h3 className="methods-title title">方法</h3>
      {showList.map((item, index) => {
        return (
          <Row
            key={index}
            type="flex"
            align="middle"
            className={'row methods-row ' + (item.name === clickValue ? 'checked' : '')}
            onClick={() => click(item.name, showList[index].params)}
          >
            <Tooltip title={item.desc}>
              <span>{item.name}</span>
            </Tooltip>
            <span className="input-component">
              {item.type && handleComponent(item, clickIndex, index, item.name === clickValue ? params : [])}
            </span>
          </Row>
        );
      })}
      {moreFlag && (
        <div className="show-more" onClick={showMore}>
          <DownOutlined />
          <span style={{ paddingLeft: '4px' }}>更多</span>
        </div>
      )}
    </div>
  );
}

MethodsList.propTypes = {
  show: PropTypes.bool,
  click: PropTypes.func,
  clickValue: PropTypes.string,
  paramsInput: PropTypes.func,
  clickIndex: PropTypes.number,
  params: PropTypes.array
};
