import api from '../services/api';

const getAttachmentUrl = (filePath) => {
  if (typeof filePath !== 'string' || !filePath.trim() || !api.defaults.baseURL) return '#';

  const normalizedPath = filePath.trim().replace(/\\/g, '/');
  const attachmentPath = normalizedPath.match(/(?:^|\/)(uploads\/reports\/[^?#]+)/)?.[1];
  if (!attachmentPath) return '#';

  const encodedPath = attachmentPath.split('/').map(encodeURIComponent).join('/');
  return `${api.defaults.baseURL.replace(/\/+$/, '')}/${encodedPath}`;
};

export default getAttachmentUrl;
