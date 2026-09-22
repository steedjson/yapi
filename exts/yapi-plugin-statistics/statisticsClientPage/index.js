/**
 * Created by gxl.gao on 2017/10/25.
 */
// @ts-check
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import PropTypes from 'prop-types';
import './index.scss';
// import { withRouter } from 'react-router-dom';
import { Row, Col, Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
// user 切片已迁至 Zustand（批次4）：store 引用走相对路径（exts 下无 'client/*' 别名映射）
import useUserStore from '../../../client/store/userStore';
import StatisChart from './StatisChart';
import StatisTable from './StatisTable';

/**
 * 数据统计概览行组件。
 * @param {any} props
 */
const CountOverview = props => (
  <Row type="flex" justify="space-start" className="m-row">
    <Col className="gutter-row" span={6}>
      <span>
        分组总数
        <Tooltip placement="rightTop" title="统计yapi中一共开启了多少可见的公共分组">
          <QuestionCircleOutlined className="m-help" />
        </Tooltip>
      </span>
      <h2 className="gutter-box">{props.date.groupCount}</h2>
    </Col>
    <Col className="gutter-row" span={6}>
      <span>
        项目总数
        <Tooltip placement="rightTop" title="统计yapi中建立的所有项目总数">
          <QuestionCircleOutlined className="m-help" />
        </Tooltip>
      </span>
      <h2 className="gutter-box">{props.date.projectCount}</h2>
    </Col>
    <Col className="gutter-row" span={6}>
      <span>
        接口总数
        <Tooltip placement="rightTop" title="统计yapi所有项目中的所有接口总数">
          {/*<a href="javascript:void(0)" className="m-a-help">?</a>*/}
          <QuestionCircleOutlined className="m-help" />
        </Tooltip>
      </span>
      <h2 className="gutter-box">{props.date.interfaceCount}</h2>
    </Col>
    <Col className="gutter-row" span={6}>
      <span>
        测试接口总数
        <Tooltip placement="rightTop" title="统计yapi所有项目中的所有测试接口总数">
          {/*<a href="javascript:void(0)" className="m-a-help">?</a>*/}
          <QuestionCircleOutlined className="m-help" />
        </Tooltip>
      </span>
      <h2 className="gutter-box">{props.date.interfaceCaseCount}</h2>
    </Col>
  </Row>
);

CountOverview.propTypes = {
  date: PropTypes.object
};

/**
 * 系统状况概览行组件。
 * @param {any} props
 */
const StatusOverview = props => (
  <Row type="flex" justify="space-start" className="m-row">
    <Col className="gutter-row" span={6}>
      <span>
        操作系统类型
        <Tooltip
          placement="rightTop"
          title="操作系统类型,返回值有'darwin', 'freebsd', 'linux', 'sunos' , 'win32'"
        >
          <QuestionCircleOutlined className="m-help" />
        </Tooltip>
      </span>
      <h2 className="gutter-box">{props.data.systemName}</h2>
    </Col>
    <Col className="gutter-row" span={6}>
      <span>
        cpu负载
        <Tooltip placement="rightTop" title="cpu的总负载情况">
          <QuestionCircleOutlined className="m-help" />
        </Tooltip>
      </span>
      <h2 className="gutter-box">{props.data.load} %</h2>
    </Col>
    <Col className="gutter-row" span={6}>
      <span>
        系统空闲内存总量 / 内存总量
        <Tooltip placement="rightTop" title="系统空闲内存总量 / 内存总量">
          <QuestionCircleOutlined className="m-help" />
        </Tooltip>
      </span>
      <h2 className="gutter-box">
        {props.data.freemem} G / {props.data.totalmem} G{' '}
      </h2>
    </Col>
    <Col className="gutter-row" span={6}>
      <span>
        邮箱状态
        <Tooltip placement="rightTop" title="检测配置文件中配置邮箱的状态">
          <QuestionCircleOutlined className="m-help" />
        </Tooltip>
      </span>
      <h2 className="gutter-box">{props.data.mail}</h2>
    </Col>
  </Row>
);

StatusOverview.propTypes = {
  data: PropTypes.object
};

/**
 * 系统信息统计页。原类组件经 Hooks 现代化迁移，渲染结构与行为保持一致：
 * - 旧 @connect(null, { setBreadcrumb }) 改为 useUserStore 动作直调（批次4）；
 * - 旧 constructor state 改为 useState（单对象 patch，保持浅合并语义），
 *   旧 UNSAFE_componentWillMount 改为挂载期 useEffect；
 * - 数据拉取时序与 setState 语义不变。
 */
const statisticsPage = () => {
  const setBreadcrumb = useUserStore(state => state.setBreadcrumb);

  const [state, setState] = useState({
    count: {
      groupCount: 0,
      projectCount: 0,
      interfaceCount: 0,
      interfaceCaseCount: 0
    },
    status: {
      mail: '',
      systemName: '',
      totalmem: '',
      freemem: '',
      uptime: ''
    },
    dataTotal: []
  });
  /**
   * @param {any} patch
   */
  const patchState = patch => setState((/** @type {any} */ prevState) => ({ ...prevState, ...patch }));

  // 对应旧 UNSAFE_componentWillMount
  useEffect(() => {
    setBreadcrumb([{ name: '系统信息' }]);
    getStatisData();
    getSystemStatusData();
    getGroupData();
  }, []);

  // 获取统计数据
  async function getStatisData() {
    let result = await axios.get('/api/plugin/statismock/count');
    if (result.data.errcode === 0) {
      let statisData = result.data.data;
      patchState({
        count: { ...statisData }
      });
    }
  }

  // 获取系统信息

  async function getSystemStatusData() {
    let result = await axios.get('/api/plugin/statismock/get_system_status');
    if (result.data.errcode === 0) {
      let statusData = result.data.data;
      patchState({
        status: { ...statusData }
      });
    }
  }

  // 获取分组详细信息

  async function getGroupData() {
    let result = await axios.get('/api/plugin/statismock/group_data_statis');
    if (result.data.errcode === 0) {
      let statusData = result.data.data;
      statusData.map((/** @type {any} */ item) => {
        return (item['key'] = item.name);
      });
      patchState({
        dataTotal: statusData
      });
    }
  }

  const { count, status, dataTotal } = state;

  return (
    <div className="g-statistic">
      <div className="content">
        <h2 className="title">系统状况</h2>
        <div className="system-content">
          <StatusOverview data={status} />
        </div>
        <h2 className="title">数据统计</h2>
        <div>
          <CountOverview date={count} />
          <StatisTable dataSource={dataTotal} />
          <StatisChart />
        </div>
      </div>
    </div>
  );
};

export default statisticsPage;
