const { createProxyMiddleware } = require('http-proxy-middleware');

const backendBase = '/student-placement/placement_backend';

const proxyToBackend = createProxyMiddleware({
  target: 'http://127.0.0.1:8888',
  changeOrigin: true,
  secure: false,
  pathRewrite: (path, req) => `${backendBase}${req.originalUrl || path}`,
});

module.exports = function(app) {
  app.use('/api', proxyToBackend);
  app.use('/auth', proxyToBackend);
};