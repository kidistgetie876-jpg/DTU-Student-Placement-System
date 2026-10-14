import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api.js';
import getAttachmentUrl from '../../utils/getAttachmentUrl';
import StudentAppeal from './StudentAppeal';
import '../admin/AdminDashboard.css';
import OfficialPrintLetterhead from '../../components/common/OfficialPrintLetterhead.jsx';
import Sidebar from '../../components/layout/Sidebar.jsx';
import DashboardHeader from '../../components/layout/DashboardHeader.jsx';
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

const isNotificationUnread = (notification) => (
  notification.is_read === false ||
  (notification.is_read !== null && notification.is_read !== undefined && Number(notification.is_read) === 0) ||
  notification.read === false ||
  String(notification.status || '').toLowerCase() === 'unread'
);

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

const normalizeAssignmentStatus = (value) => {
  const rawStatus = String(value ?? '').trim();
  if (!rawStatus || rawStatus.toLowerCase() === 'null') return '';

  const normalized = rawStatus.toLowerCase();
  if (['not assigned', 'notassigned', 'unassigned'].includes(normalized)) return 'Not assigned';
  if (['assigned', 'placed'].includes(normalized)) return 'Assigned';
  if (['approved', 'published'].includes(normalized)) return 'Approved';
  if (['pending', 'under review', 'in review'].includes(normalized)) return 'Pending';

  return rawStatus;
};

const isUnassignedAssignment = (status, department) => {
  const hasStatus = status !== null && status !== undefined;
  const hasDepartment = department !== undefined;

  if (!hasStatus && !hasDepartment) return false;
  if (department === null) return true;

  const normalizedStatus = hasStatus ? normalizeAssignmentStatus(status) : '';
  const normalizedDepartment = hasDepartment ? String(department ?? '').trim().toLowerCase() : '';

  if (normalizedStatus === 'Not assigned') return true;
  if (hasDepartment && (
    normalizedDepartment === '' ||
    normalizedDepartment === 'null' ||
    ['not assigned', 'notassigned', 'unassigned'].includes(normalizedDepartment)
  )) return true;

  return false;
};

const formatScoreValue = (value) => {
  if (value === null || value === undefined || value === '' || String(value).toUpperCase() === 'N/A') return 'N/A';
  const numericValue = Number(value);
  return Number.isNaN(numericValue) ? String(value) : numericValue.toFixed(2);
};

const getOverviewDetailRows = (metric, profileData, placementData, minimumGpa) => {
  const gpa = profileData.gpa ?? profileData.cgpa;
  const grade12 = profileData.grade_12_result ?? profileData.grade12 ?? profileData.grade_12;
  const coc = profileData.coc_result ?? profileData.coc;
  const placement = placementData?.placement;
  const score = placement?.merit_score
    ?? placement?.final_score
    ?? profileData.cumulative_avg
    ?? profileData.cumulative_score;
  const assignmentStatus = placementData?.student?.status ?? profileData.status;

  const detailsByMetric = {
    gpa: [
      ['Student ID', profileData.id_number],
      ['GPA', formatScoreValue(gpa)],
      ['Minimum GPA', formatScoreValue(minimumGpa)],
      ['Eligibility', Number(gpa || 0) >= minimumGpa ? 'Meets GPA requirement' : 'Below GPA requirement'],
      ['Academic status', profileData.status],
    ],
    grade12: [
      ['Grade 12 result', formatScoreValue(grade12)],
      ['GPA', formatScoreValue(gpa)],
      ['COC result', formatScoreValue(coc)],
      ['Stream', profileData.stream],
    ],
    coc: [
      ['COC result', formatScoreValue(coc)],
      ['GPA', formatScoreValue(gpa)],
      ['Grade 12 result', formatScoreValue(grade12)],
      ['Stream', profileData.stream],
    ],
    stream: [
      ['Registered stream', profileData.stream],
      ['Academic status', profileData.status],
      ['Assigned department', placement?.assigned_department || profileData.department],
      ['Placement status', assignmentStatus],
    ],
    finalScore: [
      ['Final score', formatScoreValue(score)],
      ['Score source', placement ? 'Placement result' : 'Current cumulative score'],
      ['GPA', formatScoreValue(gpa)],
      ['Grade 12 result', formatScoreValue(grade12)],
      ['COC result', formatScoreValue(coc)],
      ['Placement status', assignmentStatus],
    ],
  };

  return detailsByMetric[metric] || [];
};

