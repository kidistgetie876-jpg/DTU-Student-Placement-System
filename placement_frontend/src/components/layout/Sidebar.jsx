import React from 'react';
import {
  Activity,
  Bell,
  BookOpen,
  Building2,
  CheckCircle,
  Clock,
  FileText,
  Grid,
  HelpCircle,
  LayoutDashboard,
  Mail,
  PlayCircle,
  Send,
  Settings,
  ShieldCheck,
  UserPlus,
  UserX,
  Users,
} from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import { useRolePermissions } from '../../contexts/RolePermissionsContext.jsx';

const roleNavigation = {
  registrar: {
    title: 'Registrar Portal',
    subtitle: 'Review placements, departments, and approvals.',
    items: [
      { key: 'overview', label: 'Overview', Icon: LayoutDashboard, permissionId: 'registrar.overview' },
      { key: 'student-info', label: 'Student Information', Icon: Users, permissionId: 'registrar.student-information' },
      { key: 'data-import', label: 'Import Student Data', Icon: UserPlus, permissionId: 'registrar.data-import' },
      { key: 'choice-matrix', label: 'Student Choice Matrix', Icon: Grid, permissionId: 'registrar.choice-matrix' },
      { key: 'capacity', label: 'Department Capacity', Icon: Building2, permissionId: 'registrar.capacity' },
      { key: 'department-status', label: 'Department Status', Icon: Activity, permissionId: 'registrar.department-status' },
      { key: 'placement-rules', label: 'Placement Rules', Icon: BookOpen, permissionId: 'registrar.placement-rules' },
      { key: 'settings', label: 'Placement Settings', Icon: Settings, permissionId: 'registrar.settings' },
      { key: 'deadlines', label: 'Placement Deadlines', Icon: Clock, permissionId: 'registrar.deadlines' },
      { key: 'run-placement', label: 'Run Placement', Icon: PlayCircle, permissionId: 'registrar.run-placement' },
      { key: 'approve-results', label: 'Approve & Publish Results', Icon: CheckCircle, permissionId: 'registrar.approve-results' },
      { key: 'placed-students', label: 'Placed Students', Icon: Users, permissionId: 'registrar.placed-students' },
      { key: 'unassigned-students', label: 'Unassigned Students', Icon: UserX, permissionId: 'registrar.unassigned-students' },
      { key: 'appeals', label: 'Handle Appeals', Icon: HelpCircle, permissionId: 'registrar.appeals' },
      { key: 'reports', label: 'Reports', Icon: FileText, permissionId: 'registrar.reports' },
      { key: 'announcements', label: 'Announcements', Icon: Bell, permissionId: 'registrar.announcements' },
    ],
  },
  admin: {
    title: 'Placement Admin',
    subtitle: 'Manage users, departments, and reports.',
    items: [
      { key: 'dashboard', label: 'System Overview', Icon: LayoutDashboard, permissionId: 'admin.overview' },
      { key: 'manage', label: 'User Management', Icon: Users, permissionId: 'admin.users' },
      { key: 'departments', label: 'Manage Departments', Icon: Building2, permissionId: 'admin.departments' },
      { key: 'reports', label: 'Reports', Icon: FileText, permissionId: 'admin.reports' },
      { key: 'contact-messages', label: 'Contact Messages', Icon: Mail, permissionId: 'admin.contact-messages' },
      { key: 'assign-head', label: 'Assign Department Head', Icon: UserPlus, permissionId: 'admin.assign-head' },
      { key: 'data-import', label: 'Data Import', Icon: UserPlus, permissionId: 'admin.data-import' },
      { key: 'audit-logs', label: 'Audit Logs / System Health', Icon: ShieldCheck, permissionId: 'admin.audit-logs' },
      { key: 'role-permissions', label: 'Role & Permissions', Icon: Settings },
      { key: 'account-settings', label: 'Account Settings', Icon: Users, permissionId: 'admin.account-settings' },
    ],
  },
  head: {
    title: 'Department Head',
    subtitle: 'Department leadership tools and placement oversight.',
    items: [
      { key: 'overview', label: 'Dashboard', Icon: LayoutDashboard, permissionId: 'head.overview' },
      { key: 'approvals', label: 'Reports & Approvals', Icon: FileText, permissionId: 'head.approvals' },
      { key: 'capacity', label: 'Department Capacity', Icon: Building2, permissionId: 'head.capacity' },
      { key: 'students', label: 'Placed Students', Icon: Users, permissionId: 'head.students' },
      { key: 'reports', label: 'Reports', Icon: Send, permissionId: 'head.reports' },
    ],
  },
  student: {
    title: 'DTU Student Portal',
    subtitle: 'Preferences, placement results, and student updates.',
    items: [
      { key: 'overview', label: 'Overview', Icon: LayoutDashboard, permissionId: 'student.overview' },
      { key: 'preferences', label: 'Submit Preferences', Icon: Grid, permissionId: 'student.preferences' },
      { key: 'result', label: 'Placement Result', Icon: CheckCircle, permissionId: 'student.results' },
      { key: 'appeal', label: 'Submit Appeal', Icon: HelpCircle, permissionId: 'student.appeals' },
      { key: 'notifications', label: 'Notifications', Icon: Bell, permissionId: 'student.notifications' },
    ],
  },
};

const Sidebar = ({ role, activeItem, onSelect, notificationCount = 0 }) => {
  const { t } = useLanguage();
  const { isOpen } = useRolePermissions();
  const navigation = roleNavigation[String(role || '').toLowerCase()];
  if (!navigation) {
    throw new Error(`Unsupported sidebar role: ${role}`);
  }

  return (
    <aside className={`sidebar role-sidebar role-sidebar-${role} col-md-2 d-flex flex-column p-4`}>
      <div className="sidebar-brand role-sidebar-brand">
        <div className="role-sidebar-mark" aria-hidden="true">
          <LayoutDashboard size={20} strokeWidth={2} />
        </div>
        <div>
          <h5>{t(navigation.title)}</h5>
          <p>{t(navigation.subtitle)}</p>
        </div>
      </div>
      <nav className="role-sidebar-nav" aria-label={`${t(navigation.title)} navigation`}>
        {navigation.items.filter(({ permissionId }) => !permissionId || isOpen(permissionId)).map(({ key, label, Icon }) => {
          const isActive = activeItem === key;
          return (
            <button
              key={key}
              type="button"
              className={`role-sidebar-item${isActive ? ' active' : ''}`}
              onClick={() => onSelect(key)}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={18} strokeWidth={1.9} aria-hidden="true" />
              <span>{t(label)}</span>
              {key === 'notifications' && notificationCount > 0 && (
                <span className="role-sidebar-badge">{notificationCount}</span>
              )}
            </button>
          );
        })}
      </nav>
      <div className="role-sidebar-footer">
        <span className="role-sidebar-status-dot" aria-hidden="true" />
        <span>{t('Placement workspace')}</span>
      </div>
    </aside>
  );
};

export default Sidebar;
