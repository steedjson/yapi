// @ts-check
const ldap = require('ldapjs');
const yapi = require('../yapi.js');

/**
 * 通过 LDAP 校验用户名密码并取回用户信息。
 * @param {string} username 用户名
 * @param {string} password 密码
 * @returns {Promise<{type: boolean, message: string, info?: any}>} 校验结果
 */
exports.ldapQuery = (username, password) => {
  // const deferred = Q.defer();

  return new Promise((resolve, reject) => {
    const { ldapLogin } = yapi.WEBCONFIG;

    //  使用ldapjs库创建一个LDAP客户端
    const client = ldap.createClient({
      url: ldapLogin.server
    });

    // ldapjs v3 连接失败时会发 connectError（而非 error），需同时监听，否则登录流程会挂起
    const onConnectError = (/** @type {any} */ err) => {
      if (err) {
        let msg = {
          type: false,
          message: `ldap连接失败: ${err}`
        };
        reject(msg);
      }
    };
    client.once('error', onConnectError);
    client.once('connectError', onConnectError);
    // 注册事件处理函数
    const ldapSearch = (/** @type {any} */ err, /** @type {any} */ search) => {
      /** @type {any[]} */
      const users = [];
      if (err) {
        let msg = {
          type: false,
          message: `ldapSearch: ${err}`
        };
        reject(msg);
        // v3 超时等错误路径不携带 search 实例，必须终止否则下一行抛 TypeError
        return;
      }
      // 查询结果事件响应
      search.on('searchEntry', (/** @type {any} */ entry) => {
        if (entry) {
          // ldapjs v3 移除了 entry.object，改用 pojo 还原为 {dn, 属性...} 的扁平对象
          const flat = /** @type {Record<string, any>} */ ({ dn: entry.pojo.objectName });
          entry.pojo.attributes.forEach((/** @type {any} */ attr) => {
            flat[attr.type] = attr.values.length === 1 ? attr.values[0] : attr.values;
          });
          // 获取查询对象
          users.push(flat);
        }
      });
      // 查询错误事件
      search.on('error', (/** @type {any} */ e) => {
        if (e) {
          let msg = {
            type: false,
            message: `searchErr: ${e}`
          };
          reject(msg);
        }
      });

      search.on('searchReference', (/** @type {any} */ referral) => {
        // if (referral) {
        //   let msg = {
        //     type: false,
        //     message: `searchReference: ${referral}`
        //   };
        //   reject(msg);
        // }
        console.log('referral: ' + referral.uris.join());
      });
      // 查询结束
      search.on('end', () => {
        if (users.length > 0) {
          client.bind(users[0].dn, password, (/** @type {any} */ e) => {
            if (e) {
              let msg = {
                type: false,
                message: `用户名或密码不正确: ${e}`
              };
              reject(msg);
            } else {
              let msg = {
                type: true,
                message: `验证成功`,
                info: users[0]
              };
              resolve(msg);
            }
            client.unbind();
          });
        } else {
          let msg = {
            type: false,
            message: `用户名不存在`
          };
          reject(msg);
          client.unbind();
        }
      });
    };
    // 将client绑定LDAP Server
    // 第一个参数： 是用户，必须是从根结点到用户节点的全路径
    // 第二个参数： 用户密码
    return new Promise((/** @type {(v?: any) => void} */ resolve, reject) => {
      if (ldapLogin.bindPassword) {
        client.bind(ldapLogin.baseDn, ldapLogin.bindPassword, (/** @type {any} */ err) => {
          if (err) {
            let msg = {
              type: false,
              message: `LDAP server绑定失败: ${err}`
            };
            reject(msg);
          }

          resolve();
        });
      } else {
        resolve();
      }
    }).then(() => {
      const searchDn = ldapLogin.searchDn;
      const searchStandard = ldapLogin.searchStandard;
      // 处理可以自定义filter
      let customFilter;
      if (/^(&|\|)/gi.test(searchStandard)) {
        customFilter = searchStandard.replace(/%s/g,username);
      } else {
        customFilter = `${searchStandard}=${username}`;
      }
      const opts = {
        // filter: `(${searchStandard}=${username})`,
        filter: `(${customFilter})`,
        scope: 'sub'
      };

      // 开始查询
      // 第一个参数： 查询基础路径，代表在查询用户信息将在这个路径下进行，该路径由根结点开始
      // 第二个参数： 查询选项
      client.search(searchDn, opts, ldapSearch);
    });
  });
};
