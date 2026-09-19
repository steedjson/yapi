
## %u67E5%u8BE2%u63A5%u53E3%0A%3Ca%20id%3D%22%u67E5%u8BE2%u63A5%u53E35f1a2b3c4d5e6f7a8b9c0d1e%22%3E%20%3C/a%3E
[TOC]

### 基本信息

**Path：** /v1/api/user

**Method：** GET

**接口描述：**
获取用户信息

### 请求参数
**Headers**

| 参数名称  | 参数值  |  是否必须 | 示例  | 备注  |
| ------------ | ------------ | ------------ | ------------ | ------------ |
| token  |  abc123 | 是  |  x-token |  令牌 |
**路径参数**

| 参数名称 | 示例  | 备注  |
| ------------ | ------------ | ------------ |
| id |  42 |  用户ID |
**Query**

| 参数名称  |  是否必须 | 示例  | 备注  |
| ------------ | ------------ | ------------ | ------------ |
| page | 否  |  1 |  页码 |
**Body**

| 参数名称  | 参数类型  |  是否必须 | 示例  | 备注  |
| ------------ | ------------ | ------------ | ------------ | ------------ |
| avatar | text  |  否 |  a.png  |  头像 |



### 返回数据

<table>
  <thead class="ant-table-thead">
    <tr>
      <th key=name>名称</th><th key=type>类型</th><th key=required>是否必须</th><th key=default>默认值</th><th key=desc>备注</th><th key=sub>其他信息</th>
    </tr>
  </thead><tbody className="ant-table-tbody"><tr key=0-0><td key=0><span style="padding-left: 0px"><span style="color: #8c8a8a"></span> code</span></td><td key=1><span>integer</span></td><td key=2>非必须</td><td key=3>0</td><td key=4><span style="white-space: pre-wrap"></span></td><td key=5><p key=0><span style="font-weight: '700'">最大值: </span><span>100</span></p></td></tr><tr key=0-1><td key=0><span style="padding-left: 0px"><span style="color: #8c8a8a"></span> user</span></td><td key=1><span>object</span></td><td key=2>必须</td><td key=3></td><td key=4><span style="white-space: pre-wrap"></span></td><td key=5></td></tr><tr key=0-1-0><td key=0><span style="padding-left: 20px"><span style="color: #8c8a8a">├─</span> nick</span></td><td key=1><span>string</span></td><td key=2>非必须</td><td key=3>tom</td><td key=4><span style="white-space: pre-wrap"></span></td><td key=5><p key=2><span style="font-weight: '700'">枚举: </span><span>a,b</span></p><p key=3><span style="font-weight: '700'">枚举备注: </span><span>枚举说明</span></p><p key=4><span style="font-weight: '700'">format: </span><span>email</span></p><p key=5><span style="font-weight: '700'">mock: </span><span>@name</span></p></td></tr>
               </tbody>
              </table>
            