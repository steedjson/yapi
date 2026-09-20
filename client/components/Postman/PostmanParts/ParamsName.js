// @ts-check
/**
 * Postman 子组件：参数名展示单元（自 Postman.js 原位抽离的无状态展示组件）。
 *
 * 职责（单一）：渲染单个参数的「名称 + 可选示例/备注 Tooltip」。名称输入框恒为
 * disabled（参数名来自接口定义，运行页不可编辑）；example 与 desc 均缺失时不渲染
 * Tooltip（等价抽取前的 isNull 分支）。
 *
 * 边界：无状态、无副作用、无包装 DOM（根节点即原 <div>）。
 */
import React from 'react';
import PropTypes from 'prop-types';
import { Input, Tooltip } from 'antd';

/**
 * @param {any} props
 */
const ParamsName = props => {
  const { example, desc, name } = props;
  const isNull = !example && !desc;
  const TooltipTitle = () => {
    return (
      <div>
        {example && (
          <div>
            示例： <span className="table-desc">{example}</span>
          </div>
        )}
        {desc && (
          <div>
            备注： <span className="table-desc">{desc}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {isNull ? (
        <Input disabled value={name} className="key" />
      ) : (
        <Tooltip placement="topLeft" title={<TooltipTitle />}>
          <Input disabled value={name} className="key" />
        </Tooltip>
      )}
    </div>
  );
};

ParamsName.propTypes = {
  example: PropTypes.string,
  desc: PropTypes.string,
  name: PropTypes.string
};

export default ParamsName;