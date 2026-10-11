const { createProxyMiddleware } = require('http-proxy-middleware');

const backendBase = '/student-placement/placement_backend';

const proxyToBackend = createProxyMiddleware({
  target: 'http://localhost',
  changeOrigin: true,
  secure: false,
  pathRewrite: (path, req) => `${backendBase}${req.originalUrl || path}`,
});

module.exports = function(app) {
  app.use('/api', proxyToBackend);
  app.use('/auth', proxyToBackend);
};