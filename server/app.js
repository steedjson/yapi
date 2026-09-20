// @ts-check
process.env.NODE_PATH = __dirname;
(/** @type {*} */ (require('module').Module))._initPaths();

const yapi = require('./yapi.js');
const commons = require('./utils/commons');
yapi.commons = commons;
const dbModule = require('./utils/db.js');
yapi.connect = dbModule.connect();
const mockServer = require('./middleware/mockServer.js');
require('./plugin.js');
const websockify = require('koa-websocket');
const websocket = require('./websocket.js');
const storageCreator = require('./utils/storage')
require('./utils/notice')

const Koa = require('koa');
const koaStatic = require('koa-static');
// const bodyParser = require('koa-bodyparser');
const { koaBody } = require('koa-body');
const router = require('./router.js');

(/** @type {*} */ (global)).storageCreator = storageCreator;
let indexFile = process.argv[2] === 'dev' ? 'dev.html' : 'index.html';

const app = websockify(new Koa());
app.proxy = true;
yapi.app = app;

// app.use(bodyParser({multipart: true}));
// koa-body v8: strict 选项已移除(等价能力为 jsonStrict); parsedMethods 显式覆盖全部可携带 body 的方法以保持 v2 行为
app.use(
  koaBody({
    multipart: true,
    jsonLimit: '2mb',
    formLimit: '1mb',
    textLimit: '1mb',
    jsonStrict: false,
    parsedMethods: /** @type {any} */ (['POST', 'GET', 'PUT', 'PATCH', 'DELETE', 'HEAD'])
  })
);
app.use(mockServer);
app.use(router.routes());
app.use(router.allowedMethods());

websocket(app);

app.use(async (/** @type {any} */ ctx, /** @type {any} */ next) => {
  if (/^\/(?!api)[a-zA-Z0-9/\-_]*$/.test(ctx.path)) {
    ctx.path = '/';
    await next();
  } else {
    await next();
  }
});

app.use(async (/** @type {any} */ ctx, /** @type {any} */ next) => {
  if (ctx.path.indexOf('/prd') === 0) {
    if (ctx.path === '/prd/assets.js') {
      // assets.js 是产物清单: URL 固定但内容随每次部署变化(引用新 hash chunk 文件名),
      // 必须永远回源校验(no-cache 允许 Last-Modified 304), 否则部署后回访用户会拿到
      // 引用已删除旧 chunk 的过期清单导致白屏。
      ctx.set('Cache-Control', 'no-cache');
    } else {
      ctx.set('Cache-Control', 'max-age=8640000000');
    }
    if (yapi.commons.fileExist(yapi.path.join(yapi.WEBROOT, 'static', ctx.path + '.gz'))) {
      ctx.set('Content-Encoding', 'gzip');
      // koa-send 按改写后的整个文件名（含 .gz 后缀）推断 Content-Type，
      // 会返回 application/gzip 导致浏览器拒绝应用样式，此处按原始扩展名显式声明
      ctx.type = yapi.path.extname(ctx.path).replace('.', '');
      ctx.path = ctx.path + '.gz';
    }
  }
  await next();
});


app.use(koaStatic(yapi.path.join(yapi.WEBROOT, 'static'), { index: indexFile, gzip: true }));


function startServer() {
  const server = app.listen(yapi.WEBCONFIG.port);

  server.setTimeout(yapi.WEBCONFIG.timeout);

  commons.log(
    `服务已启动，请打开下面链接访问: \nhttp://127.0.0.1${
      yapi.WEBCONFIG.port == '80' ? '' : ':' + yapi.WEBCONFIG.port
    }/`
  );

  return server;
}

// 允许测试和工具复用完整 Koa 应用，但直接执行文件时保持原有启动行为。
if (require.main === module) {
  startServer();
}

module.exports = app;
