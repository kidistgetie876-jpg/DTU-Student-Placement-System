import React, { useEffect, useMemo, useState } from 'react';
import api from '../../services/api.js';

const ContactMessages = () => {
  const [messages, setMessages] = useState([]);
  const [filter, setFilter] = useState('all');
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');

  const loadMessages = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('api/admin/get_contact_messages.php');
      if (response.data?.success !== true || !Array.isArray(response.data.messages)) {
        throw new Error(response.data?.message || 'Unable to load contact messages.');
      }
      setMessages(response.data.messages);
    } catch (loadError) {
      setError(loadError.response?.data?.message || loadError.message || 'Unable to load contact messages.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMessages();
  }, []);

  const filteredMessages = useMemo(() => messages.filter((message) => (
    filter === 'all' || String(message.status).toLowerCase() === filter
  )), [filter, messages]);

  const openMessage = async (message) => {
    setSelectedMessage(message);
    if (String(message.status).toLowerCase() !== 'unread') return;

    setUpdating(true);
    setError('');
    try {
      const response = await api.post('api/admin/mark_message_read.php', { id: message.id });
      if (response.data?.success !== true) {
        throw new Error(response.data?.message || 'Unable to mark the message as read.');
      }
      const updatedMessage = { ...message, status: 'read' };
      setMessages((current) => current.map((item) => (
        String(item.id) === String(message.id) ? updatedMessage : item
      )));
      setSelectedMessage(updatedMessage);
    } catch (updateError) {
      setError(updateError.response?.data?.message || updateError.message || 'Unable to mark the message as read.');
    } finally {
      setUpdating(false);
    }
  };

  const unreadCount = messages.filter((message) => String(message.status).toLowerCase() === 'unread').length;

  return (
    <section className="card shadow-sm border-0">
      <div className="card-body p-3 p-md-4">
        <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-3 mb-4">
          <div>
            <h3 className="h4 fw-bold mb-1">Contact Messages</h3>
            <p className="text-muted mb-0">Messages submitted through the public Contact Us form.</p>
          </div>
          <div className="d-flex align-items-center gap-2">
            <span className="badge rounded-pill text-bg-warning">{unreadCount} unread</span>
            <button type="button" className="btn btn-outline-primary btn-sm" onClick={loadMessages} disabled={loading}>
              Refresh
            </button>
          </div>
        </div>

        {error && <div className="alert alert-danger py-2" role="alert">{error}</div>}

        <div className="mb-3">
          <label className="form-label fw-semibold" htmlFor="contact-message-filter">Filter messages</label>
          <select
            id="contact-message-filter"
            className="form-select"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            style={{ maxWidth: '220px' }}
          >
            <option value="all">All</option>
            <option value="unread">Unread</option>
            <option value="read">Read</option>
          </select>
        </div>

        {loading ? (
          <div className="text-center text-muted py-5" role="status">Loading contact messages...</div>
        ) : filteredMessages.length === 0 ? (
          <div className="alert alert-light border mb-0">No {filter === 'all' ? '' : `${filter} `}contact messages found.</div>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th scope="col">Status</th>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Subject</th>
                  <th scope="col">Received</th>
                  <th scope="col"><span className="visually-hidden">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {filteredMessages.map((message) => {
                  const unread = String(message.status).toLowerCase() === 'unread';
                  return (
                    <tr key={message.id}>
                      <td><span className={`badge ${unread ? 'text-bg-warning' : 'text-bg-secondary'}`}>{unread ? 'Unread' : 'Read'}</span></td>
                      <td className={unread ? 'fw-semibold' : ''}>{message.full_name}</td>
                      <td><a href={`mailto:${message.email}`}>{message.email}</a></td>
                      <td>{message.subject}</td>
                      <td>{message.created_at ? new Date(message.created_at).toLocaleString() : '—'}</td>
                      <td>
                        <button type="button" className="btn btn-sm btn-outline-primary text-nowrap" onClick={() => openMessage(message)}>
                          View message
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedMessage && (
        <div
          className="modal d-block"
          role="dialog"
          aria-modal="true"
          aria-labelledby="contact-message-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !updating) setSelectedMessage(null);
          }}
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
        >
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <div>
                  <span className={`badge mb-2 ${selectedMessage.status === 'unread' ? 'text-bg-warning' : 'text-bg-secondary'}`}>
                    {selectedMessage.status === 'unread' ? 'Unread' : 'Read'}
                  </span>
                  <h2 className="modal-title fs-5 fw-bold" id="contact-message-title">{selectedMessage.subject}</h2>
                </div>
                <button type="button" className="btn-close" aria-label="Close" onClick={() => setSelectedMessage(null)} disabled={updating} />
              </div>
              <div className="modal-body">
                {updating && <div className="small text-muted mb-3" role="status">Updating message status...</div>}
                <dl className="row mb-4">
                  <dt className="col-sm-3">From</dt>
                  <dd className="col-sm-9">{selectedMessage.full_name}</dd>
                  <dt className="col-sm-3">Email</dt>
                  <dd className="col-sm-9"><a href={`mailto:${selectedMessage.email}`}>{selectedMessage.email}</a></dd>
                  <dt className="col-sm-3">Received</dt>
                  <dd className="col-sm-9">{selectedMessage.created_at ? new Date(selectedMessage.created_at).toLocaleString() : '—'}</dd>
                </dl>
                <h3 className="h6 fw-bold">Message</h3>
                <p className="mb-0 text-break" style={{ whiteSpace: 'pre-wrap' }}>{selectedMessage.message}</p>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setSelectedMessage(null)} disabled={updating}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default ContactMessages;
