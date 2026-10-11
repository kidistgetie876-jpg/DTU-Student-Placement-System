import axios from "axios";

const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);

const BACKEND_URL = isLocalhost
  ? "http://localhost/student-placement/placement_backend"
  : "https://dtu-student-placement-system.onrender.com";

const api = axios.create({
  baseURL: BACKEND_URL,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

export default api;