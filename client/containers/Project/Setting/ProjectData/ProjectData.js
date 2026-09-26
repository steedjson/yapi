// @ts-check
import React, { useEffect, useRef, useState } from 'react';
import {
  Upload,
  message,
  Select,
  TreeSelect,
  Tooltip,
  Button,
  Spin,
  Switch,
  Modal,
  Radio,
  Input,
  Checkbox
} from 'antd';
import { QuestionCircleOutlined, InboxOutlined, ExclamationCircleFilled } from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import './ProjectData.scss';
import axios from 'axios';

import URL from 'url';

const Dragger = Upload.Dragger;
import sanitizeHtml from '../../../../utils/sanitize.js';
// project/news 切片已迁至 Zustand（批次4 + 收尾批），fetchUpdateLogData 改经 useActivityStore 直调
import useProjectStore from '../../../../store/projectStore';
import useActivityStore from '../../../../store/activityStore';
import { formatCatTreeData, flattenCatList } from 'common/utils.js';
const Option = Select.Option;
const confirm = Modal.confirm;
const plugin = require('client/plugin.js');
const RadioGroup = Radio.Group;
const importDataModule = /** @type {any} */ ({});
const exportDataModule = /** @type {any} */ ({});
const HandleImportData = require('common/HandleImportData');
function handleExportRouteParams(
  /** @type {any} */ url,
  /** @type {any} */ status,
  /** @type {any} */ isWiki
) {
  if (!url) {
    return;
  }
  let urlObj = URL.parse(url, true),
    query = {};
  query = Object.assign(query, urlObj.query, { status, isWiki });
  return URL.format({
    pathname: urlObj.pathname,
    query
  });
}

// exportDataModule.pdf = {
//   name: 'Pdf',
//   route: '/api/interface/download_crx',
//   desc: '导出项目接口文档为 pdf 文件'
// }

/**
 * 数据管理（导入 / 导出）。原类组件经 Hooks 现代化迁移，渲染结构与行为保持一致：
 * - 旧 @connect（basePath / swaggerUrlData）改为 useSelector，未在组件体内使用的
 *   curCatid / updateLogList 订阅不再保留；
 * - 类 state 拆分为独立 useState（初始值与旧 constructor 一致）；
 * - 旧 UNSAFE_componentWillMount 的分类菜单加载与插件钩子注册改为挂载期 useEffect；
 * - 旧 this.match.params.id 改为 useParams；异步回调（reader.onload、confirm 弹窗
 *   回调等）中的旧 this.state 读取改为 stateRef.current 镜像（始终指向最新一次
 *   渲染的状态，与旧类组件 this.state 的实时语义一致）。
 */
