import axios from "axios";

const apiOrigin = `${window.location.protocol}//${window.location.hostname}`;

const api = axios.create({
  baseURL: `${apiOrigin}/student-placement/placement_backend/`,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

export default api;