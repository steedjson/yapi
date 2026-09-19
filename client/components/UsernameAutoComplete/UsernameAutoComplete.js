// @ts-check
import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Select } from 'antd';
import axios from 'axios';

const Option = Select.Option;

/**
 * 用户名输入框自动完成组件
 *
 * @component UsernameAutoComplete
 * @examplelanguage js
 *
 * * 用户名输入框自动完成组件
 * * 用户名输入框自动完成组件
 *
 *s
 */

/**
 * 获取自动输入的用户信息
 *
 * 获取子组件state
 * @property callbackState
 * @type function
 * @description 类型提示：支持数组传值；也支持用函数格式化字符串：函数有两个参数(scale, index)；
 * 受控属性：滑块滑到某一刻度时所展示的刻度文本信息。如果不需要标签，请将该属性设置为 [] 空列表来覆盖默认转换函数。
 * @returns {object} {uid: xxx, username: xxx}
 * @examplelanguage js
 * @example
 * onUserSelect(childState) {
 *   this.setState({
 *     uid: childState.uid,
 *     username: childState.username
 *   })
 * }
 *
 */

/**
 * @param {any} props
 */
export default function UsernameAutoComplete(props) {
  const [dataSource, setDataSource] = useState(/** @type {any[]} */ ([]));
  const [fetching, setFetching] = useState(false);

  // 搜索回调
  /**
   * @param {string} value
   */
  const handleSearch = value => {
    const params = { q: value };
    setFetching(true);
    axios.get('/api/user/search', { params }).then((/** @type {any} */ data) => {
      /** @type {any[]} */
      const userList = [];
      data = data.data.data;

      if (data) {
        data.forEach((/** @type {any} */ v) =>
          userList.push({
            username: v.username,
            id: v.uid
          })
        );
        // 取回搜索值后，设置 dataSource
        setDataSource(userList);
      }
    });
  };

  // 选中候选词时
  /**
   * @param {any} value
   */
  const handleChange = value => {
    setDataSource([]);
    setFetching(false);
    props.callbackState(value);
  };

  const children = dataSource.map((item, index) => (
    <Option key={index} value={'' + item.id}>
      {item.username}
    </Option>
  ));

  return (
    <Select
      mode="multiple"
      style={{ width: '100%' }}
      placeholder="请输入用户名"
      filterOption={false}
      optionLabelProp="children"
      notFoundContent={fetching ? <span style={{ color: 'red' }}> 当前用户不存在</span> : null}
      onSearch={handleSearch}
      onChange={handleChange}
    >
      {children}
    </Select>
  );
}

UsernameAutoComplete.propTypes = {
  callbackState: PropTypes.func
};
