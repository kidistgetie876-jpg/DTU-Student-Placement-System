import React, { useMemo, useState } from "react";
import { FaUserCheck, FaListOl, FaPoll, FaFileAlt, FaBalanceScale, FaInfoCircle, FaSearch } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import './services.css'; // ከታች ያለውን CSS እዚህ ፋይል ላይ ይጠቀማል

const DTU_SERVICES = [
  {
    id: 'profile',
    title: 'Academic Profile Verification',
    category: 'Verification',
    icon: FaUserCheck,
    summary: 'Verify your GPA, Grade 12 results, and COC scores before placement begins.',
    details: 'Ensuring your data is correct is the first step. If you find errors in your GPA or affirmative action points, contact the Registrar immediately.'
  },
  {
    id: 'choices',
    title: 'Department Preference Submission',
    category: 'Placement',
    icon: FaListOl,
    summary: 'Submit and rank your top 5 department choices based on your stream.',
    details: 'You can select 5 departments under your assigned college. Remember, once the deadline passes, choices cannot be modified.'
  },
  {
    id: 'results',
    title: 'Placement Results',
    category: 'Results',
    icon: FaPoll,
    summary: 'Access your final department assignment once the engine finishes processing.',
    details: 'View which department you have been assigned to based on your score (GPA 50%, Grade 12 30%, COC 20%) and preferences.'
  },
  {
    id: 'appeals',
    title: 'Placement Appeals',
    category: 'Governance',
    icon: FaBalanceScale,
    summary: 'Submit a formal appeal if you have concerns about your placement result.',
    details: 'If you believe there was a calculation error or a technical glitch, you can submit an appeal within 3 days of result publication.'
  },
  {
    id: 'info',
    title: 'Departmental Catalog',
    category: 'Information',
    icon: FaInfoCircle,
    summary: 'Explore department descriptions, job opportunities, and requirements.',
    details: 'Detailed information about each department to help you make informed decisions when ranking your choices.'
  },
  {
    id: 'criteria',
    title: 'Placement Criteria & Weights',
    category: 'Information',
    icon: FaFileAlt,
    summary: 'Understand how your total score is calculated for placement.',
    details: 'Formula: (GPA * 0.5) + (Grade 12 * 0.3) + (COC * 0.2) + Affirmative Action points (Female: +1.5, Disability: +1, Emerging Regions: +1).'
  }
];

function Services() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');

  const categories = useMemo(() => ['All', ...Array.from(new Set(DTU_SERVICES.map(s => s.category)))], []);

  const filtered = useMemo(() => {
    return DTU_SERVICES.filter(s => {
      if (category !== 'All' && s.category !== category) return false;
      const q = query.toLowerCase();
      return s.title.toLowerCase().includes(q) || s.summary.toLowerCase().includes(q);
    });
  }, [query, category]);

  return (
<<<<<<< HEAD:placement_frontend/src/pages/public/Services.jsx
    <div className="services-container py-5" style={{ paddingTop: '200px' }}>
=======
    <div className="services-container" style={{ paddingTop: '160px', paddingBottom: '60px', minHeight: '100vh' }}>
>>>>>>> 0804fa7a9466ce2c9657e71058cbe88e873d7e70:src/pages/public/Services.jsx
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
                    <Link to="/login" className="btn-link text-decoration-none fw-bold small">
                      Access Service →
                    </Link>
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
    </div>
  );
}

export default Services;