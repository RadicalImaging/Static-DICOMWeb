const ConfigPoint = require('config-point');
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = ConfigPoint.createConfiguration("webProxy", {
  setRoute: (router, item) => {
    const forwardPath = item.forwardPath || 'http://localhost:3000';
    console.log("Web Proxy to", forwardPath);
    router.get('/*', createProxyMiddleware({ target: forwardPath, changeOrigin: true }));
  },
});