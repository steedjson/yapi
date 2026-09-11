const yapi = require('../yapi')

const crypto = require('crypto');

/*
 下面是使用加密算法
*/

// Node.js 24 已移除 createCipher/createDecipher；这里复现旧版 EVP_BytesToKey，确保历史 token 仍可解密。
const legacyKeyAndIv = password => {
  const passwordBuffer = Buffer.from(password, 'utf8');
  let previous = Buffer.alloc(0);
  let result = Buffer.alloc(0);
  while (result.length < 40) {
    previous = crypto
      .createHash('md5')
      .update(Buffer.concat([previous, passwordBuffer]))
      .digest();
    result = Buffer.concat([result, previous]);
  }
  return {
    key: result.subarray(0, 24),
    iv: result.subarray(24, 40)
  };
};

// 使用与旧版 crypto.createCipher('aes192', password) 相同的 AES-192-CBC 参数。
const aseEncode = function(data, password) {
  const {key, iv} = legacyKeyAndIv(password);
  const cipher = crypto.createCipheriv('aes-192-cbc', key, iv);
  let crypted = cipher.update(data, 'utf8', 'hex');
  crypted += cipher.final('hex');
  return crypted;
};

const aseDecode = function(data, password) {
  const {key, iv} = legacyKeyAndIv(password);
  const decipher = crypto.createDecipheriv('aes-192-cbc', key, iv);
  let decrypted = decipher.update(data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

const defaultSalt = 'abcde';

exports.getToken = function getToken(token, uid){
  if(!token)throw new Error('token 不能为空')
  yapi.WEBCONFIG.passsalt = yapi.WEBCONFIG.passsalt || defaultSalt;
  return aseEncode(uid + '|' + token, yapi.WEBCONFIG.passsalt)
}

exports.parseToken = function parseToken(token){
  if(!token)throw new Error('token 不能为空')
  yapi.WEBCONFIG.passsalt = yapi.WEBCONFIG.passsalt || defaultSalt;
  let tokens;
  try{
    tokens = aseDecode(token, yapi.WEBCONFIG.passsalt)
  }catch(e){}  
  if(tokens && typeof tokens === 'string' && tokens.indexOf('|') > 0){
    tokens = tokens.split('|')
    return {
      uid: tokens[0],
      projectToken: tokens[1]
    }
  }
  return false;
  
}

