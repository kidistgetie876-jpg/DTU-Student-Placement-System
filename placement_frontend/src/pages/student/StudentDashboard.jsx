import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CalendarDays, CheckCheck, Clock3, MapPin, Megaphone } from 'lucide-react';
import api from '../../services/api.js';
import '../admin/AdminDashboard.css';
import './StudentDashboard.css';
import OfficialPrintLetterhead from '../../components/common/OfficialPrintLetterhead.jsx';
import Sidebar from '../../components/layout/Sidebar.jsx';
import DashboardHeader from '../../components/layout/DashboardHeader.jsx';
import StudentAppeal from './StudentAppeal.jsx';
import { useLanguage } from '../../contexts/LanguageContext.jsx';

export const parseYesNo = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  const normalized = String(value).trim().toLowerCase();
  return ['yes', 'y', 'true', '1', 'on'].includes(normalized);
};

const normalizeDepartmentsPayload = (payload) => {
  const topLevel = payload?.data ?? payload;
  if (Array.isArray(topLevel)) return topLevel.filter(Boolean);
  if (Array.isArray(topLevel?.departments)) return topLevel.departments.filter(Boolean);
  if (Array.isArray(topLevel?.data)) return topLevel.data.filter(Boolean);
  return [];
};

const isNotificationUnread = (notification) => {
  const readValue = notification.is_read ?? notification.read;
  if (typeof readValue === 'boolean') return !readValue;
  if (readValue !== null && readValue !== undefined) {
    return ['0', 'false', 'unread', 'no'].includes(String(readValue).trim().toLowerCase());
  }
  return String(notification.status || '').trim().toLowerCase() === 'unread';
};

