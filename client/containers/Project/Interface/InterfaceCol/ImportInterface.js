// @ts-check
import React, { useEffect, useState } from 'react';
import { Table, Select, Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import variable from '../../../../constants/variable';
import PropTypes from 'prop-types';
const Option = Select.Option;
// project 切片已迁至 Zustand（批次4）；interface 切片已迁至 Zustand（批次5）
import useProjectStore from '../../../../store/projectStore';
import useInterfaceStore from '../../../../store/interfaceStore';

/** 导入列表按扁平顺序展示所有层级，但仍保留每个分类的直接接口。 */
function flattenCategories(/** @type {any} */ list) {
  const result = [];
  const stack = (list || [])
    .slice()
    .reverse()
    .map((/** @type {any} */ item) => ({ item, prefix: '' }));
  while (stack.length) {
    const current = stack.pop();
    const item = current.item;
    if (!item) continue;
    result.push({ item, label: current.prefix + item.name });
    const children = (item.children || []).slice().reverse();
    children.forEach((/** @type {any} */ child) =>
      stack.push({ item: child, prefix: current.prefix + '└ ' })
    );
  }
  return result;
}

/**
 * 接口导入选择面板。原类组件经 Hooks 现代化迁移，渲染结构与行为保持一致：
 * - 旧 @connect 改为 store 订阅（interface 切片批次5 迁 Zustand）；
 * - 旧 componentDidMount 拉取接口菜单改为挂载期 useEffect；
 * - 旧实例方法 flattenCategories 为纯函数，提升为模块级函数；
 * - 行选择回调同步读取渲染闭包中的 state（等价旧类组件实时 this.state）。
 */
const ImportInterface = (/** @type {any} */ props) => {
  const { selectInterface, currProjectId } = props;
  const list = useInterfaceStore(state => state.list);
  const fetchInterfaceListMenu = useInterfaceStore(state => state.fetchInterfaceListMenu);
  const projectList = useProjectStore(state => state.projectList);

  const [state, setState] = useState(/** @type {any} */ ({
    selectedRowKeys: [],
    categoryCount: {},
    project: currProjectId
  }));
  const patchState = (/** @type {any} */ patch) =>
    setState((/** @type {any} */ prevState) => ({ ...prevState, ...patch }));

  useEffect(() => {
    fetchInterfaceListMenu(currProjectId);
  }, []);

  // 切换项目
  const onChange = async (/** @type {any} */ val) => {
    patchState({
      project: val,
      selectedRowKeys: [],
      categoryCount: {}
    });
    await fetchInterfaceListMenu(val);
  };

  const data = flattenCategories(list).map((/** @type {any} */ category) => {
    const item = category.item;
    const interfaces = item.list || [];
    return {
      key: 'category_' + item._id,
      title: category.label,
      isCategory: true,
      children: interfaces.map((/** @type {any} */ e) =>
        Object.assign({}, e, {
          key: e._id,
          categoryKey: 'category_' + item._id,
          categoryLength: interfaces.length
        })
      )
    };
  });

  const rowSelection = {
    onSelect: (/** @type {any} */ record, /** @type {any} */ selected) => {
      const oldSelecteds = state.selectedRowKeys;
      const categoryCount = state.categoryCount;
      const categoryKey = record.categoryKey;
      const categoryLength = record.categoryLength;
      let selectedRowKeys = /** @type {any[]} */ ([]);
      if (record.isCategory) {
        selectedRowKeys = record.children
          .map((/** @type {any} */ item) => item._id)
          .concat(record.key);
        if (selected) {
          selectedRowKeys = selectedRowKeys
            .filter((/** @type {any} */ id) => oldSelecteds.indexOf(id) === -1)
            .concat(oldSelecteds);
          categoryCount[categoryKey] = categoryLength;
        } else {
          selectedRowKeys = oldSelecteds.filter(
            (/** @type {any} */ id) => selectedRowKeys.indexOf(id) === -1
          );
          categoryCount[categoryKey] = 0;
        }
      } else {
        if (selected) {
          selectedRowKeys = oldSelecteds.concat(record._id);
          if (categoryCount[categoryKey]) {
            categoryCount[categoryKey] += 1;
          } else {
            categoryCount[categoryKey] = 1;
          }
          if (categoryCount[categoryKey] === record.categoryLength) {
            selectedRowKeys.push(categoryKey);
          }
        } else {
          selectedRowKeys = oldSelecteds.filter((/** @type {any} */ id) => id !== record._id);
          if (categoryCount[categoryKey]) {
            categoryCount[categoryKey] -= 1;
          }
          selectedRowKeys = selectedRowKeys.filter((/** @type {any} */ id) => id !== categoryKey);
        }
      }
      patchState({ selectedRowKeys, categoryCount });
      selectInterface(
        selectedRowKeys.filter((/** @type {any} */ id) => ('' + id).indexOf('category') === -1),
        state.project
      );
    },
    onSelectAll: (/** @type {any} */ selected) => {
      let selectedRowKeys = /** @type {any[]} */ ([]);
      let categoryCount = state.categoryCount;
      if (selected) {
        data.forEach((/** @type {any} */ item) => {
          if (item.children) {
            categoryCount['category_' + item._id] = item.children.length;
            selectedRowKeys = selectedRowKeys.concat(
              item.children.map((/** @type {any} */ item) => item._id)
            );
          }
        });
        selectedRowKeys = selectedRowKeys.concat(data.map((/** @type {any} */ item) => item.key));
      } else {
        categoryCount = {};
        selectedRowKeys = [];
      }
      patchState({ selectedRowKeys, categoryCount });
      selectInterface(
        selectedRowKeys.filter(id => ('' + id).indexOf('category') === -1),
        state.project
      );
    },
    selectedRowKeys: state.selectedRowKeys
  };

  const columns = [
    {
      title: '接口名称',
      dataIndex: 'title',
      width: '30%'
    },
    {
      title: '接口路径',
      dataIndex: 'path',
      width: '40%'
    },
    {
      title: '请求方法',
      dataIndex: 'method',
      render: (/** @type {any} */ item) => {
        let methodColor =
          /** @type {any} */ (variable.METHOD_COLOR)[item ? item.toLowerCase() : 'get'];
        return (
          <span
            style={{
              color: methodColor.color,
              backgroundColor: methodColor.bac,
              borderRadius: 4
            }}
            className="colValue"
          >
            {item}
          </span>
        );
      }
    },
    {
      title: (
        <span>
          状态{' '}
          <Tooltip title="筛选满足条件的接口集合">
            <QuestionCircleOutlined />
          </Tooltip>
        </span>
      ),
      dataIndex: 'status',
      render: (/** @type {any} */ text) => {
        return (
          text &&
          (text === 'done' ? (
            <span className="tag-status done">已完成</span>
          ) : (
            <span className="tag-status undone">未完成</span>
          ))
        );
      },
      filters: [
        {
          text: '已完成',
          value: 'done'
        },
        {
          text: '未完成',
          value: 'undone'
        }
      ],
      onFilter: (/** @type {any} */ value, /** @type {any} */ record) => {
        let arr = record.children.filter((/** @type {any} */ item) => {
          return item.status.indexOf(value) === 0;
        });
        return arr.length > 0;
        // record.status.indexOf(value) === 0
      }
    }
  ];

  return (
    <div>
      <div className="select-project">
        <span>选择要导入的项目： </span>
        <Select value={state.project} style={{ width: 200 }} onChange={onChange}>
          {projectList.map((/** @type {any} */ item) => {
            return item.projectname ? (
              ''
            ) : (
              <Option value={`${item._id}`} key={item._id}>
                {item.name}
              </Option>
            );
          })}
        </Select>
      </div>
      <Table columns={columns} rowSelection={rowSelection} dataSource={data} pagination={false} />
    </div>
  );
};

ImportInterface.propTypes = {
  selectInterface: PropTypes.func,
  currProjectId: PropTypes.string
};

export default ImportInterface;
