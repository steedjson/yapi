module.exports = {
  files: ['test/**/*.test.js'],
  require: ['@babel/register'],
  environmentVariables: { BABEL_ENV: 'test', NODE_ENV: 'test' }
};
