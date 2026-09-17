import React from 'react';
import PropTypes from 'prop-types';
import './Loading.scss';

// 可见性完全由 props 驱动，无需旧类组件时代的 state 同步副作用
export default function Loading({ visible = false }) {
  return (
    <div className="loading-box" style={{ display: visible ? 'flex' : 'none' }}>
      <div className="loading-box-bg" />
      <div className="loading-box-inner">
        <div />
        <div />
        <div />
        <div />
        <div />
        <div />
        <div />
        <div />
      </div>
    </div>
  );
}

Loading.propTypes = {
  visible: PropTypes.bool
};
