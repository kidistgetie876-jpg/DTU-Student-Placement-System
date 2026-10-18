import axios from "axios";

// ፖርት 8888 ን በማጥፋት MAMP ወደሚሰራበት መደበኛ ሎካልሆስት እናስተካክለዋለን
const localBaseUrl =
  process.env.REACT_APP_LOCAL_API_BASE_URL ||
  `http://localhost/student-placement/placement_backend/`;

const api = axios.create({
  baseURL: localBaseUrl, // ሁልጊዜ ሎካልሆስት (MAMP) እንዲጠቀም እናስገድደዋለን
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  withCredentials: true, // ለ MAMP Session/Cookie በጣም አስፈላጊ ነው
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

export default api;
