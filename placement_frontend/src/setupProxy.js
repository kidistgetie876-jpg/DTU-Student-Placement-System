const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    ['/auth', '/api'],
    createProxyMiddleware({
      target: 'http://localhost/student-placement/placement_backend',
      changeOrigin: true,
      secure: false,
    })
  );
};