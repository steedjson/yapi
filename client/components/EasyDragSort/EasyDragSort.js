// @ts-check
import React from 'react';

import PropTypes from 'prop-types';

/**
 * @author suxiaoxin
 * @demo
 * <EasyDragSort data={()=>this.state.list} onChange={this.handleChange} >
 * {list}
 * </EasyDragSot>
 */
/** @type {number | null} */
let curDragIndex = null;

/**
 * @param {any} obj
 */
function isDom(obj) {
  return (
    obj &&
    typeof obj === 'object' &&
    obj.nodeType === 1 &&
    typeof obj.nodeName === 'string' &&
    typeof obj.getAttribute === 'function'
  );
}

/**
 * @param {any} props
 */
export default function EasyDragSort(props) {
  const { onlyChild } = props;
  const container = props.children;
  /**
   * @param {any} from
   * @param {any} to
   */
  const onChange = (from, to) => {
    if (from === to) {
      return;
    }
    let curValue;

    curValue = props.data();

    let newValue = arrMove(curValue, from, to);
    if (typeof props.onChange === 'function') {
      return props.onChange(newValue, from, to);
    }
  };
  return (
    <div>
      {container.map((/** @type {any} */ item, /** @type {number} */ index) => {
        if (React.isValidElement(item)) {
          return React.cloneElement(item, {
            draggable: onlyChild ? false : true,
            'data-ref': 'x' + index,
            onDragStart: function() {
              curDragIndex = index;
            },
            /**
             * 控制 dom 是否可拖动
             * @param {*} e
             */
            onMouseDown(e) {
              if (!onlyChild) {
                return;
              }
              let el = e.target,
                target = e.target;
              if (!isDom(el)) {
                return;
              }
              do {
                if (el && isDom(el) && el.getAttribute(onlyChild)) {
                  target = el;
                }
                if (el && el.tagName == 'DIV' && el.getAttribute('data-ref')) {
                  break;
                }
              } while ((el = el.parentNode));
              if (!el) {
                return;
              }
              // el 即带 data-ref 的目标 DIV 本身，直接控制其 draggable，
              // 不再经由字符串 ref + ReactDOM.findDOMNode 间接取节点
              el.draggable = target.getAttribute(onlyChild) ? true : false;
            },
            onDragEnter: function() {
              onChange(curDragIndex, index);
              curDragIndex = index;
            },
            onDragEnd: function() {
              curDragIndex = null;
              if (typeof props.onDragEnd === 'function') {
                props.onDragEnd();
              }
            }
          });
        }
        return item;
      })}
    </div>
  );
}

EasyDragSort.propTypes = {
  children: PropTypes.array,
  onChange: PropTypes.func,
  onDragEnd: PropTypes.func,
  data: PropTypes.func,
  onlyChild: PropTypes.string
};

/**
 * @param {any} arr
 * @param {number} fromIndex
 * @param {number} toIndex
 */
function arrMove(arr, fromIndex, toIndex) {
  arr = [].concat(arr);
  let item = arr.splice(fromIndex, 1)[0];
  arr.splice(toIndex, 0, item);
  return arr;
}
