import React, { useEffect, useMemo, useState } from "react";
import { FaSearch, FaBullhorn } from "react-icons/fa";
import api from '../../services/api.js';

const badgeStyles = {
  urgent: { background: "rgba(220, 53, 69, 0.12)", color: "#b42318" },
  high: { background: "rgba(215, 183, 90, 0.18)", color: "#7a5600" },
  normal: { background: "rgba(22, 163, 74, 0.12)", color: "#146c43" },
};

function Announcements() {
  const [query, setQuery] = useState("");
  const [announcementData, setAnnouncementData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;
    api.get('api/common/announcements_api.php')
      .then((response) => {
        const payload = response.data?.announcements ?? response.data ?? [];
        if (isMounted) setAnnouncementData(Array.isArray(payload) ? payload : []);
      })
      .catch(() => {
        if (isMounted) setError('Announcements are temporarily unavailable. Please try again later.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, []);

  const filteredAnnouncements = useMemo(() => {
    const search = query.trim().toLowerCase();

    if (!search) return announcementData;

    return announcementData.filter(
      (item) =>
        String(item.title || '').toLowerCase().includes(search) ||
        String(item.content || item.message || '').toLowerCase().includes(search) ||
        String(item.category || '').toLowerCase().includes(search) ||
        String(item.priority || '').toLowerCase().includes(search)
    );
  }, [announcementData, query]);

  return (
    <div className="container py-5 pt-5" style={{ maxWidth: "1100px", paddingTop: "40px" }}>
      <div className="text-center mb-4 pt-3">
        <span className="badge rounded-pill px-3 py-2 mb-3" style={{ background: "rgba(10, 45, 109, 0.08)", color: "#0a2d6d" }}>Official Notice Board</span>
        <h1 className="display-6 fw-bold mb-3" style={{ color: "#0a2d6d" }}>Announcements & Notices</h1>
        <p className="mx-auto text-muted" style={{ maxWidth: "760px" }}>
          Stay updated with placement dates, academic announcements, procedural notices, and official guidance from the university administration.
        </p>
      </div>

      <div className="card border-0 shadow-sm rounded-4 mb-4">
        <div className="card-body p-3 p-md-4">
          <div className="input-group input-group-lg">
            <span className="input-group-text bg-white border-end-0">
              <FaSearch className="text-muted" />
            </span>
            <input
              type="text"
              className="form-control border-start-0 shadow-none"
              placeholder="Search announcements, departments, or offices..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
      </div>

      {error && <div className="alert alert-warning" role="status">{error}</div>}

      <div className="d-flex flex-column gap-4">
        {loading ? (
          <div className="text-center text-muted py-5" role="status">Loading announcements...</div>
        ) : filteredAnnouncements.length > 0 ? (
          filteredAnnouncements.map((item) => (
            <div key={item.id} className="card border-0 shadow-sm rounded-4 overflow-hidden" style={{ background: "#ffffff" }}>
              <div className="card-body p-4">
                <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-start gap-3 mb-3">
                  <div className="d-flex align-items-center gap-3 flex-wrap">
                    {(() => {
                      const priority = String(item.priority || 'Normal');
                      const priorityStyle = badgeStyles[priority.toLowerCase()] || badgeStyles.normal;
                      return (
                    <span
                      className="badge rounded-pill px-3 py-2 fw-semibold"
                      style={priorityStyle}
                    >
                      {priority}
                    </span>
                      );
                    })()}
                    <div>
                      <h3 className="h4 fw-bold mb-1" style={{ color: "#0a2d6d" }}>{item.title}</h3>
                      <div className="text-muted small">
                        <span>{item.created_at ? new Date(item.created_at).toLocaleDateString() : 'Recently published'}</span>
                        <span className="mx-2">•</span>
                        <span>{item.category || 'Notice'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <p className="text-muted mb-0" style={{ lineHeight: 1.8 }}>
                  {item.content || item.message}
                </p>
                {item.deadline && <div className="small fw-semibold mt-3">Deadline: {new Date(`${item.deadline}T00:00:00`).toLocaleDateString()}</div>}
              </div>
            </div>
          ))
        ) : (
          <div className="card border-0 shadow-sm rounded-4">
            <div className="card-body p-5 text-center">
              <FaBullhorn className="mb-3" size={28} style={{ color: "#0a2d6d" }} />
              <h5 className="fw-bold" style={{ color: "#0a2d6d" }}>No matching announcements found.</h5>
              <p className="text-muted mb-0">Try searching for another keyword such as “deadline”, “orientation”, or “appeal”.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Announcements;
