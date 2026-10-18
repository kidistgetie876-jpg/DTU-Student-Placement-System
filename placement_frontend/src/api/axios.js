import axios from 'axios';

const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
const backendHost = window.location.hostname === '::1' ? '[::1]' : window.location.hostname;
const localBaseUrl = `http://${backendHost}/student-placement/placement_backend`;
const defaultBaseUrl = 'https://placement-backend-21ap.onrender.com';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL || (isLocalhost ? localBaseUrl : defaultBaseUrl),
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
