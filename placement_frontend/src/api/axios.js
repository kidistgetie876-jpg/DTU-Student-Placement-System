import axios from 'axios';

const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
const localBaseUrl = 'http://localhost/student-placement/placement_backend';
const defaultBaseUrl = 'https://placement-backend-21ap.onrender.com';

const api = axios.create({
  baseURL: isLocalhost
    ? localBaseUrl
    : process.env.REACT_APP_API_BASE_URL || defaultBaseUrl,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

api.defaults.withCredentials = true;
axios.defaults.withCredentials = true;

export default api;
