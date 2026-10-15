import api from '../services/api';

const getAttachmentUrl = (filePath, notificationId) => {
  if (
    typeof filePath !== 'string'
    || !filePath.trim()
    || !api.defaults.baseURL
    || !Number.isInteger(Number(notificationId))
    || Number(notificationId) <= 0
  ) return '#';

  const normalizedPath = filePath.trim().replace(/\\/g, '/');
  const attachmentPath = normalizedPath.match(/(?:^|\/)(uploads\/reports\/[^?#]+)/)?.[1];
  if (!attachmentPath) return '#';

  return `${api.defaults.baseURL.replace(/\/+$/, '')}/api/common/download_report.php?notification_id=${encodeURIComponent(notificationId)}`;
};

export default getAttachmentUrl;
