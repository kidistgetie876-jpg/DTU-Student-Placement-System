const AUTH_STORAGE_KEYS = ['user', 'role', 'admission_number', 'token', 'accessToken', 'authToken'];
const PROTECTED_ROUTE_PATTERN = /^\/(?:admin-dashboard|registrar-dashboard|head-dashboard|student-dashboard|edit-user|edit-department|admin\/assign-head|student-registration|student-score-form)(?:\/|$)/;

export const handleUnauthorizedResponse = (error) => {
  const requestUrl = String(error?.config?.url || '');
  if (
    error?.response?.status !== 401
    || /(?:^|\/)auth\/login\.php(?:\?|$)/i.test(requestUrl)
    || !PROTECTED_ROUTE_PATTERN.test(window.location.pathname)
  ) {
    return;
  }

  if (window.location.pathname === '/login') {
    return;
  }

  AUTH_STORAGE_KEYS.forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
  sessionStorage.setItem(
    'authMessage',
    'Your session has expired. Please sign in again to continue.',
  );
  window.location.assign('/login');
};
