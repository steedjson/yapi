// @ts-check
import React, { useEffect, useState } from 'react';
import { Input, Tooltip } from 'antd';
import { EditOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import PropTypes from 'prop-types';
import './Label.scss';

/**
 * @param {any} props
 */
export default function Label(props) {
  const [inputShow, setInputShow] = useState(false);
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    setInputShow(false);
  }, [props.desc]);

  function toggle() {
    setInputShow(!inputShow);
  }

  /**
   * @param {any} event
   */
  function handleChange(event) {
    setInputValue(event.target.value);
  }

  return (
    <div>
      {props.desc && (
        <div className="component-label">
          {!inputShow ? (
            <div>
              <p>
                {props.desc} &nbsp;&nbsp;
                <Tooltip title="编辑简介">
                  <EditOutlined onClick={toggle} className="interface-delete-icon" />
                </Tooltip>
              </p>
            </div>
          ) : (
            <div className="label-input-wrapper">
              <Input onChange={handleChange} defaultValue={props.desc} size="small" />
              <CheckOutlined
                className="interface-delete-icon"
                onClick={() => {
                  props.onChange(inputValue);
                  toggle();
                }}
              />
              <CloseOutlined className="interface-delete-icon" onClick={toggle} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

Label.propTypes = {
  onChange: PropTypes.func,
  desc: PropTypes.string,
  cat_name: PropTypes.string
};
