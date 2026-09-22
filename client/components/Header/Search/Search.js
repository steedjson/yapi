// @ts-check
import React, { useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Input, AutoComplete } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import './Search.scss';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
// menu / group 切片均已迁至 Zustand（批次2 / 批次3），interface 模块仍未迁移
import useMenuStore from '../../../store/menuStore';
import useGroupStore from '../../../store/groupStore';

import { fetchInterfaceListMenu } from '../../../reducer/modules/interface';

export default function Srch() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const changeMenuItem = useMenuStore(state => state.changeMenuItem);
  const setCurrGroup = useGroupStore(state => state.setCurrGroup);
  const fetchGroupMsg = useGroupStore(state => state.fetchGroupMsg);
  useGroupStore(state => state.groupList);
  useSelector(state => state.project.projectList);
  const [dataSource, setDataSource] = useState(/** @type {any[]} */ ([]));
  // 选项附带的自定义数据索引(见 handleSearch),非响应式,用 ref 承载
  const searchIndexRef = useRef({});

  /**
   * @param {any} value
   * @param {any} option
   */
  async function onSelect(value, option) {
    // 选项附带的自定义数据存放在 searchIndex 中（见 handleSearch），
    // 不能作为 props 挂在 Option 上，否则会透传到 DOM 触发 React 警告
    const meta = searchIndexRef.current[option.key] || {};
    if (meta.type === '分组') {
      changeMenuItem('/group');
      navigate('/group/' + meta.id);
      setCurrGroup({ group_name: value, _id: meta.id - 0 });
    } else if (meta.type === '项目') {
      await fetchGroupMsg(meta.groupId);
      navigate('/project/' + meta.id);
    } else if (meta.type === '接口') {
      await dispatch(fetchInterfaceListMenu(meta.projectId));
      navigate('/project/' + meta.projectId + '/interface/api/' + meta.id);
    }
  }

  /**
   * @param {string} value
   */
  function handleSearch(value) {
    axios
      .get('/api/project/search?q=' + value)
      .then((/** @type {any} */ res) => {
        if (res.data && res.data.errcode === 0) {
          // antd5 的 AutoComplete 移除 dataSource,改用 options 配置
          // ({ key, value, label });key 仅作为 onSelect 的索引,不透传 DOM
          /** @type {any[]} */
          const options = [];
          /** @type {Record<string, any>} */
          const searchIndex = {};
          for (let title in res.data.data) {
            res.data.data[title].map((/** @type {any} */ item) => {
              switch (title) {
                case 'group': {
                  const key = `分组${item._id}`;
                  searchIndex[key] = { type: '分组', id: item._id };
                  options.push({ key, value: item.groupName, label: `分组: ${item.groupName}` });
                  break;
                }
                case 'project': {
                  const key = `项目${item._id}`;
                  searchIndex[key] = { type: '项目', id: item._id, groupId: item.groupId };
                  options.push({ key, value: item.name, label: `项目: ${item.name}` });
                  break;
                }
                case 'interface': {
                  const key = `接口${item._id}`;
                  searchIndex[key] = {
                    type: '接口',
                    id: item._id,
                    projectId: item.projectId
                  };
                  options.push({ key, value: item.title, label: `接口: ${item.title}` });
                  break;
                }
                default:
                  break;
              }
            });
          }
          searchIndexRef.current = searchIndex;
          setDataSource(options);
        } else {
          console.log('查询项目或分组失败');
        }
      })
      .catch((/** @type {any} */ err) => {
        console.log(err);
      });
  }

  return (
    <div className="search-wrapper">
      <AutoComplete
        className="search-dropdown"
        options={dataSource}
        style={{ width: '100%' }}
        defaultActiveFirstOption={false}
        onSelect={onSelect}
        onSearch={handleSearch}
      >
        <Input
          prefix={<SearchOutlined className="srch-icon" />}
          placeholder="搜索分组/项目/接口"
          className="search-input"
        />
      </AutoComplete>
    </div>
  );
}
