// @ts-check
import React, { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Tree } from 'antd';
import { useSelector, useDispatch } from 'react-redux';
import { fetchVariableParamsList } from '../../reducer/modules/interfaceCol.js';

const CanSelectPathPrefix = 'CanSelectPath-';

/**
 * @param {string} str
 */
function deleteLastObject(str) {
  return str
    .split('.')
    .slice(0, -1)
    .join('.');
}

/**
 * @param {string} str
 */
function deleteLastArr(str) {
  return str.replace(/\[.*?\]/g, '');
}

/**
 * @param {any} props
 */
export default function VariablesSelect(props) {
  const { click, clickValue, id } = props;
  const currColId = useSelector((/** @type {any} */ state) => state.interfaceCol.currColId);
  const dispatch = useDispatch();
  const [records, setRecords] = useState(/** @type {any[]} */ ([]));
  const [expandedKeys, setExpandedKeys] = useState(/** @type {any[]} */ ([]));
  const [selectedKeys, setSelectedKeys] = useState(/** @type {any[]} */ ([]));
  // 全量用例记录与已切换到的用例 id,对应原实例属性 this.records / this.id
  const allRecordsRef = useRef([]);
  const currentIdRef = useRef(null);

  const handleRecordsData = useCallback((/** @type {any} */ targetId) => {
    currentIdRef.current = targetId;
    const allRecords = allRecordsRef.current;
    const newRecords = [];
    for (let i = 0; i < allRecords.length; i++) {
      if (allRecords[i]._id === targetId) {
        break;
      }
      newRecords.push(allRecords[i]);
    }
    setRecords(newRecords);
  }, []);

  // 首次挂载拉取当前集合的用例变量数据(对应原 componentDidMount)
  useEffect(() => {
    let isMounted = true;
    (async () => {
      const result = await dispatch(fetchVariableParamsList(currColId));
      if (!isMounted) {
        return;
      }
      const fetchedRecords = result.payload.data.data;
      allRecordsRef.current = fetchedRecords.sort((/** @type {any} */ a, /** @type {any} */ b) => {
        return a.index - b.index;
      });
      handleRecordsData(id);

      if (clickValue) {
        const isArrayParams = clickValue.lastIndexOf(']') === clickValue.length - 1;
        const key = isArrayParams ? deleteLastArr(clickValue) : deleteLastObject(clickValue);
        setExpandedKeys([key]);
        setSelectedKeys([CanSelectPathPrefix + clickValue]);
        // this.props.click(clickValue);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  // 当前用例 id 变化时,仅保留位于该用例之前的用例数据(对应原 UNSAFE_componentWillReceiveProps)
  useEffect(() => {
    if (allRecordsRef.current.length > 0 && id && currentIdRef.current !== id) {
      handleRecordsData(id);
    }
  }, [id, records, handleRecordsData]);

  /**
   * @param {string} key
   */
  const handleSelect = key => {
    setSelectedKeys([key]);
    if (key && key.indexOf(CanSelectPathPrefix) === 0) {
      key = key.substr(CanSelectPathPrefix.length);
      click(key);
    } else {
      setExpandedKeys([key]);
    }
  };

  /**
   * @param {any} keys
   */
  const onExpand = keys => {
    setExpandedKeys(keys);
  };

  // antd5 Tree 移除 TreeNode JSX,改用 treeData 配置({ key, title, disabled, children })
  /**
   * @param {any} data
   * @param {string} [elementKeyPrefix]
   * @param {number} [deepLevel]
   * @returns {any}
   */
  const pathSelctByTree = (data, elementKeyPrefix = '$', deepLevel = 0) => {
    const keys = Object.keys(data);
    const treeNodes = keys.map((key, index) => {
      let item = data[key],
        casename;
      if (deepLevel === 0) {
        elementKeyPrefix = '$';
        elementKeyPrefix = elementKeyPrefix + '.' + item._id;
        casename = item.casename;
        item = {
          params: item.params,
          body: item.body
        };
      } else if (Array.isArray(data)) {
        elementKeyPrefix =
          index === 0
            ? elementKeyPrefix + '[' + key + ']'
            : deleteLastArr(elementKeyPrefix) + '[' + key + ']';
      } else {
        elementKeyPrefix =
          index === 0
            ? elementKeyPrefix + '.' + key
            : deleteLastObject(elementKeyPrefix) + '.' + key;
      }
      if (item && typeof item === 'object') {
        const isDisable = Array.isArray(item) && item.length === 0;
        return {
          key: elementKeyPrefix,
          disabled: isDisable,
          title: casename || key,
          children: pathSelctByTree(item, elementKeyPrefix, deepLevel + 1)
        };
      }
      return { key: CanSelectPathPrefix + elementKeyPrefix, title: key };
    });

    return treeNodes;
  };

  return (
    <div className="modal-postman-form-variable">
      <Tree
        expandedKeys={expandedKeys}
        selectedKeys={selectedKeys}
        onSelect={(/** @type {any} */ [key]) => handleSelect(key)}
        onExpand={onExpand}
        treeData={pathSelctByTree(records)}
      />
    </div>
  );
}

VariablesSelect.propTypes = {
  click: PropTypes.func,
  clickValue: PropTypes.string,
  id: PropTypes.number
};
