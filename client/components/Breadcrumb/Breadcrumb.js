import './Breadcrumb.scss';
import withRouter from '../../withRouter';
import { Breadcrumb, ConfigProvider } from 'antd';
import PropTypes from 'prop-types';
import React, { PureComponent as Component } from 'react';
import { connect } from 'react-redux';
import { Link } from 'react-router-dom';

@connect(state => {
  return {
    breadcrumb: state.user.breadcrumb
  };
})
@withRouter
export default class BreadcrumbNavigation extends Component {
  constructor(props) {
    super(props);
  }

  static propTypes = {
    breadcrumb: PropTypes.array
  };

  render() {
    const items = (this.props.breadcrumb || []).map((item, index) => {
      return {
        key: index,
        title: item.href ? <Link to={item.href}>{item.name}</Link> : item.name
      };
    });

    return (
      <div className="breadcrumb-container">
        <ConfigProvider
          theme={{
            components: {
              Breadcrumb: {
                itemColor: '#ffffff',
                lastItemColor: '#ffffff',
                separatorColor: 'rgba(255, 255, 255, 0.7)',
                linkColor: '#ffffff',
                linkHoverColor: '#2395f1',
                fontSize: 16
              }
            }
          }}
        >
          <Breadcrumb items={items} />
        </ConfigProvider>
      </div>
    );
  }
}
