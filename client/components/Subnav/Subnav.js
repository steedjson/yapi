// @ts-check
import './Subnav.scss';
import React from 'react';
import { Link } from 'react-router-dom';
import PropTypes from 'prop-types';
import { Menu } from 'antd';

/**
 * @param {any} props
 */
function Subnav(props) {
  return (
    <div className="m-subnav">
      <Menu
        selectedKeys={[props.default]}
        mode="horizontal"
        className="g-row m-subnav-menu"
        items={props.data.map((/** @type {any} */ item, /** @type {number} */ index) => {
          // 若导航标题为两个字，则自动在中间加个空格
          if (item.name.length === 2) {
            item.name = item.name[0] + ' ' + item.name[1];
          }
          return {
            className: 'item',
            key: item.name.replace(' ', ''),
            label: <Link to={item.path}>{props.data[index].name}</Link>
          };
        })}
      />
    </div>
  );
}

Subnav.propTypes = {
  data: PropTypes.array,
  default: PropTypes.string
};

export default Subnav;
