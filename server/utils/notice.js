// @ts-check
const yapi = require('../yapi.js');

/**
 * 合并两个数组并去重。
 * @param {any[]} arr1 数组一
 * @param {any[]} arr2 数组二
 * @returns {any[]} 去重后的合并结果
 */
function arrUnique(arr1, arr2) {
  let arr = arr1.concat(arr2);
  let res = arr.filter(function (
    /** @type {any} */ item,
    /** @type {number} */ index,
    /** @type {any[]} */ arr
  ) {
    return arr.indexOf(item) === index;
  });
  return res;
}

/** @type {Record<string, any>} */
const noticeObj = {
  mail: {
    title: '邮件',
    hander: (
      /** @type {string} */ emails,
      /** @type {string} */ title,
      /** @type {string} */ content
    ) => {
      yapi.commons.sendMail({
        to: emails,
        contents: content,
        subject: title
      });
    }
  }
}

yapi.emitHook('addNotice', noticeObj)

/**
 * 向项目成员与关注者发送通知（邮件等渠道）。
 * @param {string} projectId 项目 ID
 * @param {{title: string, content: string}} data 通知标题与内容
 * @returns {Promise<void>}
 */
yapi.commons.sendNotice = async function (
  /** @type {string} */ projectId,
  /** @type {{title: string, content: string}} */ data
) {
  const projectModel = require('../models/project.js');
  const userModel = require('../models/user.js');
  const followModel = require('../models/follow.js');

  const followInst = yapi.getInst(followModel);
  const userInst = yapi.getInst(userModel);
  const projectInst = yapi.getInst(projectModel);
  const list = await followInst.listByProjectId(projectId);
  const starUsers = list.map((/** @type {any} */ item) => item.uid);

  const projectList = await projectInst.get(projectId);
  const projectMenbers = projectList.members
    .filter((/** @type {any} */ item) => item.email_notice)
    .map((/** @type {any} */ item) => item.uid);

  const users = arrUnique(projectMenbers, starUsers);
  const usersInfo = await userInst.findByUids(users);
  const emails = usersInfo.map((/** @type {any} */ item) => item.email).join(',');

  try {
    Object.keys(noticeObj).forEach(key => {
      let noticeItem = noticeObj[key];
      try {
        noticeItem.hander(emails, data.title, data.content)
      } catch (/** @type {any} */ err) {
        yapi.commons.log('发送' + (noticeItem.title || key) + '失败' + err.message, 'error')
      }
    })
    // yapi.commons.sendMail({
    //   to: emails,
    //   contents: data.content,
    //   subject: data.title
    // });
  } catch (e) {
    yapi.commons.log('发送失败：' + e, 'error');
  }
};