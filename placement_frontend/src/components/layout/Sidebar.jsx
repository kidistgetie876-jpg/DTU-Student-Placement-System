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

const roleNavigation = {
  registrar: {
    title: 'Registrar Portal',
    subtitle: 'Review placements, departments, and approvals.',
    items: [
      { key: 'overview', label: 'Overview', Icon: LayoutDashboard },
      { key: 'student-info', label: 'Student Information', Icon: Users },
      { key: 'data-import', label: 'Import Student Data', Icon: UserPlus },
      { key: 'choice-matrix', label: 'Student Choice Matrix', Icon: Grid },
      { key: 'capacity', label: 'Department Capacity', Icon: Building2 },
      { key: 'department-status', label: 'Department Status', Icon: Activity },
      { key: 'placement-rules', label: 'Placement Rules', Icon: BookOpen },
      { key: 'deadlines', label: 'Placement Deadlines', Icon: Clock },
      { key: 'run-placement', label: 'Run Placement', Icon: PlayCircle },
      { key: 'approve-results', label: 'Approve & Publish Results', Icon: CheckCircle },
      { key: 'unassigned-students', label: 'Unassigned Students', Icon: UserX },
      { key: 'appeals', label: 'Handle Appeals', Icon: HelpCircle },
      { key: 'reports', label: 'Reports', Icon: FileText },
      { key: 'announcements', label: 'Announcements', Icon: Bell },
    ],
  },
  admin: {
    title: 'Placement Admin',
    subtitle: 'Manage users, departments, and reports.',
    items: [
      { key: 'dashboard', label: 'System Overview', Icon: LayoutDashboard },
      { key: 'manage', label: 'User Management', Icon: Users },
      { key: 'departments', label: 'Manage Departments', Icon: Building2 },
      { key: 'reports', label: 'Reports', Icon: FileText },
      { key: 'contact-messages', label: 'Contact Messages', Icon: Mail },
      { key: 'data-import', label: 'Data Import', Icon: UserPlus },
      { key: 'audit-logs', label: 'Audit Logs / System Health', Icon: ShieldCheck },
      { key: 'system-config', label: 'Settings', Icon: Settings },
      { key: 'account-settings', label: 'Account Settings', Icon: Users },
    ],
  },
  head: {
    title: 'Department Head',
    subtitle: 'Department leadership tools and placement oversight.',
    items: [
      { key: 'overview', label: 'Dashboard', Icon: LayoutDashboard },
      { key: 'approvals', label: 'Reports & Approvals', Icon: FileText },
      { key: 'capacity', label: 'Department Capacity', Icon: Building2 },
      { key: 'students', label: 'Placed Students', Icon: Users },
      { key: 'reports', label: 'Reports', Icon: Send },
    ],
  },
  student: {
    title: 'DTU Student Portal',
    subtitle: 'Preferences, placement results, and student updates.',
    items: [
      { key: 'overview', label: 'Overview', Icon: LayoutDashboard },
      { key: 'preferences', label: 'Submit Preferences', Icon: Grid },
      { key: 'result', label: 'Placement Result', Icon: CheckCircle },
      { key: 'appeal', label: 'Submit Appeal', Icon: HelpCircle },
      { key: 'notifications', label: 'Notifications', Icon: Bell },
    ],
  },
};

const Sidebar = ({ role, activeItem, onSelect, notificationCount = 0 }) => {
  const { t } = useLanguage();
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
        {navigation.items.map(({ key, label, Icon }) => {
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
