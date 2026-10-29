import React, { useMemo, useState } from "react";
import { FaUserGraduate, FaListOl, FaPoll, FaFileAlt, FaBalanceScale, FaInfoCircle, FaSearch } from 'react-icons/fa';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import LoginModal from './LoginModal.jsx';
import './services.css'; // ከታች ያለውን CSS እዚህ ፋይል ላይ ይጠቀማል

const DTU_SERVICES = [
  {
    id: 'profile',
    title: 'Academic Profile & Status Overview',
    category: 'Profile & Status',
    icon: FaUserGraduate,
    destination: '/student-dashboard?tab=overview',
    summary: 'View your updated academic records (CGPA, Grade 12, COC scores) and track your real-time placement stage status across semester cycles.',
    details: 'Review your academic scores and current placement stage in your personal student dashboard.'
  },
  {
    id: 'choices',
    title: 'Department Preference Submission',
    category: 'Placement',
    icon: FaListOl,
    destination: '/student-dashboard?tab=preferences',
    summary: 'Select, rank, and submit your top department choices within your assigned college context during open registration windows.',
    details: 'Review your eligible departments and submit or update your ranked choices while registration is open.'
  },
  {
    id: 'results',
    title: 'Placement Results',
    category: 'Results',
    icon: FaPoll,
    destination: '/student-dashboard?tab=result',
    summary: 'Check your finalized department assignment, choice rank match, and download your official placement letter once results are published.',
    details: 'Review your published assignment and print your official placement slip.'
  },
  {
    id: 'appeals',
    title: 'Placement Appeals',
    category: 'Governance',
    icon: FaBalanceScale,
    destination: '/student-dashboard?tab=appeal',
    summary: 'Submit formal appeals or request corrections if there are any discrepancies in your merit score or eligibility status.',
    details: 'Submit a placement appeal and include details about the score or eligibility discrepancy for review.'
  },
  {
    id: 'info',
    title: 'Departmental Catalog',
    category: 'Information',
    icon: FaInfoCircle,
    destination: '/placement-info',
    summary: 'Explore course offerings, available capacities, career paths, and specific entry requirements for all university departments.',
    details: 'Explore department capacity and placement information to make informed choices.'
  },
  {
    id: 'criteria',
    title: 'Placement Criteria & Weights',
    category: 'Information',
    icon: FaFileAlt,
    destination: '/placement-info',
    summary: 'Review the 80/20 merit quota policy, female affirmative action guidelines, and CGPA/entrance score weighting formulas.',
    details: 'Review the current placement scoring, quotas, and affirmative-action guidance.'
  }
];

function Services() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [loginTarget, setLoginTarget] = useState(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  const categories = useMemo(() => ['All', ...Array.from(new Set(DTU_SERVICES.map(s => s.category)))], []);

  const filtered = useMemo(() => {
    return DTU_SERVICES.filter(s => {
      if (category !== 'All' && s.category !== category) return false;
      const q = query.toLowerCase();
      return s.title.toLowerCase().includes(q) || s.summary.toLowerCase().includes(q);
    });
  }, [query, category]);

  const accessService = (service) => {
    const role = String(user?.role || '').trim().toLowerCase();
    if (role === 'student') {
      navigate(service.destination);
      return;
    }
    setLoginTarget(service);
  };

  return (
    <div className="services-container py-5" style={{ paddingTop: '200px' }}>
      <div className="container">
        {/* Header Section */}
        <div className="text-center mb-5">
          <h1 className="display-5 fw-bold text-dark mb-3">Student Placement Services</h1>
          <p className="lead text-muted mx-auto" style={{maxWidth: '700px'}}>
            Everything you need for a transparent and fair department placement process at Debre Tabor University.
          </p>
        </div>

        {/* Search & Filter Bar */}
        <div className="search-box p-4 bg-white shadow-sm rounded-4 mb-5">
          <div className="row g-3 align-items-center">
            <div className="col-md-6">
              <div className="input-group border rounded-3 overflow-hidden">
                <span className="input-group-text bg-white border-0"><FaSearch className="text-muted" /></span>
                <input 
                  type="text" 
                  className="form-control border-0 shadow-none" 
                  placeholder="Search for services (e.g. 'results', 'GPA')..." 
                  value={query} 
                  onChange={e => setQuery(e.target.value)} 
                />
              </div>
            </div>
            <div className="col-md-3">
              <select className="form-select border rounded-3 shadow-none" value={category} onChange={e => setCategory(e.target.value)}>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="col-md-3 text-md-end">
              <Link to="/contact" className="btn btn-primary px-4 w-100 rounded-3">Get Help</Link>
            </div>
          </div>
        </div>

        {/* Services Grid */}
        <div className="row g-4">
          {filtered.map(service => {
            const Icon = service.icon;
            return (
              <div className="col-lg-4 col-md-6" key={service.id}>
                <div className="service-card h-100 p-4 border-0 shadow-sm bg-white rounded-4">
                  <div className="icon-wrapper mb-3">
                    <Icon size={28} className="icon" />
                  </div>
                  <span className="badge bg-soft-primary text-primary mb-2">{service.category}</span>
                  <h4 className="h5 fw-bold mb-3">{service.title}</h4>
                  <p className="text-muted small mb-4">{service.summary}</p>
                  <div className="mt-auto">
                    <button
                      type="button"
                      className="btn-link text-decoration-none fw-bold small border-0 bg-transparent p-0"
                      onClick={() => accessService(service)}
                    >
                      Access Service →
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Empty State */}
        {filtered.length === 0 && (
          <div className="text-center py-5">
            <h5 className="text-muted">No services found matching "{query}"</h5>
          </div>
        )}
      </div>
      {loginTarget && (
        <LoginModal
          isOpen
          redirectTo={loginTarget.destination}
          onClose={() => setLoginTarget(null)}
        />
      )}
    </div>
  );
}

export default Services;