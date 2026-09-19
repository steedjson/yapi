// @ts-check
import React from 'react';
import PropTypes from 'prop-types';
import { Button } from 'antd';
import { useDispatch } from 'react-redux';
import { changeStudyTip, finishStudy } from '../../reducer/modules/user.js';

// 点击下一步
/**
 * @param {any} dispatch
 * @param {boolean} isLast
 */
function nextStep(dispatch, isLast) {
  dispatch(changeStudyTip());
  if (isLast) {
    dispatch(finishStudy());
  }
}

// 点击退出指引
/**
 * @param {any} dispatch
 */
function exitGuide(dispatch) {
  dispatch(finishStudy());
}

/**
 * @param {any} props
 */
function GuideBtns(props) {
  const dispatch = useDispatch();
  const { isLast } = props;
  return (
    <div className="btn-container">
      <Button className="btn" type="primary" onClick={() => nextStep(dispatch, isLast)}>
        {isLast ? '完 成' : '下一步'}
      </Button>
      <Button className="btn" type="dashed" onClick={() => exitGuide(dispatch)}>
        退出指引
      </Button>
    </div>
  );
}

GuideBtns.propTypes = {
  isLast: PropTypes.bool
};

export default GuideBtns;
