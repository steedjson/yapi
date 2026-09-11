const _ = require('underscore')
const swagger = require('swagger-client');
const compareVersions = require('compare-versions');

  var SwaggerData, isOAS3;
  function handlePath(path) {
    if (path === '/') return path;
    if (path.charAt(0) != '/') {
      path = '/' + path;
    }
    if (path.charAt(path.length - 1) === '/') {
      path = path.substr(0, path.length - 1);
    }
    return path;
  }

  // OpenAPI 3.x 的响应和请求体都放在 content 中，优先选择 JSON 或兼容的 +json 媒体类型。
  function getJsonContent(content) {
    if (!content || typeof content !== 'object') return null;
    const keys = Object.keys(content);
    const key = keys.find(item => item === 'application/json' || /\+json$/i.test(item)) || keys[0];
    return key ? content[key] : null;
  }

  function getServerBasePath(data) {
    if (data.basePath || !data.servers || !data.servers[0] || !data.servers[0].url) {
      return data.basePath || '';
    }
    let serverUrl = String(data.servers[0].url);
    const variables = data.servers[0].variables || {};
    Object.keys(variables).forEach(name => {
      const variable = variables[name] || {};
      const value = variable.default === undefined ? '' : String(variable.default);
      serverUrl = serverUrl.replace(new RegExp('\\{' + name + '\\}', 'g'), value);
    });
    // 没有默认值时移除变量，避免把模板占位符带入接口路径。
    serverUrl = serverUrl.replace(/\{[^}]+\}/g, '');
    const match = serverUrl.match(/^(?:https?:\/\/[^/]+)?(\/[^?#]*)/i);
    return match && match[1] && match[1] !== '/' ? match[1].replace(/\/$/, '') : '';
  }

  function openapi2swagger(data) {
    data.swagger = '2.0';
    _.each(data.paths, apis => {
      _.each(apis, api => {
        _.each(api.responses, res => {
          const responseContent = getJsonContent(res.content);
          if (responseContent && typeof responseContent === 'object') {
            Object.assign(res, responseContent);
            delete res.content;
          }
        });
        if (api.requestBody) {
          if (!api.parameters) api.parameters = [];
          let body = {
            type: 'object',
            name: 'body',
            in: 'body'
          };
          try {
            const requestContent = getJsonContent(api.requestBody.content);
            body.schema = requestContent && requestContent.schema ? requestContent.schema : {};
          } catch (e) {
            body.schema = {};
          }

          api.parameters.push(body);
        }
      });
    });

    return data;
  }

  async function handleSwaggerData(res) {

    return await new Promise(resolve => {
      let data = swagger({
        spec: res
      });

      data.then(res => {
        resolve(res.spec);
      });
    });
  }

  async function run(res) {
      let interfaceData = { apis: [], cats: [] };
      if(typeof res === 'string' && res){
        try{
          res = JSON.parse(res);
        } catch (e) {
          console.error('json 解析出错',e.message)
        }
      }

      isOAS3 = res.openapi && compareVersions(res.openapi,'3.0.0') >= 0;
      let basePath = '';
      if (isOAS3) {
        basePath = getServerBasePath(res);
        res = openapi2swagger(res);
      }
      res = await handleSwaggerData(res);
      // swagger-client 可能按 OpenAPI 2.0 规则重算 basePath，恢复 3.x servers 的路径。
      if (basePath) res.basePath = basePath;
      SwaggerData = res;

      interfaceData.basePath = res.basePath || '';

      if (res.tags && Array.isArray(res.tags)) {
        res.tags.forEach(tag => {
          interfaceData.cats.push({
            name: tag.name,
            desc: tag.description
          });
        });
      }else{
        res.tags = []
      }

      _.each(res.paths, (apis, path) => {
        // parameters is common parameters, not a method
        delete apis.parameters;
        _.each(apis, (api, method) => {
          api.path = path;
          api.method = method;
          let data = null;
          try {
            data = handleSwagger(api, res.tags);
            if (data.catname) {
              if (!_.find(interfaceData.cats, item => item.name === data.catname)) {
                if(res.tags.length === 0){
                  interfaceData.cats.push({
                    name: data.catname,
                    desc: data.catname
                  });
                }
              }
            }
          } catch (err) {
            data = null;
          }
          if (data) {
            interfaceData.apis.push(data);
          }
        });
      });

      const categoryMap = {};
      interfaceData.cats.forEach(cat => {
        const parts = String(cat.name).split('/').map(item => item.trim()).filter(Boolean);
        let fullPath = '';
        let parentPath = '';
        parts.forEach(part => {
          fullPath = fullPath ? fullPath + '/' + part : part;
          if (!categoryMap[fullPath]) {
            categoryMap[fullPath] = {
              name: part,
              path: fullPath,
              parent_path: parentPath,
              desc: fullPath === cat.name ? cat.desc : part
            };
          }
          parentPath = fullPath;
        });
      });
      interfaceData.cats = Object.keys(categoryMap).map(key => categoryMap[key]);
      interfaceData.cats = interfaceData.cats.filter(catData=>{
        return _.find(interfaceData.apis, apiData=>{
          return apiData.catname === catData.path ||
            (apiData.catname && apiData.catname.indexOf(catData.path + '/') === 0);
        });
      });

      return interfaceData;
  }

  function handleSwagger(data, originTags= []) {

    let api = {};
    //处理基本信息
    api.method = data.method.toUpperCase();
    api.title = data.summary || data.path;
    api.desc = data.description;
    api.catname = null;
    if(data.tags && Array.isArray(data.tags)){
      api.tag = data.tags;
      for(let i=0; i< data.tags.length; i++){
        if(/v[0-9\.]+/.test(data.tags[i])){
          continue;
        }

        // 如果根路径有 tags，使用根路径 tags,不使用每个接口定义的 tag 做完分类
        if(originTags.length > 0 && _.find(originTags, item=>{
          return item.name === data.tags[i]
        })){
          api.catname = data.tags[i];
          break;
        }

        if(originTags.length === 0){
          api.catname = data.tags[i];
          break;
        }
        
      }

    }

    api.path = handlePath(data.path);
    api.req_params = [];
    api.req_body_form = [];
    api.req_headers = [];
    api.req_query = [];
    api.req_body_type = 'raw';
    api.res_body_type = 'raw';

    if (data.produces && data.produces.indexOf('application/json') > -1) {
      api.res_body_type = 'json';
      api.res_body_is_json_schema = true;
    }

    if (data.consumes && Array.isArray(data.consumes)) {
      if (
        data.consumes.indexOf('application/x-www-form-urlencoded') > -1 ||
        data.consumes.indexOf('multipart/form-data') > -1
      ) {
        api.req_body_type = 'form';
      } else if (data.consumes.indexOf('application/json') > -1) {
        api.req_body_type = 'json';
        api.req_body_is_json_schema = true;
      }
    }

    //处理response
    api.res_body = handleResponse(data.responses);
    try {
      JSON.parse(api.res_body);
      api.res_body_type = 'json';
      api.res_body_is_json_schema = true;
    } catch (e) {
      api.res_body_type = 'raw';
    }
    //处理参数
    function simpleJsonPathParse(key, json) {
      if (!key || typeof key !== 'string' || key.indexOf('#/') !== 0 || key.length <= 2) {
        return null;
      }
      let keys = key.substr(2).split('/');
      keys = keys.filter(item => {
        return item;
      });
      for (let i = 0, l = keys.length; i < l; i++) {
        try {
          json = json[keys[i]];
        } catch (e) {
          json = '';
          break;
        }
      }
      return json;
    }

    if (data.parameters && Array.isArray(data.parameters)) {
      data.parameters.forEach(param => {
        if (param && typeof param === 'object' && param.$ref) {
          param = simpleJsonPathParse(param.$ref, { parameters: SwaggerData.parameters });
        }
        let defaultParam = {
          name: param.name,
          desc: param.description,
          required: param.required ? '1' : '0'
        };

        if (param.in) {
        switch (param.in) {
          case 'path':
            api.req_params.push(defaultParam);
            break;
          case 'query':
            api.req_query.push(defaultParam);
            break;
          case 'body':
            handleBodyPamras(param.schema, api);
            break;
          case 'formData':
            defaultParam.type = param.type === 'file' ? 'file' : 'text';
			if (param.example) {
              defaultParam.example = param.example;
            }
            api.req_body_form.push(defaultParam);
            break;
          case 'header':
            api.req_headers.push(defaultParam);
            break;
        }
      } else {
        api.req_query.push(defaultParam);
      }
      });
    }

    return api;
  }

  function isJson(json) {
    try {
      return JSON.parse(json);
    } catch (e) {
      return false;
    }
  }

  function handleBodyPamras(data, api) {
    api.req_body_other = JSON.stringify(data, null, 2);
    if (isJson(api.req_body_other)) {
      api.req_body_type = 'json';
      api.req_body_is_json_schema = true;
    }
  }

  function handleResponse(api) {
    let res_body = '';
    if (!api || typeof api !== 'object') {
      return res_body;
    }
    let codes = Object.keys(api);
    let curCode;
    if (codes.length > 0) {
      if (codes.indexOf('200') > -1) {
        curCode = '200';
      } else curCode = codes[0];

      let res = api[curCode];
      if (res && typeof res === 'object') {
        if (res.schema) {
          res_body = JSON.stringify(res.schema, null, 2);
        } else if (res.description) {
          res_body = res.description;
        }
      } else if (typeof res === 'string') {
        res_body = res;
      } else {
        res_body = '';
      }
    } else {
      res_body = '';
    }
    return res_body;
  }




module.exports = run;
