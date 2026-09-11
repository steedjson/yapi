/**
 * 接口分类的兼容数据结构。
 *
 * parentId 用于描述新建或移动分类时的父分类；历史数据没有该字段时，
 * 业务层继续按根分类处理，不改变现有 MongoDB 文档结构。
 */
export interface InterfaceCategory {
  _id: number;
  name: string;
  project_id: number;
  parent_id?: number;
  desc?: string;
  index?: number;
  list?: InterfaceSummary[];
  children?: InterfaceCategory[];
}

/** 接口菜单中用于展示的最小接口字段。 */
export interface InterfaceSummary {
  _id: number;
  catid: number;
  title: string;
  path: string;
  method: string;
}
