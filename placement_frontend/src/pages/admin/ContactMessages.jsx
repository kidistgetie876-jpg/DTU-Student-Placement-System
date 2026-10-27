import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../services/api.js';

const ContactMessages = () => {
  const [messages, setMessages] = useState([]);
  const [filter, setFilter] = useState('all');
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [replyMode, setReplyMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadMessages = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const filteredMessages = useMemo(() => messages.filter((message) => (
    filter === 'all' || String(message.status).toLowerCase() === filter
  )), [filter, messages]);

  const openMessage = async (message) => {
    setSuccess('');
    setSelectedMessage(message);
    setReplyText('');
    setReplyMode(false);
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
  const hasStudentIds = messages.some((message) => message.student_id);
  const closeMessage = () => {
    setSelectedMessage(null);
    setReplyText('');
    setReplyMode(false);
  };
  const sendReply = async () => {
    if (!selectedMessage || !replyText.trim() || sending) return;

    setSending(true);
    setError('');
    setSuccess('');
    try {
      const response = await api.post('api/admin/send_contact_reply.php', {
        recipient_email: selectedMessage.email,
        reply_text: replyText.trim(),
        message_id: selectedMessage.id,
      });
      if (response.data?.success !== true) {
        throw new Error(response.data?.message || 'Unable to send the reply.');
      }

      const updatedMessage = {
        ...selectedMessage,
        status: 'Replied',
        admin_reply: replyText.trim(),
      };
      setMessages((current) => current.map((item) => (
        String(item.id) === String(selectedMessage.id) ? updatedMessage : item
      )));
      setSelectedMessage(updatedMessage);
      if (response.data.email_sent === true) {
        setSuccess(response.data.message || 'Email sent and reply recorded.');
        closeMessage();
      } else {
        setError(response.data.message || 'Reply was saved, but the email could not be sent. You can retry after checking SMTP configuration.');
      }
    } catch (sendError) {
      setError(sendError.response?.data?.message || sendError.message || 'Unable to send the reply.');
    } finally {
      setSending(false);
    }
  };

  const deleteMessage = async (message) => {
    if (deletingId !== null || !window.confirm('Delete this contact message? This cannot be undone.')) return;

    setDeletingId(message.id);
    setError('');
    setSuccess('');
    try {
      const response = await api.post('api/admin/delete_contact_message.php', { id: message.id });
      if (response.data?.success !== true) {
        throw new Error(response.data?.message || 'Unable to delete the contact message.');
      }

      setMessages((current) => current.filter((item) => String(item.id) !== String(message.id)));
      setSuccess(response.data.message || 'Contact message deleted.');
      if (String(selectedMessage?.id) === String(message.id)) closeMessage();
    } catch (deleteError) {
      setError(deleteError.response?.data?.message || deleteError.message || 'Unable to delete the contact message.');
    } finally {
      setDeletingId(null);
    }
  };

  const messageStatus = (status) => {
    const normalizedStatus = String(status).toLowerCase();
    if (normalizedStatus === 'unread') return { label: 'Unread', className: 'text-bg-warning' };
    if (normalizedStatus === 'replied') return { label: 'Replied', className: 'text-bg-success' };
    return { label: 'Read', className: 'text-bg-secondary' };
  };

  return (
    <section className="card shadow-sm border-0">
      <div className="card-body p-3 p-md-4">
        <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-3 mb-4">
          <div>
            <h3 className="h4 fw-bold mb-1">Contact Messages</h3>
            <p className="text-muted mb-0">Public contact messages received by the System Administrator.</p>
          </div>
          <div className="d-flex align-items-center gap-2">
            <span className="badge rounded-pill text-bg-warning">{unreadCount} unread</span>
            <button type="button" className="btn btn-outline-primary btn-sm" onClick={loadMessages} disabled={loading}>
              Refresh
            </button>
          </div>
        </div>

        {error && <div className="alert alert-danger py-2" role="alert">{error}</div>}
        {success && <div className="alert alert-success py-2" role="status">{success}</div>}

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
            <option value="replied">Replied</option>
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
                  {hasStudentIds && <th scope="col">Student ID</th>}
                  <th scope="col">Subject</th>
                  <th scope="col">Received</th>
                  <th scope="col"><span className="visually-hidden">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {filteredMessages.map((message) => {
                  const unread = String(message.status).toLowerCase() === 'unread';
                  const status = messageStatus(message.status);
                  return (
                    <tr key={message.id}>
                      <td><span className={`badge ${status.className}`}>{status.label}</span></td>
                      <td className={unread ? 'fw-semibold' : ''}>{message.full_name}</td>
                      <td><a href={`mailto:${message.email}`}>{message.email}</a></td>
                      {hasStudentIds && <td>{message.student_id || '—'}</td>}
                      <td>{message.subject}</td>
                      <td>{message.created_at ? new Date(message.created_at).toLocaleString() : '—'}</td>
                      <td className="text-nowrap">
                        <button type="button" className="btn btn-sm btn-outline-primary text-nowrap" onClick={() => openMessage(message)}>
                          View message
                        </button>
                        {' '}
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => deleteMessage(message)}
                          disabled={deletingId !== null}
                        >
                          {String(deletingId) === String(message.id) ? 'Deleting...' : 'Delete'}
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
            if (event.target === event.currentTarget && !updating && !sending) closeMessage();
          }}
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
        >
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <div>
                  <span className={`badge mb-2 ${messageStatus(selectedMessage.status).className}`}>
                    {messageStatus(selectedMessage.status).label}
                  </span>
                  <h2 className="modal-title fs-5 fw-bold" id="contact-message-title">{selectedMessage.subject}</h2>
                </div>
                <button type="button" className="btn-close" aria-label="Close" onClick={closeMessage} disabled={updating || sending} />
              </div>
              <div className="modal-body">
                {updating && <div className="small text-muted mb-3" role="status">Updating message status...</div>}
                <dl className="row mb-4">
                  <dt className="col-sm-3">From</dt>
                  <dd className="col-sm-9">{selectedMessage.full_name}</dd>
                  <dt className="col-sm-3">Email</dt>
                  <dd className="col-sm-9"><a href={`mailto:${selectedMessage.email}`}>{selectedMessage.email}</a></dd>
                  {selectedMessage.student_id && (
                    <>
                      <dt className="col-sm-3">Student ID</dt>
                      <dd className="col-sm-9">{selectedMessage.student_id}</dd>
                    </>
                  )}
                  <dt className="col-sm-3">Received</dt>
                  <dd className="col-sm-9">{selectedMessage.created_at ? new Date(selectedMessage.created_at).toLocaleString() : '—'}</dd>
                </dl>
                <h3 className="h6 fw-bold">Message</h3>
                <p className="mb-0 text-break" style={{ whiteSpace: 'pre-wrap' }}>{selectedMessage.message}</p>
                {replyMode && (
                  <div className="mt-4">
                    <label className="form-label fw-semibold" htmlFor="contact-message-reply">Your reply</label>
                    <textarea
                      id="contact-message-reply"
                      className="form-control"
                      rows={5}
                      maxLength={10000}
                      value={replyText}
                      onChange={(event) => setReplyText(event.target.value)}
                      placeholder="Write your response to the sender..."
                    />
                    <p className="form-text mb-0">Your reply will be sent to {selectedMessage.email}.</p>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                {replyMode ? (
                  <>
                    <button type="button" className="btn btn-outline-secondary" onClick={() => setReplyMode(false)} disabled={sending}>Cancel reply</button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={sendReply}
                      disabled={!replyText.trim() || sending}
                    >
                      {sending ? 'Sending...' : 'Send Reply'}
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn btn-primary" onClick={() => setReplyMode(true)} disabled={!selectedMessage.email}>
                    Reply
                  </button>
                )}
                <button type="button" className="btn btn-secondary" onClick={closeMessage} disabled={updating || sending}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default ContactMessages;
