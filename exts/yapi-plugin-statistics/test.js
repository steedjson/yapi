// @ts-check
const yapi = require('../../server/yapi.js');
const commons = require('../../server/utils/commons');
const dbModule = require('../../server/utils/db.js');
const mongoose = require('mongoose');

yapi.commons = commons;
yapi.connect = dbModule.connect();

const convert2Decimal = (/** @type {any} */ num) => (num > 9 ? num : `0${num}`);
/**
 * @param {any} val
 * @param {string} [joinStr]
 */
const formatYMD = (val, joinStr = '-') => {
  let date = val;
  if (typeof val !== 'object') {
    val = val * 1000;
    date = new Date(val);
  }
  return `${[
    date.getFullYear(),
    convert2Decimal(date.getMonth() + 1),
    convert2Decimal(date.getDate())
  ].join(joinStr)}`;
};

function run() {
  let time = yapi.commons.time() - 10000000;
  let data = () => {
    time = time - yapi.commons.rand(10000, 1000000);
    return {
      interface_id: 94,
      project_id: 25,
      group_id: 19,
      time: time,
      ip: '1.1.1.1',
      date: formatYMD(time)
    };
  };

  yapi.connect
    .then(function() {
      let logCol = /** @type {any} */ ((/** @type {*} */ (mongoose.connection.db)).collection('statis_mock'));
      /** @type {any[]} */
      let arr = [];
      for (let i = 0; i < 11; i++) {
        if (arr.length >= 5) {
          logCol.insert(arr);
          arr = [];
        }
        arr.push((/** @type {any} */ (data))(i));
      }
    })
    .catch(function(/** @type {any} */ err) {
      throw new Error(err.message);
    });
}

run();
