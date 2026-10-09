import axios from "axios";

const envBackendUrl = (typeof process !== "undefined" && process.env && process.env.REACT_APP_API_BASE_URL) || "";
const localhostBackendUrl = "http://localhost/student-placement/placement_backend";
const renderBackendUrl = "https://dtu-student-placement-system.onrender.com";

let baseUrl = envBackendUrl || renderBackendUrl;

if (typeof window !== "undefined") {
  const hostname = window.location.hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    baseUrl = localhostBackendUrl;
  }
}

const api = axios.create({
  baseURL: `${baseUrl.replace(/\/$/, "")}/`,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

export default api;