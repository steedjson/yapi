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

/** 接口保存参数，兼容导入数据中缺失的可选字段。 */
export interface InterfaceSaveParams extends Partial<InterfaceSummary> {
  id?: number;
  project_id: number;
  catid: number;
  req_body_type?: 'form' | 'json' | 'text' | 'xml' | string;
  req_headers?: InterfaceHeader[];
  req_body_form?: InterfaceFormField[];
  req_body_other?: string;
  res_body_type?: 'json' | 'text' | 'xml' | string;
  res_body?: string;
  desc?: string;
  status?: string;
}

/** 接口请求头的兼容结构。 */
export interface InterfaceHeader {
  name: string;
  value?: string;
  example?: string;
  desc?: string;
  required?: boolean | string;
}

/** 表单请求字段的兼容结构。 */
export interface InterfaceFormField {
  name: string;
  type?: 'text' | 'file' | string;
  value?: string;
  example?: string;
  desc?: string;
  required?: boolean | string;
}
