// @ts-check
/**
 * InterfaceColContent 子组件：用例列表表格区（自 InterfaceColContent.js 原位抽离的 JSX 子树）。
 *
 * 职责（单一）：把父组件持有的 rows / 测试报告映射 / 当前项目 id 以受控 props 渲染为
 * dnd-kit 可拖拽的 antd Table，并把「打开报告」「拖拽经过」「拖拽结束」三类事件按
 * 原有签名回调上抛。
 *
 * 边界与等价性：
 *   - 本组件只做受控展示 + 事件上抛，不持有任何状态；rows 重排由父组件的
 *     onDragOver 完成（父组件 setRows 后本组件以新 props 重渲染）；
 *   - 原 InterfaceColContent.js 模块级 SortableRow / dndSensors / columns 定义随
 *     本组件的 JSX 边界一并迁移，DndContext + SortableContext(verticalListSortingStrategy)
 *     + Table components.body.row 的接线保持原样（P5 修复的 onDragEnd → POST 链路由
 *     父组件 handler 保持，未在此处改动）；
 *   - columns 每次渲染重建（不做 memo），render 回调在渲染期读取 reportMap，等价原
 *     实现渲染期读取 reportsRef.current；
 *   - 不引入任何包装 DOM 元素：根节点即原 DndContext（不产出 DOM）。
 */
import React from 'react';
import PropTypes from 'prop-types';
import { Tooltip, Button, Spin, Table } from 'antd';
import {
  CheckCircleFilled,
  InfoCircleFilled,
  ExclamationCircleFilled
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { DndContext, PointerSensor } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// @dnd-kit/sortable 的 SortableContext 类型要求必填 children 且依赖 @types/react 的
// JSX children 映射；本项目的最小 JSX 声明未启用该映射，经 any 中转绕开误报。
/** @type {any} */
const SortableContextAny = SortableContext;

// 拖拽传感器：5px 激活距离，保证行内链接/按钮的单击不受拖拽影响。
const dndSensors = [
  {
    sensor: PointerSensor,
    options: { activationConstraint: { distance: 5 } }
  }
];

// 可排序行组件：整行拖拽（等价原 dnd.Row 的整行拖拽交互）。
/**
 * @param {any} props
 */
const SortableRow = props => {
  const { children, ...restProps } = props;
  const rowId = restProps['data-row-key'];
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: rowId
  });
  const style = {
    ...restProps.style,
    transform: CSS.Transform.toString(transform && { ...transform, scaleY: 1 }),
    transition,
    ...(isDragging ? { position: 'relative', zIndex: 999 } : {})
  };
  return (
    <tr {...restProps} {...attributes} {...listeners} ref={setNodeRef} style={style}>
      {children}
    </tr>
  );
};

/**
 * @param {any} props
 */
const CaseTable = props => {
  const { rows, reportMap, currProjectId, onOpenReport, onDragOver, onDragEnd } = props;
  /** @type {any[]} */
  const columns = [
    {
      title: '用例名称',
      dataIndex: 'casename',
      width: 250,
      render: (/** @type {any} */ text, /** @type {any} */ record) => {
        return (
          <Link to={'/project/' + currProjectId + '/interface/case/' + record._id}>
            {record.casename.length > 23 ? record.casename.substr(0, 20) + '...' : record.casename}
          </Link>
        );
      }
    },
    {
      title: (
        <Tooltip
          title={
            <span>
              {' '}
              每个用例都有唯一的key，用于获取所匹配接口的响应数据，例如使用{' '}
              <a
                href="https://hellosean1025.github.io/yapi/documents/case.html#%E7%AC%AC%E4%BA%8C%E6%AD%A5%EF%BC%8C%E7%BC%96%E8%BE%91%E6%B5%8B%E8%AF%95%E7%94%A8%E4%BE%8B"
                className="link-tooltip"
                target="blank"
              >
                {' '}
                变量参数{' '}
              </a>{' '}
              功能{' '}
            </span>
          }
        >
          Key
        </Tooltip>
      ),
      dataIndex: '_id',
      width: 100
    },
    {
      title: '状态',
      dataIndex: 'test_status',
      width: 100,
      render: (/** @type {any} */ value, /** @type {any} */ record) => {
        const rowId = record._id;
        const code = reportMap[rowId] ? reportMap[rowId].code : 0;
        if (record.test_status === 'loading') {
          return (
            <div>
              <Spin />
            </div>
          );
        }

        switch (code) {
          case 0:
            return (
              <div>
                <Tooltip title="Pass">
                  <CheckCircleFilled
                    style={{
                      color: '#00a854'
                    }}
                  />
                </Tooltip>
              </div>
            );
          case 400:
            return (
              <div>
                <Tooltip title="请求异常">
                  <InfoCircleFilled
                    style={{
                      color: '#f04134'
                    }}
                  />
                </Tooltip>
              </div>
            );
          case 1:
            return (
              <div>
                <Tooltip title="验证失败">
                  <ExclamationCircleFilled
                    style={{
                      color: '#ffbf00'
                    }}
                  />
                </Tooltip>
              </div>
            );
          default:
            return (
              <div>
                <CheckCircleFilled
                  style={{
                    color: '#00a854'
                  }}
                />
              </div>
            );
        }
      }
    },
    {
      title: '接口路径',
      dataIndex: 'path',
      render: (/** @type {any} */ text, /** @type {any} */ record) => {
        return (
          <Tooltip title="跳转到对应接口">
            <Link to={`/project/${record.project_id}/interface/api/${record.interface_id}`}>
              {record.path && record.path.length > 23 ? record.path.substr(0, 20) + '...' : record.path}
            </Link>
          </Tooltip>
        );
      }
    },
    {
      title: '测试报告',
      dataIndex: 'id',
      width: 200,
      render: (/** @type {any} */ text, /** @type {any} */ record) => {
        const reportFun = () => {
          if (!reportMap[record.id]) {
            return null;
          }
          return <Button onClick={() => onOpenReport(record.id)}>测试报告</Button>;
        };
        return <div className="interface-col-table-action">{reportFun()}</div>;
      }
    }
  ];

  return (
    <DndContext
      sensors={dndSensors}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      <SortableContextAny items={rows.map((/** @type {any} */ item) => item.id)} strategy={verticalListSortingStrategy}>
        <Table
          className="interface-col-table"
          columns={columns}
          dataSource={rows}
          rowKey="id"
          pagination={false}
          components={{ body: { row: SortableRow } }}
        />
      </SortableContextAny>
    </DndContext>
  );
};

CaseTable.propTypes = {
  rows: PropTypes.array,
  /** 用例 id → 测试报告对象（父组件 reportsRef.current） */
  reportMap: PropTypes.object,
  currProjectId: PropTypes.any,
  onOpenReport: PropTypes.func,
  onDragOver: PropTypes.func,
  onDragEnd: PropTypes.func
};

export default CaseTable;