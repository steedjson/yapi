/**
 * Created by gxl.gao on 2017/10/25.
 */
// @ts-check
import React, { useEffect, useState } from 'react';
// import PropTypes from 'prop-types'
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { Spin } from 'antd';

/**
 * mock 请求次数图表。原类组件经 Hooks 现代化迁移，渲染结构与行为保持一致：
 * - 旧 constructor state 改为 useState，旧 UNSAFE_componentWillMount 改为挂载期 useEffect；
 * - 数据拉取时序与 setState 语义不变。
 */
const StatisChart = () => {
  const [state, setState] = useState({
    showLoading: true,
    chartDate: {
      mockCount: 0,
      mockDateList: []
    }
  });
  /**
   * @param {any} patch
   */
  const patchState = patch => setState((/** @type {any} */ prevState) => ({ ...prevState, ...patch }));

  // 对应旧 UNSAFE_componentWillMount
  useEffect(() => {
    getMockData();
  }, []);

  // 获取mock 请求次数信息
  async function getMockData() {
    let result = await axios.get('/api/plugin/statismock/get');
    if (result.data.errcode === 0) {
      let mockStatisData = result.data.data;
      patchState({
        showLoading: false,
        chartDate: { ...mockStatisData }
      });
    }
  }

  const width = 1050;
  const { mockCount, mockDateList } = state.chartDate;

  return (
    <div>
      <Spin spinning={state.showLoading}>
        <div className="statis-chart-content">
          <h3 className="statis-title">mock 接口访问总数为：{mockCount.toLocaleString()}</h3>
          <div className="statis-chart">
            <LineChart
              width={width}
              height={300}
              data={mockDateList}
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <XAxis dataKey="_id" />
              <YAxis />
              <CartesianGrid strokeDasharray="7 3" />
              <Tooltip />
              <Legend />
              <Line
                name="mock统计值"
                type="monotone"
                dataKey="count"
                stroke="#8884d8"
                activeDot={{ r: 8 }}
              />
            </LineChart>
          </div>
          <div className="statis-footer">过去3个月mock接口调用情况</div>
        </div>
      </Spin>
    </div>
  );
};

StatisChart.propTypes = {};

export default StatisChart;