const formatNotificationDate = (value) => {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

const isActiveDepartment = (department) => String(department?.status || '').trim().toLowerCase() === 'active';

const normalizeStream = (value) => {
  const stream = String(value || '').trim();
  const normalized = stream.toLowerCase().replace(/[^a-z]/g, '');
  if (/^(social|socialscience|socialsciences)$/i.test(normalized)) return 'Social';
  if (/^(natural|naturalscience|naturalsciences)$/i.test(normalized)) return 'Natural';
  return stream;
};

const normalizeCollege = (value) => String(value || '')
  .toLowerCase()
  .replace(/\b(college|school|institute)\s+of\s+/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const normalizeDepartmentName = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

const getDepartmentStream = (department) => {
  const rawStream = department?.stream || department?.academic_stream || department?.category;
  if (rawStream) return normalizeStream(rawStream);

  const college = String(department?.college_name || department?.college || department?.faculty || '').toLowerCase();
  const name = String(department?.name || '').toLowerCase();

  if (college.includes('business') || college.includes('economics') || college.includes('social') || college.includes('humanit') || college.includes('law')) return 'Social';
  if (college.includes('agric') || college.includes('health') || college.includes('engineer') || college.includes('natural') || college.includes('comput') || college.includes('environment')) return 'Natural';
  if (/biology|chemistry|physics|mathematics|computer|engineering|agric/.test(name)) return 'Natural';

  return 'Natural';
};

const formatGpaValue = (value) => {
  const numericValue = Number(value);
  return (value === null || value === undefined || Number.isNaN(numericValue)) ? '0.00' : numericValue.toFixed(2);
};

const getStudentGpa = (studentProfile) => studentProfile?.cgpa ?? studentProfile?.gpa;

const StudentDashboard = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTabState] = useState('overview');

  const setTab = (nextTab) => {
    if (nextTab === 'save-page') return;
    localStorage.setItem('activeTab', nextTab);
    setTabState(nextTab);
  };

  const [allDepartments, setAllDepartments] = useState([]);
  const [profile, setProfile] = useState(null);
  const [preferences, setPreferences] = useState({ stream: '', college: '', depts: [] });
  const [placementResult, setPlacementResult] = useState(null);
  const [preferencesSubmitted, setPreferencesSubmitted] = useState(false);
  const [prefError, setPrefError] = useState('');
  const [prefSuccess, setPrefSuccess] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState('');
  const [notificationFeedback, setNotificationFeedback] = useState('');
  const [markingNotification, setMarkingNotification] = useState(null);
  const [markingAllNotifications, setMarkingAllNotifications] = useState(false);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) { navigate('/login'); return; }
    const parsedUser = JSON.parse(storedUser);
    setStudent(parsedUser);

    const loadData = async () => {
      try {
        const resDepts = await api.get('api/common/departments_api.php');
        const dbDepts = normalizeDepartmentsPayload(resDepts.data);
        setAllDepartments(dbDepts.map((department) => ({
          ...department,
          stream: getDepartmentStream(department),
          college_name: department.college_name || department.college || department.faculty || '',
        })));

        const resProfile = await api.get(`api/student/student_data_api.php?student_id=${encodeURIComponent(parsedUser.id)}&email=${encodeURIComponent(parsedUser.email || '')}`);
        const studentData = resProfile?.data?.student || (Array.isArray(resProfile?.data?.students) ? resProfile.data.students[0] : null);
        if (resProfile?.data?.success && studentData) {
          setStudent((current) => ({ ...current, id_number: studentData.id_number || current?.id_number }));
          setProfile({
            ...studentData,
            disability: parseYesNo(studentData.disability),
            minority: parseYesNo(studentData.minority),
          });
        }

        const resPrefs = await api.get(`api/student/student_preferences.php?student_id=${encodeURIComponent(parsedUser.id)}`);
        const list = resPrefs.data?.choices || resPrefs.data?.data || [];
        if (resPrefs.data?.success && Array.isArray(list) && list.length > 0) {
          const savedDepts = list.map((item) => item.department_name || item.dept_name || item.name || '');
          setPreferences({
            stream: normalizeStream(list[0]?.stream || studentData?.stream || 'Natural'),
            college: list[0]?.college_name || '',
            depts: savedDepts
          });
          setPreferencesSubmitted(true);
        } else {
          setPreferences({
            stream: normalizeStream(studentData?.stream || 'Natural'),
            college: '',
            depts: []
          });
        }
      } catch (error) {
        console.error("Load Error:", error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [navigate]);

  useEffect(() => {
    if (!student?.id) return undefined;

    let isCurrent = true;
    let requestInProgress = false;
    const loadNotifications = async () => {
      if (requestInProgress) return;
      requestInProgress = true;
      try {
        const response = await api.get('api/student/get_student_notifications.php');
        if (!response.data?.success || !Array.isArray(response.data.notifications)) {
          throw new Error(response.data?.message || 'Unable to load notifications.');
        }
        if (isCurrent) {
          setNotifications(response.data.notifications);
          setNotificationsError('');
        }
      } catch (error) {
        if (isCurrent) {
          setNotificationsError(error.response?.data?.message || error.message || 'Unable to load notifications.');
          console.error('Unable to load student notifications:', error);
        }
      } finally {
        requestInProgress = false;
        if (isCurrent) setNotificationsLoading(false);
      }
    };

    setNotificationsLoading(true);
    loadNotifications();
    const intervalId = window.setInterval(loadNotifications, 60 * 1000);
    const refreshOnFocus = () => loadNotifications();
    window.addEventListener('focus', refreshOnFocus);
    return () => {
      isCurrent = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshOnFocus);
    };
  }, [student?.id]);

  useEffect(() => {
    if (!['overview', 'result', 'appeal'].includes(tab) || !student?.id) return;
    const loadPlacementResult = async () => {
      try {
        const response = await api.get(`api/student/get_student_result.php?student_id=${encodeURIComponent(student.id)}`);
        setPlacementResult(response.data?.success ? response.data : null);
      } catch (error) {
        setPlacementResult(null);
      }
    };
    loadPlacementResult();
  }, [student, tab]);

  const markNotificationRead = async (notification) => {
    if (!isNotificationUnread(notification)) return;
    const notificationType = notification.notification_type || 'general';
    const notificationKey = `${notificationType}-${notification.id}`;
    setNotificationFeedback(null);
    setMarkingNotification(notificationKey);
    try {
      const payload = { notification_id: Number(notification.id) };
      if (notification.notification_type) payload.notification_type = notificationType;
      const response = await api.post('api/student/mark_notification_read.php', payload);
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to mark notification as read.');
      }
      setNotifications((current) => current.map((item) => (
        String(item.id) === String(notification.id)
          && (item.notification_type || 'general') === notificationType
          ? { ...item, is_read: 1, read: true }
          : item
      )));
      setNotificationFeedback({
        type: 'success',
        message: response.data.message || 'Notification marked as read.',
      });
    } catch (error) {
      setNotificationFeedback({
        type: 'danger',
        message: error.response?.data?.message || error.message || 'Unable to mark notification as read.',
      });
    } finally {
      setMarkingNotification(null);
    }
  };

  const markAllNotificationsRead = async () => {
    setNotificationFeedback(null);
    setMarkingAllNotifications(true);
    try {
      const response = await api.post('api/student/mark_all_notifications_read.php');
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to mark notifications as read.');
      }
      setNotifications((current) => current.map((item) => ({ ...item, is_read: 1, read: true })));
      setNotificationFeedback({
        type: 'success',
        message: response.data.message || 'All notifications marked as read.',
      });
    } catch (error) {
      setNotificationFeedback({
        type: 'danger',
        message: error.response?.data?.message || error.message || 'Unable to mark notifications as read.',
      });
    } finally {
      setMarkingAllNotifications(false);
    }
  };

  const collegeOptions = useMemo(() => {
    const streamToFilter = preferences.stream || normalizeStream(profile?.stream || 'Natural');
    const tableColleges = allDepartments
      .filter((department) => isActiveDepartment(department) && department.stream === streamToFilter)
      .map((department) => department.college_name)
      .filter(Boolean);
    return [...new Set(tableColleges)];
  }, [allDepartments, preferences.stream, profile]);

  const departmentOptions = useMemo(() => {
    const streamToFilter = preferences.stream || normalizeStream(profile?.stream || 'Natural');
    return allDepartments
      .filter((department) => (
        isActiveDepartment(department) &&
        department.stream === streamToFilter &&
        normalizeCollege(department.college_name) === normalizeCollege(preferences.college)
      ))
      .map(d => d.name);
  }, [allDepartments, preferences.college, preferences.stream, profile]);

  const handleChoiceChange = (idx, value) => {
    const selectedKey = normalizeDepartmentName(value);
    setPreferences((current) => {
      const newDepts = current.depts.map((name, selectedIndex) => (
        selectedIndex !== idx && normalizeDepartmentName(name) === selectedKey ? '' : name
      ));
      newDepts[idx] = value;
      return { ...current, depts: newDepts };
    });
    setPrefError('');
    setPrefSuccess('');
  };

  const handleSave = async () => {
    setPrefError('');
    setPrefSuccess('');

    if (!preferences.college) {
      setPrefError('Please select a college first.');
      return;
    }

    if (departmentOptions.length === 0) {
      setPrefError('There are no active departments available for the selected college.');
      return;
    }

    const rankedDepartments = preferences.depts.slice(0, departmentOptions.length);
    const missingChoiceIndexes = departmentOptions
      .map((_, index) => index)
      .filter((index) => !String(rankedDepartments[index] ?? '').trim());
    if (missingChoiceIndexes.length > 0) {
      const missingChoices = missingChoiceIndexes.map((index) => `Choice #${index + 1}`).join(', ');
      setPrefError(`Please select a department for every required choice. Missing: ${missingChoices}.`);
      return;
    }

    const selectedDepartmentKeys = rankedDepartments.map(normalizeDepartmentName);
    if (new Set(selectedDepartmentKeys).size !== selectedDepartmentKeys.length) {
      setPrefError('Each department can only be selected once. Please choose a different department for every choice.');
      return;
    }

    const formattedChoices = rankedDepartments.map((name, index) => {
      const dbDept = allDepartments.find((department) => department.name === name
        && isActiveDepartment(department)
        && department.stream === (preferences.stream || normalizeStream(profile?.stream || 'Natural'))
        && normalizeCollege(department.college_name) === normalizeCollege(preferences.college));
      const departmentId = Number(dbDept?.id);
      return Number.isSafeInteger(departmentId) && departmentId > 0
        ? { dept_id: departmentId, priority: index + 1 }
        : null;
    });

    if (formattedChoices.some((choice) => choice === null)) {
      setPrefError('One or more selected departments are no longer available. Please review your choices and try again.');
      return;
    }

    const admissionNumber = profile?.admission_number || profile?.id_number || student?.id_number;
    const studentIdentifier = [profile?.user_id, profile?.id, student?.id]
      .find((identifier) => /^\d+$/.test(String(identifier ?? ''))
        && String(identifier) !== String(admissionNumber || ''))
      || admissionNumber
      || [profile?.user_id, profile?.id, student?.id].find(Boolean);
    const studentId = studentIdentifier == null ? '' : String(studentIdentifier);
    if (!studentId) {
      setPrefError('Unable to identify your student account. Please sign in again before submitting preferences.');
      return;
    }

    try {
      const res = await api.post('api/student/student_preferences.php', {
        student_id: studentId,
        choices: formattedChoices
      });
      if (res.data?.success) {
        setPreferencesSubmitted(true);
        setPrefSuccess(res.data.message || 'Preferences submitted successfully!');
      } else {
        setPrefError(res.data?.message || 'Unable to save preferences.');
      }
    } catch (error) {
      setPrefError(error.response?.data?.message || error.message || 'Unable to save preferences.');
    }
  };

  if (loading) return <div className="text-center mt-5 p-5">Loading DTU Portal...</div>;

  return (
    <div className="admin-dashboard student-dashboard container-fluid px-0">
      <OfficialPrintLetterhead
        office="ADMISSIONS & REGISTRAR OFFICE"
        title="OFFICIAL STUDENT DASHBOARD RECORD"
        metadata="Academic Year: 2016 E.C. / 2026 G.C."
      />
      <div className="row g-0">
        <Sidebar
          role="student"
          activeItem={tab}
          onSelect={setTab}
          notificationCount={notifications.filter(isNotificationUnread).length}
        />

        <main className="col-md-10 p-4 p-md-5 main-content">
          <DashboardHeader
            variant="welcome"
            username={student?.username}
            role="Student"
            greeting="Welcome"
            subtitle="Preferences, placement results, and student updates."
            profileDetail={`ID: ${student?.id_number || student?.id || 'N/A'}`}
            dashboardPath="/student-dashboard"
          />

          {/* OVERVIEW TAB */}
          {tab === 'overview' && (
            <div className="row g-4 mt-2">
              <div className="col-md-3">
                <div className="card border-0 shadow-sm rounded-4 p-3 bg-primary text-white">
                  <h6>CGPA</h6>
                  <h4>{formatGpaValue(getStudentGpa(profile))}</h4>
                </div>
              </div>
              <div className="col-md-3">
                <div className="card border-0 shadow-sm rounded-4 p-3 bg-success text-white">
                  <h6>Stream</h6>
                  <h4>{profile?.stream || 'Natural'}</h4>
                </div>
              </div>
              <div className="col-md-3">
                <div className="card border-0 shadow-sm rounded-4 p-3 bg-info text-white">
                  <h6>Status</h6>
                  <h4>{profile?.status || 'Pending'}</h4>
                </div>
              </div>
              <div className="col-md-3">
                <div className="card border-0 shadow-sm rounded-4 p-3 bg-warning text-dark">
                  <h6>Total Mark</h6>
                  <h4>{profile?.total_mark || profile?.grade_12_result || 'N/A'}</h4>
                </div>
              </div>
            </div>
          )}

          {/* SUBMIT PREFERENCES TAB */}
          {tab === 'preferences' && (
            <div className="card border-0 shadow-sm rounded-4 p-4 mt-3 bg-white">
              <h4 className="fw-bold mb-3 text-primary">Department Preferences Submission</h4>
              
              {prefError && <div className="alert alert-danger" role="alert">{prefError}</div>}
              {prefSuccess && <div className="alert alert-success" role="status">{prefSuccess}</div>}

              <div className="row g-3 mb-4">
                <div className="col-md-6">
                  <label className="form-label fw-semibold">Academic Stream</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={preferences.stream || profile?.stream || 'Natural'} 
                    disabled 
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label fw-semibold">Select College</label>
                  <select 
                    className="form-select"
                    value={preferences.college}
                    onChange={(e) => setPreferences({ ...preferences, college: e.target.value, depts: [] })}
                  >
                    <option value="">-- Choose College --</option>
                    {collegeOptions.map((college, idx) => (
                      <option key={idx} value={college}>{college}</option>
                    ))}
                  </select>
                </div>
              </div>

              {preferences.college && (
                <div>
                  <h5 className="fw-semibold mb-3">Rank Departments (Priority Order)</h5>
                  {departmentOptions.length === 0 ? (
                    <p className="text-muted">No active departments found for this college.</p>
                  ) : (
                    departmentOptions.map((_, index) => {
                      const selectedInOtherChoices = new Set(preferences.depts.filter((name, selectedIndex) => (
                        selectedIndex !== index && name
                      )).map(normalizeDepartmentName));
                      const availableDepartments = departmentOptions.filter((name) => (
                        normalizeDepartmentName(name) === normalizeDepartmentName(preferences.depts[index])
                        || !selectedInOtherChoices.has(normalizeDepartmentName(name))
                      ));
                      return (
                        <div className="mb-3 row align-items-center" key={index}>
                          <label className="col-sm-2 col-form-label fw-bold">Choice #{index + 1}:</label>
                          <div className="col-sm-10">
                            <select 
                              className="form-select"
                              value={preferences.depts[index] || ''}
                              onChange={(e) => handleChoiceChange(index, e.target.value)}
                            >
                              <option value="">-- Select Department --</option>
                              {availableDepartments.map((deptName, dIdx) => (
                                <option key={dIdx} value={deptName}>{deptName}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      );
                    })
                  )}

                  <button 
                    className="btn btn-primary px-4 py-2 rounded-3 mt-3"
                    onClick={handleSave}
                  >
                    {preferencesSubmitted ? 'Update Preferences' : 'Submit Preferences'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* PLACEMENT RESULT TAB */}
          {tab === 'result' && (
            <div className="card border-0 shadow-sm rounded-4 p-4 mt-3 bg-white">
              <h4 className="fw-bold mb-3 text-success">Official Placement Result</h4>
              {placementResult?.student?.department ? (
                <div>
                  <p className="fs-5">Congratulations! You are assigned to:</p>
                  <h3 className="text-primary fw-bold">{placementResult.student.department}</h3>
                  <p>Status: <span className="badge bg-success">{placementResult.student.status}</span></p>
                </div>
              ) : (
                <p className="text-muted">Placement results have not been published yet.</p>
              )}
            </div>
          )}

          {tab === 'appeal' && (
            <StudentAppeal
              studentId={[profile?.user_id, profile?.id, student?.id].find((id) => /^\d+$/.test(String(id || '')))}
              placement={placementResult?.student}
            />
          )}

          {tab === 'notifications' && (
            <section className="student-notifications mt-3" aria-labelledby="student-notifications-title">
              <div className="student-notifications-heading">
                <div>
                  <span className="student-section-eyebrow">STUDENT UPDATES</span>
                  <h2 id="student-notifications-title">Notifications</h2>
                  <p>Important placement and registrar updates, all in one place.</p>
                </div>
                <div className="student-notification-summary" aria-live="polite">
                  <Bell size={19} aria-hidden="true" />
                  <span><strong>{notifications.filter(isNotificationUnread).length}</strong> unread</span>
                </div>
              </div>

              <div className="student-notification-toolbar">
                <span>{notifications.length} {notifications.length === 1 ? 'notification' : 'notifications'}</span>
                {notifications.some(isNotificationUnread) && (
                  <button
                    type="button"
                    className="student-mark-all-button"
                    onClick={markAllNotificationsRead}
                    disabled={markingAllNotifications}
                  >
                    <CheckCheck size={17} aria-hidden="true" />
                    {markingAllNotifications ? 'Marking…' : 'Mark all as read'}
                  </button>
                )}
              </div>

              {notificationFeedback && (
                <div className={`student-notification-feedback is-${notificationFeedback.type}`} role={notificationFeedback.type === 'danger' ? 'alert' : 'status'}>
                  {notificationFeedback.message}
                </div>
              )}
              {notificationsError && (
                <div className="alert alert-danger" role="alert">{notificationsError}</div>
              )}
              {notificationsLoading ? (
                <div className="student-notification-empty" role="status">Loading your notifications…</div>
              ) : notifications.length === 0 && !notificationsError ? (
                <div className="student-notification-empty">
                  <span className="student-notification-empty-icon"><Bell size={24} aria-hidden="true" /></span>
                  <h3>You’re all caught up</h3>
                  <p>New placement and registrar updates will appear here.</p>
                </div>
              ) : (
                <div className="student-notification-list">
                  {notifications.map((notification) => {
                    const unread = isNotificationUnread(notification);
                    const notificationType = notification.notification_type || 'general';
                    const key = `${notificationType}-${notification.id}`;
                    return (
                      <article className={`student-notification-card${unread ? ' is-unread' : ''}`} key={key}>
                        <div className="student-notification-icon" aria-hidden="true">
                          {notificationType === 'meeting' ? <CalendarDays size={20} /> : <Megaphone size={20} />}
                        </div>
                        <div className="student-notification-content">
                          <div className="student-notification-title-row">
                            <h3>{notification.title || 'Placement update'}</h3>
                            {unread && <span className="student-unread-label">New</span>}
                          </div>
                          {notification.message && <p>{notification.message}</p>}
                          <div className="student-notification-meta">
                            <span><Clock3 size={15} aria-hidden="true" />{formatNotificationDate(notification.created_at)}</span>
                            {notification.meeting_date && (
                              <span><CalendarDays size={15} aria-hidden="true" />{notification.meeting_date}{notification.meeting_time ? ` · ${notification.meeting_time}` : ''}</span>
                            )}
                            {notification.location && (
                              <span><MapPin size={15} aria-hidden="true" />{notification.location}</span>
                            )}
                          </div>
                        </div>
                        {unread && (
                          <button
                            type="button"
                            className="student-mark-read-button"
                            onClick={() => markNotificationRead(notification)}
                            disabled={markingNotification === key}
                          >
                            {markingNotification === key ? 'Marking…' : 'Mark as read'}
                          </button>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </main>
      </div>
    </div>
  );
};

export default StudentDashboard;