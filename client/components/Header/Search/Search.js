import React, { PureComponent as Component } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { Input, AutoComplete } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import './Search.scss';
import withRouter from '../../../withRouter';
import axios from 'axios';
import { setCurrGroup, fetchGroupMsg } from '../../../reducer/modules/group';
import { changeMenuItem } from '../../../reducer/modules/menu';

import { fetchInterfaceListMenu } from '../../../reducer/modules/interface';

@connect(
  state => ({
    groupList: state.group.groupList,
    projectList: state.project.projectList
  }),
  {
    setCurrGroup,
    changeMenuItem,
    fetchGroupMsg,
    fetchInterfaceListMenu
  }
)
@withRouter
export default class Srch extends Component {
  constructor(props) {
    super(props);
    this.state = {
      dataSource: []
    };
  }

  static propTypes = {
    groupList: PropTypes.array,
    projectList: PropTypes.array,
    router: PropTypes.object,
    history: PropTypes.object,
    location: PropTypes.object,
    setCurrGroup: PropTypes.func,
    changeMenuItem: PropTypes.func,
    fetchInterfaceListMenu: PropTypes.func,
    fetchGroupMsg: PropTypes.func
  };

  onSelect = async (value, option) => {
    // 选项附带的自定义数据存放在 searchIndex 中（见 handleSearch），
    // 不能作为 props 挂在 Option 上，否则会透传到 DOM 触发 React 警告
    const meta = (this.searchIndex || {})[option.key] || {};
    if (meta.type === '分组') {
      this.props.changeMenuItem('/group');
      this.props.history.push('/group/' + meta.id);
      this.props.setCurrGroup({ group_name: value, _id: meta.id - 0 });
    } else if (meta.type === '项目') {
      await this.props.fetchGroupMsg(meta.groupId);
      this.props.history.push('/project/' + meta.id);
    } else if (meta.type === '接口') {
      await this.props.fetchInterfaceListMenu(meta.projectId);
      this.props.history.push('/project/' + meta.projectId + '/interface/api/' + meta.id);
    }
  };

  handleSearch = value => {
    axios
      .get('/api/project/search?q=' + value)
      .then(res => {
        if (res.data && res.data.errcode === 0) {
          // antd5 的 AutoComplete 移除 dataSource,改用 options 配置
          // ({ key, value, label });key 仅作为 onSelect 的索引,不透传 DOM
          const options = [];
          this.searchIndex = {};
          for (let title in res.data.data) {
            res.data.data[title].map(item => {
              switch (title) {
                case 'group': {
                  const key = `分组${item._id}`;
                  this.searchIndex[key] = { type: '分组', id: item._id };
                  options.push({ key, value: item.groupName, label: `分组: ${item.groupName}` });
                  break;
                }
                case 'project': {
                  const key = `项目${item._id}`;
                  this.searchIndex[key] = { type: '项目', id: item._id, groupId: item.groupId };
                  options.push({ key, value: item.name, label: `项目: ${item.name}` });
                  break;
                }
                case 'interface': {
                  const key = `接口${item._id}`;
                  this.searchIndex[key] = {
                    type: '接口',
                    id: item._id,
                    projectId: item.projectId
                  };
                  options.push({ key, value: item.title, label: `接口: ${item.title}` });
                  break;
                }
                default:
                  break;
              }
            });
          }
          this.setState({
            dataSource: options
          });
        } else {
          console.log('查询项目或分组失败');
        }
      })
      .catch(err => {
        console.log(err);
      });
  };

  // getDataSource(groupList){
  //   const groupArr =[];
  //   groupList.forEach(item =>{
  //     groupArr.push("group: "+ item["group_name"]);
  //   })
  //   return groupArr;
  // }

  render() {
    const { dataSource } = this.state;

    return (
      <div className="search-wrapper">
        <AutoComplete
          className="search-dropdown"
          options={dataSource}
          style={{ width: '100%' }}
          defaultActiveFirstOption={false}
          onSelect={this.onSelect}
          onSearch={this.handleSearch}
          // filterOption={(inputValue, option) =>
          //   option.props.children.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
          // }
        >
          <Input
            prefix={<SearchOutlined className="srch-icon" />}
            placeholder="搜索分组/项目/接口"
            className="search-input"
          />
        </AutoComplete>
      </div>
    );
  }
}
