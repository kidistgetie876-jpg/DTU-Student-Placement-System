const AUTH_STORAGE_KEYS = ['user', 'role', 'admission_number', 'token', 'accessToken', 'authToken'];

export const handleUnauthorizedResponse = (error) => {
  const requestUrl = String(error?.config?.url || '');
  if (error?.response?.status !== 401 || /(?:^|\/)auth\/login\.php(?:\?|$)/i.test(requestUrl)) {
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