const ProjectData = () => {
  const { id } = useParams();
  const basePath = useProjectStore((/** @type {any} */ state) => state.currProject.basepath);
  const swaggerUrlData = useProjectStore((/** @type {any} */ state) => state.swaggerUrlData);
  const handleSwaggerUrlData = useProjectStore((/** @type {any} */ state) => state.handleSwaggerUrlData);
  const fetchUpdateLogData = useActivityStore((/** @type {any} */ state) => state.fetchUpdateLogData);

  // 断言为 number|string：初始值保持旧 constructor 的 ''，而 setSelectCatid 写入的是
  // 分类 id（number），见 selectChange / applyCategoryMenu。
  const [selectCatid, setSelectCatid] = useState(/** @type {number|string} */ (''));
  const [menuList, setMenuList] = useState([]);
  const [curImportType, setCurImportType] = useState('swagger');
  const [curExportType, setCurExportType] = useState(null);
  const [showLoading, setShowLoading] = useState(false);
  const [dataSync, setDataSync] = useState('merge');
  const [exportContent, setExportContent] = useState('all');
  const [isSwaggerUrl, setIsSwaggerUrl] = useState(false);
  const [swaggerUrl, setSwaggerUrl] = useState('');
  const [isWiki, setIsWiki] = useState(false);

  // 镜像最新 redux 值：异步恢复后的读取等价于旧类组件的实时 this.props
  const basePathRef = useRef(basePath);
  basePathRef.current = basePath;
  const swaggerUrlDataRef = useRef(swaggerUrlData);
  swaggerUrlDataRef.current = swaggerUrlData;

  // 镜像最新本地 state：异步回调中的读取等价于旧类组件的实时 this.state
  const stateRef = useRef(/** @type {any} */ ({}));
  stateRef.current = {
    selectCatid,
    menuList,
    curImportType,
    curExportType,
    showLoading,
    dataSync,
    exportContent,
    isSwaggerUrl,
    swaggerUrl,
    isWiki
  };

  const loadCategoryMenu = async () => {
    const projectId = id;
    // 优先读取树形分类接口以完整展现多级层级；无权限或接口异常时回退到平铺接口。
    try {
      const data = await axios.get(`/api/interface/get_cat_tree?project_id=${projectId}`);
      if (data.data.errcode === 0) {
        applyCategoryMenu(data.data.data || []);
        return;
      }
    } catch (/** @type {any} */ err) {
      // 忽略错误，走平铺接口兜底
    }
    try {
      const data = await axios.get(`/api/interface/getCatMenu?project_id=${projectId}`);
      if (data.data.errcode !== 0) {
        return message.error(data.data.errmsg);
      }
      applyCategoryMenu(data.data.data || []);
    } catch (/** @type {any} */ err) {
      message.error('获取接口分类失败：' + err.message);
    }
  };

  const applyCategoryMenu = (/** @type {any} */ menuList) => {
    setMenuList(menuList);
    setSelectCatid(prevSelectCatid => {
      return prevSelectCatid || (menuList.length ? menuList[0]._id : 0);
    });
  };

  useEffect(() => {
    loadCategoryMenu();
  }, []);

  // 旧 UNSAFE_componentWillMount 在首帧渲染前同步注册插件导入/导出钩子（首帧 JSX
  // 依赖 importDataModule/exportDataModule 已就绪），惰性 useState 初始化仅执行
  // 一次且早于首帧 JSX 求值，与旧时序一致。
  useState(() => {
    plugin.emitHook('import_data', importDataModule);
    plugin.emitHook('export_data', exportDataModule, id);
    return null;
  });

  const selectChange = (/** @type {any} */ value) => {
    setSelectCatid(+value);
  };

  const uploadChange = (/** @type {any} */ info) => {
    const status = info.file.status;
    if (status !== 'uploading') {
      console.log(info.file, info.fileList);
    }
    if (status === 'done') {
      message.success(`${info.file.name} 文件上传成功`);
    } else if (status === 'error') {
      message.error(`${info.file.name} 文件上传失败`);
    }
  };

  const handleAddInterface = async (/** @type {any} */ res) => {
    const result = await HandleImportData(
      res,
      // 路由参数 id 类型为 string|undefined，本路由必带 :id，断言为 string 以匹配 Id 形参
      (/** @type {string} */ (id)),
      stateRef.current.selectCatid,
      // HandleImportData 按平铺的 _id/parent_id 匹配已有分类，传入时先拍平树形数据。
      flattenCatList(stateRef.current.menuList),
      basePathRef.current,
      stateRef.current.dataSync,
      message.error,
      message.success,
      () => setShowLoading(false)
    );
    // 导入可能新建分类，完成后重新读取菜单，保证页面立即显示最新分类。
    await loadCategoryMenu();
    return result;
  };

  // 本地文件上传
  const handleFile = (/** @type {any} */ info) => {
    if (!stateRef.current.curImportType) {
      return message.error('请选择导入数据的方式');
    }
    if (stateRef.current.selectCatid) {
      setShowLoading(true);
      let reader = new FileReader();
      reader.readAsText(info.file);
      reader.onload = async (/** @type {any} */ res) => {
        try {
          res = await importDataModule[stateRef.current.curImportType].run(res.target.result);
          if (!res || !Array.isArray(res.apis)) {
            throw new Error('解析数据为空');
          }
          if (stateRef.current.dataSync === 'merge') {
            // 开启同步
            showConfirm(res);
          } else {
            // 未开启同步
            await handleAddInterface(res);
          }
        } catch (/** @type {any} */ err) {
          setShowLoading(false);
          message.error(err.message || '解析失败');
        }
      };
      reader.onerror = () => {
        setShowLoading(false);
        message.error('文件读取失败');
      };
    } else {
      message.error('请选择上传的默认分类');
    }
  };

  const showConfirm = async (/** @type {any} */ res) => {
    let typeid = id;
    if (!res || !Array.isArray(res.apis)) {
      setShowLoading(false);
      setDataSync('normal');
      return message.error('解析数据为空');
    }
    let apiCollections = res.apis.map((/** @type {any} */ item) => {
      return {
        method: item.method,
        path: item.path
      };
    });
    let result;
    try {
      result = await fetchUpdateLogData({
        type: 'project',
        typeid,
        apis: apiCollections
      });
    } catch (/** @type {any} */ err) {
      setShowLoading(false);
      setDataSync('normal');
      return message.error('获取同步差异失败：' + err.message);
    }
    let domainData = result.data.data;
    const ref = confirm({
      title: '您确认要进行数据同步????',
      width: 600,
      okType: 'danger',
      // antd5 移除 iconType,改用 icon 节点保持感叹号语义
      icon: <ExclamationCircleFilled />,
      className: 'dataImport-confirm',
      okText: '确认',
      cancelText: '取消',
      content: (
        <div className="postman-dataImport-modal">
          <div className="postman-dataImport-modal-content">
            {domainData.map((/** @type {any} */ item, /** @type {any} */ index) => {
              return (
                <div key={index} className="postman-dataImport-show-diff">
                  <span
                    className="logcontent"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(item.content) }}
                  />
                </div>
              );
            })}
          </div>
          <p className="info">温馨提示： 数据同步后，可能会造成原本的修改数据丢失</p>
        </div>
      ),
      async onOk() {
        try {
          await handleAddInterface(res);
        } catch (/** @type {any} */ err) {
          message.error('数据同步失败：' + err.message);
        } finally {
          setDataSync('normal');
          ref.destroy();
        }
      },
      onCancel() {
        setShowLoading(false);
        setDataSync('normal');
        ref.destroy();
      }
    });
  };

  const handleImportType = (/** @type {any} */ val) => {
    setCurImportType(val);
    setIsSwaggerUrl(false);
  };

  const handleExportType = (/** @type {any} */ val) => {
    setCurExportType(val);
    setIsWiki(false);
  };

  // 处理导入信息同步
  const onChange = (/** @type {any} */ checked) => {
    setDataSync(checked);
  };

  // 处理swagger URL 导入
  const handleUrlChange = (/** @type {any} */ checked) => {
    setIsSwaggerUrl(checked);
  };

  // 记录输入的url
  const swaggerUrlInput = (/** @type {any} */ url) => {
    setSwaggerUrl(url);
  };

  // url导入上传
  const onUrlUpload = async () => {
    if (!stateRef.current.curImportType) {
      return message.error('请选择导入数据的方式');
    }

    if (!stateRef.current.swaggerUrl) {
      return message.error('url 不能为空');
    }
    if (stateRef.current.selectCatid) {
      setShowLoading(true);
      try {
        // 处理swagger url 导入
        const result = await handleSwaggerUrlData(stateRef.current.swaggerUrl);
        const swaggerData = result && result.data ? result.data.data : swaggerUrlDataRef.current;
        let res = await importDataModule[stateRef.current.curImportType].run(swaggerData);
        if (stateRef.current.dataSync === 'merge') {
          // merge
          showConfirm(res);
        } else {
          // 未开启同步
          await handleAddInterface(res);
        }
      } catch (/** @type {any} */ e) {
        setShowLoading(false);
        message.error(e.message);
      }
    } else {
      message.error('请选择上传的默认分类');
    }
  };

  // 处理导出接口是全部还是公开
  const handleChange = (/** @type {any} */ e) => {
    setExportContent(e.target.value);
  };

  //  处理是否开启wiki导出
  const handleWikiChange = (/** @type {any} */ e) => {
    setIsWiki(e.target.checked);
  };

  const uploadMess = {
    name: 'interfaceData',
    multiple: true,
    showUploadList: false,
    action: '/api/interface/interUpload',
    customRequest: handleFile,
    onChange: uploadChange
  };

  let exportUrl =
    curExportType && exportDataModule[curExportType] && exportDataModule[curExportType].route;
  let exportHref = handleExportRouteParams(exportUrl, exportContent, isWiki);

  return (
    <div className="g-row">
      <div className="m-panel">
        <div className="postman-dataImport">
          <div className="dataImportCon">
            <div>
              <h3>
                数据导入&nbsp;
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  href="https://hellosean1025.github.io/yapi/documents/data.html"
                >
                  <Tooltip title="点击查看文档">
                    <QuestionCircleOutlined />
                  </Tooltip>
                </a>
              </h3>
            </div>
            <div className="dataImportTile">
              <Select
                placeholder="请选择导入数据的方式"
                value={curImportType}
                onChange={handleImportType}
              >
                {Object.keys(importDataModule).map(name => {
                  return (
                    <Option key={name} value={name}>
                      {importDataModule[name].name}
                    </Option>
                  );
                })}
              </Select>
            </div>
            <div className="catidSelect">
              <TreeSelect
                value={selectCatid ? String(selectCatid) : undefined}
                treeData={formatCatTreeData(menuList)}
                style={{ width: '100%' }}
                dropdownStyle={{ maxHeight: 400, overflow: 'auto', minWidth: 200 }}
                placeholder="请选择数据导入的默认分类"
                treeDefaultExpandAll={true}
                onChange={selectChange}
              />
            </div>
            <div className="dataSync">
              <span className="label">
                数据同步&nbsp;
                <Tooltip
                  title={
                    <div>
                      <h3 style={{ color: 'white' }}>普通模式</h3>
                      <p>不导入已存在的接口</p>
                      <br />
                      <h3 style={{ color: 'white' }}>智能合并</h3>
                      <p>
                        已存在的接口，将合并返回数据的 response，适用于导入了 swagger
                        数据，保留对数据结构的改动
                      </p>
                      <br />
                      <h3 style={{ color: 'white' }}>完全覆盖</h3>
                      <p>不保留旧数据，完全使用新数据，适用于接口定义完全交给后端定义</p>
                    </div>
                  }
                >
                  <QuestionCircleOutlined />
                </Tooltip>{' '}
              </span>
              <Select value={dataSync} onChange={onChange}>
                <Option value="normal">普通模式</Option>
                <Option value="good">智能合并</Option>
                <Option value="merge">完全覆盖</Option>
              </Select>

              {/* <Switch checked={dataSync} onChange={onChange} /> */}
            </div>
            {curImportType === 'swagger' && (
              <div className="dataSync">
                <span className="label">
                  开启url导入&nbsp;
                  <Tooltip title="swagger url 导入">
                    <QuestionCircleOutlined />
                  </Tooltip>{' '}
                  &nbsp;&nbsp;
                </span>

                <Switch checked={isSwaggerUrl} onChange={handleUrlChange} />
              </div>
            )}
            {isSwaggerUrl ? (
              <div className="import-content url-import-content">
                <Input
                  placeholder="http://demo.swagger.io/v2/swagger.json"
                  onChange={(/** @type {any} */ e) => swaggerUrlInput(e.target.value)}
                />
                <Button
                  type="primary"
                  className="url-btn"
                  onClick={onUrlUpload}
                  loading={showLoading}
                >
                  上传
                </Button>
              </div>
            ) : (
              <div className="import-content">
                <Spin spinning={showLoading} tip="上传中...">
                  <Dragger {...uploadMess}>
                    <p className="ant-upload-drag-icon">
                      <InboxOutlined />
                    </p>
                    <p className="ant-upload-text">点击或者拖拽文件到上传区域</p>
                    <p
                      className="ant-upload-hint"
                      onClick={(/** @type {any} */ e) => {
                        e.stopPropagation();
                      }}
                      dangerouslySetInnerHTML={{
                        __html: curImportType
                          ? sanitizeHtml(importDataModule[curImportType].desc)
                          : null
                      }}
                    />
                  </Dragger>
                </Spin>
              </div>
            )}
          </div>

          <div
            className="dataImportCon"
            style={{
              display: Object.keys(exportDataModule).length > 0 ? '' : 'none'
            }}
          >
            <div>
              <h3>数据导出</h3>
            </div>
            <div className="dataImportTile">
              <Select placeholder="请选择导出数据的方式" onChange={handleExportType}>
                {Object.keys(exportDataModule).map(name => {
                  return (
                    <Option key={name} value={name}>
                      {exportDataModule[name].name}
                    </Option>
                  );
                })}
              </Select>
            </div>

            <div className="dataExport">
              <RadioGroup defaultValue="all" onChange={handleChange}>
                <Radio value="all">全部接口</Radio>
                <Radio value="open">公开接口</Radio>
              </RadioGroup>
            </div>
            <div className="export-content">
              {curExportType ? (
                <div>
                  <p className="export-desc">{exportDataModule[curExportType].desc}</p>
                  <a
                    target="_blank"
                    rel="noopener noreferrer"
                    href={exportHref}>
                    <Button className="export-button" type="primary" size="large">
                      {' '}
                      导出{' '}
                    </Button>
                  </a>
                  <Checkbox
                    checked={isWiki}
                    onChange={handleWikiChange}
                    className="wiki-btn"
                    disabled={curExportType === 'json'}
                  >
                    添加wiki&nbsp;
                    <Tooltip title="开启后 html 和 markdown 数据导出会带上wiki数据">
                      <QuestionCircleOutlined />
                    </Tooltip>{' '}
                  </Checkbox>
                </div>
              ) : (
                <Button disabled className="export-button" type="primary" size="large">
                  {' '}
                  导出{' '}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectData;
