// exts 插件测试共享环境必须在任何生产代码之前装载
import './setup';
import test from 'ava';
import React from 'react';
import { cleanup, fireEvent } from '@testing-library/react';
import { cleanupDom } from '../helpers/containers';

const EDITOR_PATH = '../../exts/yapi-plugin-wiki/wikiPage/Editor';

function renderEditor(props) {
  const elm = React.createElement(require(EDITOR_PATH).default, {
    isConflict: false,
    notice: false,
    desc: 'wiki-desc',
    onUpload: () => {},
    onCancel: () => {},
    onEmailNotice: () => {},
    ...props
  });
  return elm;
}

test.serial('WikiEditor 渲染：编辑器容器可见、按钮与通知勾选在位', t => {
  const { container } = require('@testing-library/react').render(
    renderEditor({ isConflict: false })
  );
  // MarkdownEditor 桩渲染且非冲突态可见
  t.truthy(container.querySelector('.stub-markdown-editor'));
  const editorBox = container.querySelector('.wiki-editor');
  t.is(editorBox.style.display, 'block');
  t.is(container.querySelector('.stub-markdown-editor').getAttribute('data-value'), 'wiki-desc');
  // 更新/取消按钮与通知勾选
  t.truthy(Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('更新')));
  t.truthy(Array.from(container.querySelectorAll('button')).find(b => /取\s*消/.test(b.textContent)));
  const checkbox = container.querySelector('.ant-checkbox-input');
  t.truthy(checkbox);
  t.is(checkbox.checked, false);
  cleanup();
  cleanupDom();
});

test.serial('WikiEditor 点击更新：经 ref 取 stub 的 html/markdown 回调 onUpload', t => {
  let uploaded = null;
  const { container } = require('@testing-library/react').render(
    renderEditor({
      onUpload: (desc, markdown) => {
        uploaded = { desc, markdown };
      }
    })
  );
  const updateBtn = Array.from(container.querySelectorAll('button')).find(b =>
    b.textContent.includes('更新')
  );
  fireEvent.click(updateBtn);
  t.deepEqual(uploaded, { desc: '<p>stub-html</p>', markdown: '# stub-md' });
  cleanup();
  cleanupDom();
});

test.serial('WikiEditor 冲突态：编辑器隐藏、更新按钮禁用', t => {
  const { container } = require('@testing-library/react').render(
    renderEditor({ isConflict: true, notice: true })
  );
  t.is(container.querySelector('.wiki-editor').style.display, 'none');
  const updateBtn = Array.from(container.querySelectorAll('button')).find(b =>
    b.textContent.includes('更新')
  );
  t.is(updateBtn.disabled, true);
  const checkbox = container.querySelector('.ant-checkbox-input');
  t.is(checkbox.checked, true);
  cleanup();
  cleanupDom();
});
