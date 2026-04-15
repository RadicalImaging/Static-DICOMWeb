import ConfigPoint from 'config-point';
import { createProxyMiddleware } from 'http-proxy-middleware';

export default ConfigPoint.createConfiguration('webProxy', {
  setRoute: (router, item) => {
    const forwardPath = item.forwardPath || 'http://localhost:3000';
    console.log('Web Proxy to', forwardPath);
    router.get('/*splat', createProxyMiddleware({ target: forwardPath, changeOrigin: true }));
  },
});
