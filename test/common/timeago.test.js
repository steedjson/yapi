import test from 'ava';
import { timeago } from '../../common/utils.js';

// timeago 内部以 parseInt(new Date().getTime() / 1000) 取整计算秒差,
// 测试基点同样向下取整, 避免毫秒小数导致秒差出现 -1/0.x 之类的边界漂移
const nowInSeconds = () => Math.floor(Date.now() / 1000);

test('timeago: 当前时间返回 刚刚', t => {
  t.is(timeago(nowInSeconds()), '刚刚');
});

test('timeago: 10 秒前返回 刚刚(小于 30 秒均视为刚刚)', t => {
  t.is(timeago(nowInSeconds() - 10), '刚刚');
});

// 30 秒分支: 秒数会原样拼进结果; 若 nowInSeconds 与 timeago 内部取整之间
// 恰好跨过 1 秒边界, 秒差会从 30 变为 31, 因此用正则容忍 ±1 秒漂移
test('timeago: 30 秒左右返回 N秒前(覆盖 >=30 秒的秒级分支)', t => {
  t.regex(timeago(nowInSeconds() - 30), /^3[01]秒前$/);
});

test('timeago: 120 秒前返回 2分钟前', t => {
  t.is(timeago(nowInSeconds() - 120), '2分钟前');
});

test('timeago: 7200 秒前返回 2小时前', t => {
  t.is(timeago(nowInSeconds() - 7200), '2小时前');
});

test('timeago: 3 天前返回 3天前', t => {
  t.is(timeago(nowInSeconds() - 86400 * 3), '3天前');
});

test('timeago: 60 天前返回 2月前', t => {
  t.is(timeago(nowInSeconds() - 86400 * 60), '2月前');
});

test('timeago: 400 天前返回 1年前', t => {
  t.is(timeago(nowInSeconds() - 86400 * 400), '1年前');
});
