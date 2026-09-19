// @ts-check
import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Row, Input } from 'antd';
import constants from '../../constants/variable.js';

const Search = Input.Search;

/**
 * @param {any} props
 */
export default function MockList(props) {
  const { click, clickValue } = props;
  const [filter, setFilter] = useState('');
  const [list, setList] = useState(constants.MOCK_SOURCE);

  /**
   * @param {any} e
   */
  const onFilter = e => {
    const value = e.target.value;
    const filteredList = constants.MOCK_SOURCE.filter(item => {
      return item.mock.indexOf(value) !== -1;
    });
    setFilter(value);
    setList(filteredList);
  };

  return (
    <div className="modal-postman-form-mock">
      <Search onChange={onFilter} value={filter} placeholder="搜索mock数据" className="mock-search" />
      {list.map((item, index) => {
        return (
          <Row
            key={index}
            type="flex"
            align="middle"
            className={'row ' + (item.mock === clickValue ? 'checked' : '')}
            onClick={() => click(item.mock)}
          >
            <span>{item.mock}</span>
          </Row>
        );
      })}
    </div>
  );
}

MockList.propTypes = {
  click: PropTypes.func,
  clickValue: PropTypes.string
};
