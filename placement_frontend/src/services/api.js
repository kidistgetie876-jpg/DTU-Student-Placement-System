import axios from "axios";

const envBackendUrl = process.env.REACT_APP_API_BASE_URL || "";
const localhostBackendUrl = "http://localhost/student-placement/placement_backend";
const renderBackendUrl = "https://dtu-student-placement-system.onrender.com";

const BACKEND_URL = envBackendUrl || (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? localhostBackendUrl
  : renderBackendUrl);

const api = axios.create({
  baseURL: `${BACKEND_URL.replace(/\/$/, "")}/`,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

export default api;