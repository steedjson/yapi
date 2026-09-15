import test from 'ava';
import { V3_TO_V4_ICON, getV4Icon } from '../../client/constants/v4IconMap';
import {
  GithubOutlined,
  AliwangwangOutlined,
  StarOutlined
} from '@ant-design/icons';

const isValidElementType = component =>
  component != null &&
  (typeof component === 'function' ||
    (typeof component === 'object' && component.$$typeof !== undefined));

test('getV4Icon 映射本次新增图标: github / aliwangwang-o / aliwangwang', t => {
  t.is(getV4Icon('github'), GithubOutlined);
  t.is(getV4Icon('aliwangwang-o'), AliwangwangOutlined);
  t.is(getV4Icon('aliwangwang'), AliwangwangOutlined);
});

test('getV4Icon 默认图标 star-o 精确映射, 未知名称回落 StarOutlined', t => {
  t.is(getV4Icon('star-o'), StarOutlined);
  t.is(getV4Icon('no-such-icon'), StarOutlined);
});

test('V3_TO_V4_ICON 全部映射值均为有效 React 元素类型, 防止 undefined 渲染崩溃', t => {
  const invalid = Object.entries(V3_TO_V4_ICON)
    .filter(([, component]) => !isValidElementType(component))
    .map(([name]) => name);
  t.deepEqual(invalid, [], `以下图标名映射到了无效组件: ${invalid.join(', ')}`);
});
