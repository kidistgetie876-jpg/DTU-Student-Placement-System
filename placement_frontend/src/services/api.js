import axios from "axios";
import { handleUnauthorizedResponse } from "./authSession.js";

const frontendHost = window.location.hostname;
const apiHost = frontendHost === "::1" ? "[::1]" : frontendHost;
const localBaseUrl = `http://${apiHost}:8888/student-placement/placement_backend/`;

const api = axios.create({
  baseURL: localBaseUrl,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  withCredentials: true, // ለ MAMP Session/Cookie በጣም አስፈላጊ ነው
});

api.interceptors.request.use(
  (config) => {
    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
      config.headers.delete('Content-Type');
    }
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

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
