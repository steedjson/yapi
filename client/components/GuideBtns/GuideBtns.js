// @ts-check
import React from 'react';
import PropTypes from 'prop-types';
import { Button } from 'antd';
// user 切片已迁至 Zustand（批次4），本组件的 redux 依赖随迁移全部移除
import useUserStore from '../../store/userStore';

// 点击下一步
/**
 * @param {Function} changeStudyTip
 * @param {Function} finishStudy
 * @param {boolean} isLast
 */
function nextStep(changeStudyTip, finishStudy, isLast) {
  changeStudyTip();
  if (isLast) {
    finishStudy();
  }
}

// 点击退出指引
/**
 * @param {Function} finishStudy
 */
function exitGuide(finishStudy) {
  finishStudy();
}

/**
 * @param {any} props
 */
function GuideBtns(props) {
  const changeStudyTip = useUserStore(state => state.changeStudyTip);
  const finishStudy = useUserStore(state => state.finishStudy);
  const { isLast } = props;
  return (
    <div className="btn-container">
      <Button
        className="btn"
        type="primary"
        onClick={() => nextStep(changeStudyTip, finishStudy, isLast)}
      >
        {isLast ? '完 成' : '下一步'}
      </Button>
      <Button className="btn" type="dashed" onClick={() => exitGuide(finishStudy)}>
        退出指引
      </Button>
    </div>
  );
}

GuideBtns.propTypes = {
  isLast: PropTypes.bool
};

export default GuideBtns;
