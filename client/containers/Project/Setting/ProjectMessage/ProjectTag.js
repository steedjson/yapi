import React, { useEffect, useImperativeHandle, useState } from 'react';
import PropTypes from 'prop-types';
import { Row, Col, Input } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import './ProjectTag.scss';

/**
 * 项目标签编辑器。原类组件经 Hooks 现代化迁移，渲染结构与行为保持一致：
 * - 旧 componentDidMount + handleInit 改为挂载期 useEffect（仅初始化一次；
 *   旧类实现同样不响应 tagMsg 后续变化，行为保持一致）；
 * - 旧父组件（Edit.js / ProjectMessage.js）经回调 ref 读取实例 this.state.tag，
 *   改为 forwardRef + useImperativeHandle 等价暴露 { state: { tag } }，
 *   且随每次提交渲染同步最新 state（等价于旧实例的实时 state 读取）；
 * - handleChange 与旧实现等价：就地修改嵌套元素后浅拷贝出新 state 对象触发重渲染
 *   （旧类 setState 同样总是产生新 state 对象，无同引用 bail-out）；
 */
const ProjectTag = React.forwardRef((props, ref) => {
  const { tagMsg } = props;
  const [state, setState] = useState({ tag: [{ name: '', desc: '' }] });

  useEffect(() => {
    // 旧 initState(curdata)：空模板置底，已有 tag 逐条 unshift（结果顺序与旧实现一致）
    let tag = [
      {
        name: '',
        desc: ''
      }
    ];
    if (tagMsg && tagMsg.length !== 0) {
      tagMsg.forEach(item => {
        tag.unshift(item);
      });
    }
    setState({ tag });
  }, []);

  // 等价暴露旧类实例的 state，供父组件提交时读取 tagRef.current.state.tag
  useImperativeHandle(ref, () => ({ state }));

  const addHeader = (val, index, name, label) => {
    let newValue = {};
    newValue[name] = [].concat(state[name]);
    newValue[name][index][label] = val;
    let nextData = state[name][index + 1];
    if (!(nextData && typeof nextData === 'object')) {
      let data = { name: '', desc: '' };
      newValue[name] = [].concat(state[name], data);
    }
    setState(newValue);
  };

  const delHeader = (key, name) => {
    let curValue = state[name];
    let newValue = {};
    newValue[name] = curValue.filter((val, index) => {
      return index !== key;
    });
    setState(newValue);
  };

  const handleChange = (val, index, name, label) => {
    let newValue = state;
    newValue[name][index][label] = val;
    // 旧类 setState 总是浅合并出新的 state 对象（普通 Component 无 Object.is bail-out，
    // 必触发重渲染），故此处以浅拷贝新对象等价；嵌套数组与元素仍为同一引用，
    // 与旧实现的就地修改语义一致
    setState({ ...state });
  };

  const commonTpl = (item, index, name) => {
    const length = state[name].length - 1;
    return (
      <Row key={index} className="tag-item">
        <Col span={6} className="item-name">
          <Input
            placeholder={`请输入 ${name} 名称`}
            // style={{ width: '200px' }}
            value={item.name || ''}
            onChange={e => addHeader(e.target.value, index, name, 'name')}
          />
        </Col>
        <Col span={12}>
          <Input
            placeholder="请输入tag 描述信息"
            style={{ width: '90%', marginRight: 8 }}
            onChange={e => handleChange(e.target.value, index, name, 'desc')}
            value={item.desc || ''}
          />
        </Col>
        <Col span={2} className={index === length ? ' tag-last-row' : null}>
          {/* 新增的项中，只有最后一项没有有删除按钮 */}
          <DeleteOutlined
            className="dynamic-delete-button delete"
            onClick={e => {
              e.stopPropagation();
              delHeader(index, name);
            }}
          />
        </Col>
      </Row>
    );
  };

  return (
    <div className="project-tag">
      {state.tag.map((item, index) => {
        return commonTpl(item, index, 'tag');
      })}
    </div>
  );
});

ProjectTag.propTypes = {
  tagMsg: PropTypes.array,
  tagSubmit: PropTypes.func
};

export default ProjectTag;