const hasSubmissionDeadlinePassed = (submissionDeadline, currentTime = new Date()) => {
  if (!submissionDeadline) return false;
  const deadline = new Date(submissionDeadline);
  if (Number.isNaN(deadline.getTime())) return false;
  deadline.setHours(23, 59, 59, 999);
  return currentTime > deadline;
};

const StudentDashboard = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  
  const [allDepartments, setAllDepartments] = useState([]); 
  const [profile, setProfile] = useState(null);
  const [overviewDetail, setOverviewDetail] = useState(null);
  const [overviewDetailLoading, setOverviewDetailLoading] = useState(false);
  const [overviewDetailError, setOverviewDetailError] = useState('');
  const [placementRules, setPlacementRules] = useState({ minGpa: 1.75 });
  const [preferences, setPreferences] = useState({ stream: '', college: '', depts: [] });
  const [savedPreferences, setSavedPreferences] = useState({ stream: '', college: '', depts: [] });
  const [submittedChoices, setSubmittedChoices] = useState([]);
  const [placementResult, setPlacementResult] = useState(null);
  const [placementResultLoading, setPlacementResultLoading] = useState(false);
  const [preferencesSubmitted, setPreferencesSubmitted] = useState(false);
  const [submissionDeadline, setSubmissionDeadline] = useState('');
  const [deadlineClock, setDeadlineClock] = useState(Date.now());
  const [prefError, setPrefError] = useState('');
  const [prefSuccess, setPrefSuccess] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState('');
  const [notificationsReadFeedback, setNotificationsReadFeedback] = useState(null);
  const [markingNotificationsRead, setMarkingNotificationsRead] = useState(false);
  const [markingNotificationId, setMarkingNotificationId] = useState(null);

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
            disability: parseYesNo(studentData.disability ?? studentData.has_disability ?? studentData.hasDisability ?? studentData.specialSupport),
            minority: parseYesNo(studentData.minority ?? studentData.is_minority ?? studentData.isMinority),
          });
        } else {
          setProfile({ fullname: '', email: '', cgpa: 0, gpa: 0, stream: '', status: 'Pending', disability: false, minority: false });
        }

        try {
          const rulesResponse = await api.get('api/registrar/get_placement_settings.php');
          setPlacementRules({ minGpa: Number(rulesResponse.data?.min_gpa ?? 1.75) });
        } catch (error) {
          setPlacementRules({ minGpa: 1.75 });
        }

        const resPrefs = await api.get(`api/student/student_preferences.php?student_id=${parsedUser.id}`);
        const list = resPrefs.data?.choices || resPrefs.data?.data || [];
        if (resPrefs.data?.success && Array.isArray(list) && list.length > 0) {
          const saved = list;
          const savedDepts = saved.map((item) => item.department_name || item.name || item.department || item.dept_name || '');
          const nextSavedPreferences = {
            stream: normalizeStream(saved[0].stream),
            college: saved[0].college_name || saved[0].college || '',
            depts: savedDepts
          };

          setSubmittedChoices(list);
          setPreferences(nextSavedPreferences);
          setSavedPreferences(nextSavedPreferences);
          setPreferencesSubmitted(true);
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
    let isMounted = true;
    const loadSubmissionDeadline = async () => {
      try {
        const response = await api.get('api/common/system_settings_api.php');
        if (isMounted) {
          setSubmissionDeadline(response.data?.settings?.placement?.submissionDeadline || '');
          setDeadlineClock(Date.now());
        }
      } catch (error) {
        // Keep the last known deadline if settings cannot be refreshed.
      }
    };

    loadSubmissionDeadline();
    window.addEventListener('system-settings-updated', loadSubmissionDeadline);
    const refreshInterval = window.setInterval(loadSubmissionDeadline, 15000);
    const deadlineClockInterval = window.setInterval(() => setDeadlineClock(Date.now()), 10000);

    return () => {
      isMounted = false;
      window.removeEventListener('system-settings-updated', loadSubmissionDeadline);
      window.clearInterval(refreshInterval);
      window.clearInterval(deadlineClockInterval);
    };
  }, []);

  const isDeadlinePassed = useMemo(() => (
    hasSubmissionDeadlinePassed(submissionDeadline, new Date(deadlineClock))
  ), [submissionDeadline, deadlineClock]);
  const studentGpa = Number(profile?.gpa || profile?.cgpa || 0);
  const studentStatus = String(profile?.status || '').toUpperCase();
  const minimumGpa = Number(placementRules.minGpa || 1.75);
  const isIneligible = studentGpa < minimumGpa ||
    studentStatus === 'NG' ||
    studentStatus === 'DISMISSED' ||
    studentStatus === 'INELIGIBLE';
  const hasPlacementStudent = Boolean(placementResult?.student);
  const assignmentStatus = hasPlacementStudent
    ? placementResult.student.status ?? placementResult.placement?.placement_status
    : profile?.status ?? placementResult?.placement?.placement_status;
  const assignmentDepartment = hasPlacementStudent
    ? placementResult.student.department
    : profile?.department ?? placementResult?.placement?.assigned_department;
  const studentAssignmentStatus = normalizeAssignmentStatus(assignmentStatus) || 'Pending';
  const studentDepartment = assignmentDepartment || 'Not available';
  const isStudentUnassigned = isUnassignedAssignment(assignmentStatus, assignmentDepartment);
  const hasPublishedPlacement = Boolean(placementResult?.placement) &&
    placementResult.published !== false &&
    ['assigned', 'approved', 'placed', 'published'].includes(String(placementResult.placement.placement_status || '').trim().toLowerCase());
  const dashboardFinalScore = placementResult?.placement?.merit_score
    ?? placementResult?.placement?.final_score
    ?? profile?.cumulative_avg
    ?? profile?.cumulative_score;

  useEffect(() => {
    if (!['overview', 'result'].includes(tab) || !student?.id) return;

    const loadPlacementResult = async () => {
      setPlacementResultLoading(true);
      try {
        const response = await api.get(`api/student/get_student_result.php?student_id=${encodeURIComponent(student.id)}`);
        setPlacementResult(response.data?.published === false || response.data?.success ? response.data : null);
      } catch (error) {
        setPlacementResult(null);
      } finally {
        setPlacementResultLoading(false);
      }
    };

    loadPlacementResult();
  }, [student, tab]);

  useEffect(() => {
    if (tab !== 'notifications' || !student?.id) return;

    const loadNotifications = async () => {
      setNotificationsLoading(true);
      setNotificationsError('');

      try {
        const response = await api.get(`api/student/get_student_notifications.php?student_id=${encodeURIComponent(student.id)}`);
        const payload = response.data;
        const notificationList = Array.isArray(payload)
          ? payload
          : payload?.notifications || payload?.data || [];

        setNotifications(Array.isArray(notificationList) ? notificationList : []);
      } catch (error) {
        setNotifications([]);
        setNotificationsError(error.response?.data?.message || 'Unable to load notifications.');
      } finally {
        setNotificationsLoading(false);
      }
    };

    loadNotifications();
  }, [student, tab]);

  const unreadNotifications = notifications.filter(isNotificationUnread).length;

  const markAllNotificationsRead = async () => {
    setMarkingNotificationsRead(true);
    setNotificationsReadFeedback(null);
    try {
      const response = await api.post('api/student/mark_all_notifications_read.php');
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to mark notifications as read.');
      }
      setNotifications((current) => current.map((notification) => ({
        ...notification,
        is_read: 1,
        read: true,
        status: 'read',
      })));
      setNotificationsReadFeedback({
        type: 'success',
        text: response.data.message || 'All notifications marked as read.',
      });
    } catch (error) {
      setNotificationsReadFeedback({
        type: 'danger',
        text: error.response?.data?.message || error.message || 'Unable to mark notifications as read.',
      });
    } finally {
      setMarkingNotificationsRead(false);
    }
  };

  const markNotificationRead = async (notification) => {
    setMarkingNotificationId(notification.id);
    setNotificationsReadFeedback(null);
    try {
      const response = await api.post('api/student/mark_notification_read.php', {
        notification_id: notification.id,
        ...(notification.notification_type === 'meeting' ? { notification_type: 'meeting' } : {}),
      });
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to mark notification as read.');
      }
      setNotifications((current) => current.map((item) => (
        item.id === notification.id
          ? { ...item, is_read: 1, read: true, status: 'read' }
          : item
      )));
      setNotificationsReadFeedback({
        type: 'success',
        text: response.data.message || 'Notification marked as read.',
      });
    } catch (error) {
      setNotificationsReadFeedback({
        type: 'danger',
        text: error.response?.data?.message || error.message || 'Unable to mark notification as read.',
      });
    } finally {
      setMarkingNotificationId(null);
    }
  };

  const openOverviewDetail = async (metric, title) => {
    if (!student?.id) {
      setOverviewDetailError('Your student account could not be identified. Please sign in again.');
      setOverviewDetail({ metric, title, profile: null, placement: null });
      return;
    }

    setOverviewDetail({ metric, title, profile: null, placement: null });
    setOverviewDetailError('');
    setOverviewDetailLoading(true);
    try {
      const profileResponse = await api.get(
        `api/student/student_data_api.php?student_id=${encodeURIComponent(student.id)}&email=${encodeURIComponent(student.email || '')}`
      );
      const profileData = profileResponse.data?.student
        || (Array.isArray(profileResponse.data?.students) ? profileResponse.data.students[0] : null);
      if (!profileResponse.data?.success || !profileData) {
        throw new Error(profileResponse.data?.message || 'Unable to load your student details.');
      }

      let placementData = null;
      if (metric === 'finalScore' || metric === 'stream') {
        const placementResponse = await api.get(
          `api/student/get_student_result.php?student_id=${encodeURIComponent(student.id)}`
        );
        placementData = placementResponse.data || null;
      }

      setOverviewDetail({ metric, title, profile: profileData, placement: placementData });
    } catch (error) {
      setOverviewDetailError(error.response?.data?.message || error.message || 'Unable to load the requested student details.');
    } finally {
      setOverviewDetailLoading(false);
    }
  };

  const overviewCards = [
    {
      key: 'gpa',
      title: 'GPA',
      value: profile ? formatGpaValue(profile.gpa || profile.cgpa) : '0.00',
      color: 'primary',
    },
    {
      key: 'grade12',
      title: 'Grade 12 Result',
      value: profile ? formatScoreValue(profile.grade_12_result ?? profile.grade12 ?? profile.grade_12) : 'N/A',
      color: 'info',
    },
    {
      key: 'coc',
      title: 'COC Result',
      value: profile ? formatScoreValue(profile.coc_result ?? profile.coc) : 'N/A',
      color: 'secondary',
    },
    {
      key: 'stream',
      title: 'Stream',
      value: profile?.stream || 'Natural',
      color: 'success',
    },
    {
      key: 'finalScore',
      title: 'Final Score',
      value: placementResultLoading ? '...' : formatScoreValue(dashboardFinalScore),
      color: 'warning',
    },
  ];

  // --- Dynamic Cascading Logic (Purely from allDepartments state) ---
  const streamOptions = ['Natural', 'Social'];
  const registeredStream = normalizeStream(profile?.stream || 'Natural');
  const lockedStream = streamOptions.includes(registeredStream) ? registeredStream : 'Natural';

  useEffect(() => {
    if (preferences.stream !== lockedStream) {
      setPreferences((current) => ({ ...current, stream: lockedStream }));
    }
  }, [lockedStream, preferences.stream]);

  const collegeOptions = useMemo(() => {
    const tableColleges = allDepartments
      .filter((department) => isActiveDepartment(department) && department.stream === preferences.stream)
      .map((department) => department.college_name)
      .filter(Boolean);

    return [...new Set(tableColleges)];
  }, [allDepartments, preferences.stream]);

  const departmentOptions = useMemo(() => {
    return allDepartments
      .filter((department) => (
        isActiveDepartment(department) &&
        department.stream === preferences.stream &&
        normalizeCollege(department.college_name) === normalizeCollege(preferences.college)
      ))
      .map(d => d.name);
  }, [allDepartments, preferences.college, preferences.stream]);

  const departmentCount = departmentOptions.length;

  useEffect(() => {
    setPreferences((previous) => {
      if (previous.depts.length === departmentCount) return previous;

      return {
        ...previous,
        depts: Array.from({ length: departmentCount }, (_, index) => previous.depts[index] || ''),
      };
    });
  }, [preferences.college, departmentCount]);

  const handleChoiceChange = (idx, value) => {
    const newDepts = [...preferences.depts];
    newDepts[idx] = value;
    setPreferences({ ...preferences, depts: newDepts });
    setPrefError('');
    setPrefSuccess('');
  };

  const handleSave = async () => {
    setPrefError('');
    setPrefSuccess('');

    if (isIneligible) {
      setPrefError('Your academic record does not meet the minimum requirements for placement preferences. Please consult the Registrar Office.');
      return;
    }

    if (preferencesSubmitted) {
      setPrefError('You have already submitted preferences. Re-submitting is not allowed.');
      return;
    }

    if (isDeadlinePassed || hasSubmissionDeadlinePassed(submissionDeadline)) {
      setDeadlineClock(Date.now());
      setPrefError(`The preference submission deadline closed on ${submissionDeadline}. The submission window is now officially closed.`);
      return;
    }

    const selectedStream = normalizeStream(preferences.stream);

    if (!selectedStream) {
      setPrefError('Please select a stream first.');
      return;
    }

    if (!preferences.college) {
      setPrefError('Please select a college first.');
      return;
    }

    const formattedChoices = preferences.depts
      .map((name, index) => {
        const dbDept = allDepartments.find(d => d.name === name);
        return dbDept ? { dept_id: dbDept.id, priority: index + 1 } : null;
      })
      .filter(c => c !== null);

    const requiredChoices = departmentCount;

    if (departmentOptions.length === 0) {
      setPrefError('No departments are available for the selected stream and college.');
      return;
    }

    const uniqueChoiceIds = new Set(formattedChoices.map((choice) => String(choice.dept_id)));
    if (formattedChoices.length !== requiredChoices || uniqueChoiceIds.size !== requiredChoices) {
      setPrefError('Please rank all available departments exactly once before submitting.');
      return;
    }

    try {
      const res = await api.post('api/student/student_preferences.php', {
        student_id: student.id,
        choices: formattedChoices
      });
      if (res.data?.success) {
        setSavedPreferences({ ...preferences, depts: [...preferences.depts] });
        setSubmittedChoices(preferences.depts.map((departmentName, index) => {
          const department = allDepartments.find((item) => item.name === departmentName);
          return {
            id: department?.id || `${student.id}-${index}`,
            priority: index + 1,
            dept_id: department?.id,
            department_name: departmentName,
            name: departmentName,
            college_name: department?.college_name || preferences.college,
            stream: department?.stream || preferences.stream,
          };
        }));
        setPreferencesSubmitted(true);
        setPrefSuccess('Preferences saved successfully.');
      } else {
        setPrefError(res.data?.message || 'Unable to save preferences. Please try again.');
      }
    } catch (err) {
      setPrefError(err.response?.data?.message || 'Unable to save preferences. Please try again.');
    }
  };

  if (loading) return <div className="text-center mt-5">Loading DTU Portal...</div>;

  return (
    <div className="admin-dashboard student-dashboard container-fluid px-0">
      <OfficialPrintLetterhead
        office="ADMISSIONS & REGISTRAR OFFICE"
        title={tab === 'result' ? 'OFFICIAL STUDENT DEPARTMENT PLACEMENT CONFIRMATION SLIP' : 'OFFICIAL STUDENT DASHBOARD RECORD'}
        metadata={`Academic Year: 2016 E.C. / 2026 G.C. | Generated on: ${new Date().toLocaleDateString()}`}
      />
      <div className="row g-0">
        <Sidebar
          role="student"
          activeItem={tab}
          onSelect={setTab}
          notificationCount={unreadNotifications}
        />

        <main className="col-md-10 p-5 main-content">
          <DashboardHeader
            variant="welcome"
            username={student?.username}
            role="Student"
            greeting="Welcome"
            subtitle="Profile, preferences, and placement updates."
            profileDetail={`ID: ${student?.id_number || student?.id}`}
            dashboardPath="/student-dashboard"
          />

          {tab === 'overview' && (
            <div className="row g-4">
              {overviewCards.map((card) => (
                <div className="col-md-4" key={card.key}>
                  <button
                    type="button"
                    className={`card shadow-sm p-4 border-0 border-start border-${card.color} border-5 rounded-4 w-100 text-start`}
                    aria-label={`View ${card.title} details`}
                    onClick={() => openOverviewDetail(card.key, card.title)}
                    disabled={!student?.id}
                  >
                    <span className="text-muted small fw-bold text-uppercase">{t(card.title)}</span>
                    <h2 className={`fw-bold m-0 text-${card.color}`}>{card.value}</h2>
                    <span className="small text-muted mt-2">Click to view details</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          {tab === 'preferences' && (
            <div className="card p-4 border-0 shadow-sm rounded-4">
              {isIneligible && (
                <div className="alert alert-danger border-danger border-start border-5 p-4 shadow-sm" role="alert">
                  <h5 className="alert-heading fw-bold">&#9888;&#65039; Placement Ineligibility Notice</h5>
                  <p className="mb-0">
                    Your GPA ({studentGpa}) is below the minimum required placement threshold ({minimumGpa}), or your academic record contains a pending 'NG' status. You are restricted from department placement preference submission. Please consult the Registrar Office.
                  </p>
                </div>
              )}

              {!isIneligible && preferencesSubmitted && (
                <>
                  <div className="alert alert-success mb-4" role="alert">
                    <h5 className="alert-heading fw-bold">&#10003; Preferences submitted</h5>
                    <p className="mb-0">You have already submitted your department preferences. Re-submitting or changing preferences is not permitted.</p>
                    {isDeadlinePassed && <span className="badge bg-secondary mt-3">Submission Closed (Recorded)</span>}
                  </div>

                  <div className="row g-3 mb-4">
                    <div className="col-md-6">
                      <div className="border rounded-3 p-3 h-100">
                        <div className="small text-muted text-uppercase fw-bold mb-1">Stream</div>
                        <div className="fw-semibold">{savedPreferences.stream || 'Not available'}</div>
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="border rounded-3 p-3 h-100">
                        <div className="small text-muted text-uppercase fw-bold mb-1">College</div>
                        <div className="fw-semibold">{savedPreferences.college || 'Not available'}</div>
                      </div>
                    </div>
                  </div>

                  <h6 className="fw-bold mb-3">Submitted Department Rankings</h6>
                  <div className="mt-3">
                    {submittedChoices.length === 0 ? (
                      <div className="alert alert-light border text-muted">No department rankings found.</div>
                    ) : (
                      submittedChoices.map((choice, index) => (
                        <div
                          key={choice.id || index}
                          className="p-3 border rounded-3 bg-white mb-2 d-flex justify-content-between align-items-center shadow-sm"
                        >
                          <div className="d-flex align-items-center gap-3">
                            <span className="badge rounded-pill bg-primary px-3 py-2 fw-bold">
                              Rank #{choice.priority || index + 1}
                            </span>
                            <span className="fw-bold text-dark fs-6">
                              {choice.department_name || choice.name || choice.department || choice.dept_name}
                            </span>
                          </div>
                          <span className="badge bg-light text-muted border px-3 py-2">
                            {choice.college_name || savedPreferences.college || preferences.college}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                  {prefSuccess && <div className="alert alert-success mt-2 py-2 px-3 small rounded-3 shadow-sm mb-0" role="status" aria-live="polite">{prefSuccess}</div>}
                </>
              )}

              {!isIneligible && !preferencesSubmitted && (
                <>
                  <h5 className="fw-bold text-primary mb-4 text-center">Rank Your Department Preferences</h5>

                  {isDeadlinePassed && (
                    <div className="alert alert-warning border-warning border-start border-4 shadow-sm" role="alert">
                      <strong>&#9888;&#65039; The preference submission deadline closed on {submissionDeadline}. New submissions are no longer accepted.</strong>
                    </div>
                  )}

                  <div className="bg-white border p-4 rounded-4 mb-4 shadow-sm">
                    <div className="row g-3">
                      <div className="col-md-6">
                        <label className="form-label fw-bold small text-muted">1. SELECT STREAM</label>
                        <select
                          className="form-select"
                          value={lockedStream}
                          disabled={true}
                        >
                          {streamOptions.map((stream) => <option key={stream} value={stream}>{stream}</option>)}
                        </select>
                        <div className="form-text">Registered Stream (Locked to your profile)</div>
                      </div>
                      <div className="col-md-6">
                        <label className="form-label fw-bold small text-muted">2. SELECT COLLEGE</label>
                        <select className="form-select" value={preferences.college}
                          disabled={isDeadlinePassed}
                          onChange={(e) => {
                            setPreferences({ ...preferences, college: e.target.value, depts: [] });
                            setPrefError('');
                            setPrefSuccess('');
                          }}>
                          <option value="">-- Choose College --</option>
                          {collegeOptions.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="row g-3">
                    {preferences.depts.map((choice, idx) => (
                      <div className="col-md-6" key={idx}>
                        <div className="p-3 border rounded-3 bg-white">
                          <label className="small fw-bold text-primary mb-2 d-block">Preference Rank #{idx + 1}</label>
                          <select className="form-select border-0 bg-light shadow-none" value={choice}
                            disabled={isDeadlinePassed}
                            onChange={(e) => handleChoiceChange(idx, e.target.value)}>
                            <option value="">-- Select Department --</option>
                            {departmentOptions.map(dName => (
                              <option key={dName} value={dName} disabled={preferences.depts.includes(dName) && choice !== dName}>
                                {dName}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="text-end mt-4">
                    {!isDeadlinePassed && (
                      <button className="btn px-4 py-2 fw-bold shadow-sm rounded-pill dtu-submit-button" onClick={handleSave}>
                        submit
                      </button>
                    )}
                  </div>
                  {prefError && <div className="alert alert-danger mt-2 py-2 px-3 small rounded-3 shadow-sm mb-0" role="alert" aria-live="polite">{prefError}</div>}
                  {prefSuccess && <div className="alert alert-success mt-2 py-2 px-3 small rounded-3 shadow-sm mb-0" role="status" aria-live="polite">{prefSuccess}</div>}
                </>
              )}
            </div>
          )}

          {tab === 'result' && (
            <div className="card border-0 shadow-sm rounded-4 student-placement-result-print">
              <div className="card-body p-4">
                <div className="d-flex justify-content-between align-items-center gap-3 mb-3 student-result-print-actions">
                  <h4 className="fw-bold text-primary mb-0">Placement Result</h4>
                  <button type="button" className="btn btn-outline-dark btn-sm" onClick={() => window.print()}>
                    Print Placement Slip
                  </button>
                </div>

                {placementResultLoading ? (
                  <div className="alert alert-info mb-0">Loading your placement result...</div>
                ) : isStudentUnassigned ? (
                  <div className="alert alert-warning mb-0" role="alert">
                    You are currently unassigned. Please report to the Registrar office in person for remediation and manual assignment.
                  </div>
                ) : placementResult?.published === false || (placementResult?.placement && !hasPublishedPlacement) ? (
                  <div className="alert alert-info mb-0" role="status">
                    ℹ️ Placement Under Review: Your department assignment is currently being verified by the Office of the Registrar and has not been published yet.
                  </div>
                ) : !placementResult?.placement ? (
                  <div className="alert alert-info mb-0">
                    {placementResult?.message || 'Your placement result is not available yet.'}
                  </div>
                ) : (
                  <>
                    <div className="alert alert-success">
                      {studentAssignmentStatus === 'Approved'
                        ? `Your placement has been approved and confirmed in ${placementResult.placement.assigned_department || studentDepartment}.`
                        : `Your placement has been assigned successfully to ${placementResult.placement.assigned_department || studentDepartment}.`}
                    </div>

                    <div className="table-responsive">
                      <table className="table table-bordered align-middle mb-0">
                        <tbody>
                          <tr>
                            <th>Student Name</th>
                            <td>{[profile?.first_name || student?.first_name, profile?.last_name || student?.last_name].filter(Boolean).join(' ') || student?.name || student?.username || 'Not available'}</td>
                          </tr>
                          <tr>
                            <th>ID Number</th>
                            <td>{student?.id_number || profile?.id_number || student?.id || 'Not available'}</td>
                          </tr>
                          <tr>
                            <th>Assigned Department</th>
                            <td>{studentDepartment !== 'Not available' ? studentDepartment : placementResult.placement.assigned_department || 'Not available'}</td>
                          </tr>
                          <tr>
                            <th>Stream</th>
                            <td>{placementResult.placement.stream || 'Not available'}</td>
                          </tr>
                          <tr>
                            <th>Cumulative Score</th>
                            <td>{Number(placementResult.placement.merit_score || profile?.cumulative_score || 0).toFixed(2)}</td>
                          </tr>
                          <tr>
                            <th>Placement Status</th>
                            <td>
                              <span className="badge bg-success">
                                {studentAssignmentStatus || placementResult.placement.placement_status || 'Pending'}
                              </span>
                            </td>
                          </tr>
                          <tr>
                            <th>College</th>
                            <td>{placementResult.placement.college || 'Not available'}</td>
                          </tr>
                          <tr>
                            <th>Choice Rank</th>
                            <td>{placementResult.placement.choice_rank || 'Not available'}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="student-result-verification">
                      <span>Placement verification</span>
                      <strong>Official Department Seal / Registrar Stamp</strong>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {tab === 'appeal' && (
            <StudentAppeal
              studentId={student?.id}
              placement={hasPublishedPlacement ? placementResult.placement : null}
            />
          )}

          {tab === 'notifications' && (
            <div className="card border-0 shadow-sm rounded-4">
              <div className="card-body p-4">
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h4 className="fw-bold text-primary mb-0">Notifications</h4>
                  <div className="d-flex align-items-center gap-2">
                    {unreadNotifications > 0 && (
                      <>
                        <span className="badge bg-primary">{unreadNotifications} unread</span>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary"
                          onClick={markAllNotificationsRead}
                          disabled={markingNotificationsRead || notificationsLoading}
                        >
                          {markingNotificationsRead ? 'Marking...' : 'Mark all as read'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {notificationsReadFeedback && (
                  <div className={`alert alert-${notificationsReadFeedback.type} py-2`} role={notificationsReadFeedback.type === 'danger' ? 'alert' : 'status'}>
                    {notificationsReadFeedback.text}
                  </div>
                )}

                {notificationsLoading && (
                  <div className="alert alert-info mb-0">Loading notifications...</div>
                )}

                {!notificationsLoading && notificationsError && (
                  <div className="alert alert-danger mb-0">{notificationsError}</div>
                )}

                {!notificationsLoading && !notificationsError && notifications.length === 0 && (
                  <div className="alert alert-light border mb-0">You do not have any notifications yet.</div>
                )}

                {!notificationsLoading && !notificationsError && notifications.length > 0 && (
                  <div className="list-group">
                    {notifications.map((notification, index) => {
                      const isUnread = isNotificationUnread(notification);

                      return (
                        <div className={`list-group-item ${isUnread ? 'fw-semibold' : ''}`} key={notification.id || index}>
                          <div className="d-flex justify-content-between align-items-start gap-3">
                            <div className="flex-grow-1">
                              {notification.title && (
                                <div className="fw-semibold mb-1">{notification.title}</div>
                              )}
                              <div className="text-break">{notification.message || 'New notification'}</div>
                              {notification.notification_type === 'meeting' && (
                                <div className="small text-muted mt-2 d-flex flex-wrap gap-3">
                                  {notification.meeting_date && (
                                    <span><strong>Date:</strong> {notification.meeting_date}</span>
                                  )}
                                  {notification.meeting_time && (
                                    <span><strong>Time:</strong> {notification.meeting_time}</span>
                                  )}
                                  {notification.location && (
                                    <span><strong>Location:</strong> {notification.location}</span>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="d-flex align-items-center gap-2">
                              {notification.created_at && (
                                <small className="text-muted text-nowrap">{notification.created_at}</small>
                              )}
                              {isUnread && (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-primary text-nowrap"
                                  onClick={() => markNotificationRead(notification)}
                                  disabled={markingNotificationsRead || markingNotificationId !== null}
                                >
                                  {markingNotificationId === notification.id ? 'Marking...' : 'Mark as read'}
                                </button>
                              )}
                            </div>
                          </div>
                          {notification.file_path && (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary mt-2"
                              onClick={(event) => {
                                event.stopPropagation();
                                const attachmentUrl = getAttachmentUrl(notification.file_path);
                                if (attachmentUrl !== '#') window.open(attachmentUrl, '_blank', 'noopener,noreferrer');
                              }}
                            >
                              Open attachment
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

        </main>
      </div>
      {overviewDetail && (
        <>
          <div className="modal-backdrop show" />
          <div className="modal show d-block" role="dialog" aria-modal="true" aria-labelledby="overview-detail-title">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title" id="overview-detail-title">{overviewDetail.title} Details</h5>
                  <button
                    type="button"
                    className="btn-close"
                    aria-label="Close"
                    onClick={() => {
                      setOverviewDetail(null);
                      setOverviewDetailError('');
                    }}
                  />
                </div>
                <div className="modal-body">
                  {overviewDetailLoading ? (
                    <div className="text-center text-muted py-3" role="status">Fetching your latest {overviewDetail.title.toLowerCase()} details...</div>
                  ) : overviewDetailError ? (
                    <div className="alert alert-danger mb-0" role="alert">{overviewDetailError}</div>
                  ) : (
                    <dl className="row mb-0">
                      {getOverviewDetailRows(
                        overviewDetail.metric,
                        overviewDetail.profile || {},
                        overviewDetail.placement,
                        minimumGpa
                      ).map(([label, value]) => (
                        <React.Fragment key={label}>
                          <dt className="col-sm-5">{label}</dt>
                          <dd className="col-sm-7">{value ?? 'N/A'}</dd>
                        </React.Fragment>
                      ))}
                    </dl>
                  )}
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => {
                      setOverviewDetail(null);
                      setOverviewDetailError('');
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default StudentDashboard;