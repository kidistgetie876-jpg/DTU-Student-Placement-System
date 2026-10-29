import { handleUnauthorizedResponse } from './authSession.js';

describe('handleUnauthorizedResponse', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.pushState({}, '', '/');
    localStorage.setItem('user', JSON.stringify({ id: 1, role: 'student' }));
  });

  it('does not expire authentication while viewing the public homepage', () => {
    handleUnauthorizedResponse({
      config: { url: 'api/common/homepage_statistics.php' },
      response: { status: 401 },
    });

    expect(localStorage.getItem('user')).toBe(JSON.stringify({ id: 1, role: 'student' }));
    expect(sessionStorage.getItem('authMessage')).toBeNull();
  });

  it('does not expire authentication on other public pages', () => {
    window.history.pushState({}, '', '/services');

    handleUnauthorizedResponse({
      config: { url: 'api/common/public_services.php' },
      response: { status: 401 },
    });

    expect(localStorage.getItem('user')).toBe(JSON.stringify({ id: 1, role: 'student' }));
    expect(sessionStorage.getItem('authMessage')).toBeNull();
  });
});
