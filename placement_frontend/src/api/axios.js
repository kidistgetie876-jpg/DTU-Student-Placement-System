import axios from 'axios';
import { handleUnauthorizedResponse } from '../services/authSession.js';

const frontendHost = window.location.hostname;
const apiHost = frontendHost === '127.0.0.1'
  ? '127.0.0.1'
  : frontendHost === '::1'
    ? '[::1]'
    : frontendHost === 'localhost'
      ? 'localhost'
      : '127.0.0.1';
const localBaseUrl = `http://${apiHost}:8888/student-placement/placement_backend`;

const api = axios.create({
  baseURL: localBaseUrl,
  timeout: 15000,
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

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isCancel(error)) return Promise.reject(error);

    handleUnauthorizedResponse(error);

    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      error.message = 'The server took too long to respond. Please try again.';
    } else if (!error.response) {
      error.message = 'Unable to reach the local server. Check that MAMP is running.';
    }

    return Promise.reject(error);
  },
);

export default api;
