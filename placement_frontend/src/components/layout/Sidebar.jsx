import React from 'react';

const Sidebar = ({ title, subtitle, items = [], activeItem, onSelect, className = '' }) => (
  <aside className={`responsive-sidebar ${className}`.trim()}>
    <div className="sidebar-brand mb-4">
      <h5 className="fw-bold mb-1">{title}</h5>
      {subtitle && <p className="small text-white-50 mb-0">{subtitle}</p>}
    </div>
    <nav className="nav flex-column gap-2" aria-label={`${title} navigation`}>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className={`btn sidebar-nav-item text-start ${activeItem === item.key ? 'active' : ''}`}
          onClick={() => onSelect?.(item.key)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  </aside>
);

export default Sidebar;