export const roleFeatures = {
  student: {
    label: 'Student Dashboard & Services',
    features: [
      { id: 'student.overview', label: 'Academic Profile & Status', navigationKey: 'overview' },
      { id: 'student.preferences', label: 'Department Preferences', navigationKey: 'preferences' },
      { id: 'student.results', label: 'Placement Results', navigationKey: 'result' },
      { id: 'student.appeals', label: 'Placement Appeals', navigationKey: 'appeal' },
      { id: 'student.notifications', label: 'Notifications', navigationKey: 'notifications' },
    ],
  },
  registrar: {
    label: 'Registrar Workspace',
    features: [
      { id: 'registrar.overview', label: 'Overview', navigationKey: 'overview' },
      { id: 'registrar.student-information', label: 'Student Information', navigationKey: 'student-info' },
      { id: 'registrar.data-import', label: 'Import Student Data', navigationKey: 'data-import' },
      { id: 'registrar.choice-matrix', label: 'Student Choice Matrix', navigationKey: 'choice-matrix' },
      { id: 'registrar.capacity', label: 'Department Capacity', navigationKey: 'capacity' },
      { id: 'registrar.department-status', label: 'Department Status', navigationKey: 'department-status' },
      { id: 'registrar.placement-rules', label: 'Placement Rules', navigationKey: 'placement-rules' },
      { id: 'registrar.settings', label: 'Placement Settings', navigationKey: 'settings' },
      { id: 'registrar.deadlines', label: 'Placement Deadlines', navigationKey: 'deadlines' },
      { id: 'registrar.run-placement', label: 'Run Placement', navigationKey: 'run-placement' },
      { id: 'registrar.approve-results', label: 'Approve & Publish Results', navigationKey: 'approve-results' },
      { id: 'registrar.placed-students', label: 'Placed Students', navigationKey: 'placed-students' },
      { id: 'registrar.unassigned-students', label: 'Unassigned Students', navigationKey: 'unassigned-students' },
      { id: 'registrar.appeals', label: 'Handle Appeals', navigationKey: 'appeals' },
      { id: 'registrar.reports', label: 'Reports', navigationKey: 'reports' },
      { id: 'registrar.announcements', label: 'Announcements', navigationKey: 'announcements' },
    ],
  },
  head: {
    label: 'Department Head Workspace',
    features: [
      { id: 'head.overview', label: 'Dashboard', navigationKey: 'overview' },
      { id: 'head.approvals', label: 'Reports & Approvals', navigationKey: 'approvals' },
      { id: 'head.capacity', label: 'Department Capacity', navigationKey: 'capacity' },
      { id: 'head.students', label: 'Placed Students', navigationKey: 'students' },
      { id: 'head.reports', label: 'Reports', navigationKey: 'reports' },
    ],
  },
  admin: {
    label: 'Admin System Settings',
    features: [
      { id: 'admin.overview', label: 'System Overview', navigationKey: 'dashboard' },
      { id: 'admin.users', label: 'User Management', navigationKey: 'manage' },
      { id: 'admin.departments', label: 'Manage Departments', navigationKey: 'departments' },
      { id: 'admin.reports', label: 'Reports', navigationKey: 'reports' },
      { id: 'admin.contact-messages', label: 'Contact Messages', navigationKey: 'contact-messages' },
      { id: 'admin.assign-head', label: 'Assign Department Head', navigationKey: 'assign-head' },
      { id: 'admin.data-import', label: 'Data Import', navigationKey: 'data-import' },
      { id: 'admin.audit-logs', label: 'Audit Logs / System Health', navigationKey: 'audit-logs' },
      { id: 'admin.system-settings', label: 'System Settings', navigationKey: 'system-config', alwaysOpen: true },
      { id: 'admin.account-settings', label: 'Account Settings', navigationKey: 'account-settings' },
    ],
  },
};

export const defaultRolePermissions = Object.fromEntries(
  Object.values(roleFeatures)
    .flatMap(({ features }) => features)
    .map(({ id }) => [id, true])
);

export const rolePermissionIsOpen = (permissions, permissionId) => (
  permissionId === 'admin.system-settings' || permissions?.[permissionId] !== false
);
