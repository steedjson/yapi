process.env.NODE_PATH = __dirname;
require('module').Module._initPaths();

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
const mime = require('mime');
// const bodyParser = require('koa-bodyparser');
const koaBody = require('koa-body');
const router = require('./router.js');

global.storageCreator = storageCreator;
let indexFile = process.argv[2] === 'dev' ? 'dev.html' : 'index.html';

const app = websockify(new Koa());
app.proxy = true;
yapi.app = app;

// app.use(bodyParser({multipart: true}));
app.use(koaBody({strict: false, multipart: true, jsonLimit: '2mb', formLimit: '1mb', textLimit: '1mb' }));
app.use(mockServer);
app.use(router.routes());
app.use(router.allowedMethods());

websocket(app);

app.use(async (ctx, next) => {
  if (/^\/(?!api)[a-zA-Z0-9\/\-_]*$/.test(ctx.path)) {
    ctx.path = '/';
    await next();
  } else {
    await next();
  }
});

app.use(async (ctx, next) => {
  if (ctx.path.indexOf('/prd') === 0) {
    ctx.set('Cache-Control', 'max-age=8640000000');
    if (yapi.commons.fileExist(yapi.path.join(yapi.WEBROOT, 'static', ctx.path + '.gz'))) {
      ctx.set('Content-Encoding', 'gzip');
      ctx.path = ctx.path + '.gz';
    }
  }
  await next();
});


// Koa 2.0 reads res._headers, which Node 15+ dropped, so ctx.type is empty and streams become octet-stream.
app.use(async (ctx, next) => {
  await next();
  const current = ctx.res.getHeader('content-type');
  if (current && current !== 'application/octet-stream') return;
  const ext = ctx.path === '/' ? '.html' : yapi.path.extname(String(ctx.path).replace(/\.gz$/, ''));
  const type = mime.lookup(ext);
  if (type && type !== 'application/octet-stream') ctx.set('Content-Type', type);
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
