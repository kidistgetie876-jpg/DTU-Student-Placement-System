import axios from "axios";

// Localhost ላይ መሆኑን ወይም Render ላይ መሆኑን ይለያል
const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

// Localhost ከሆነ የ xampp/local URL፣ Render ከሆነ ደግሞ የ Render Backend URL ይጠቀማል
const BACKEND_URL = isLocalhost
  ? "http://localhost/student-placement/placement_backend"
  : "https://dtu-student-placement-system.onrender.com/"; // <-- የ Render Backend URL-ሽን እዚህ ጋር ተኪ

const api = axios.create({
  baseURL: `${BACKEND_URL}/`,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

export default api;