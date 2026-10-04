import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiSettings } from 'react-icons/fi';
import dtuLogo from '../../assets/image.png';

const DEFAULT_MAINTENANCE = {
  title: 'System Under Maintenance',
  message: 'The DTU Placement Portal is currently undergoing scheduled system updates. Services will resume shortly.',
  expectedReturn: 'Soon',
};

const Maintenance = ({ settings = {} }) => {
  const navigate = useNavigate();
  const title = settings.title?.trim() || DEFAULT_MAINTENANCE.title;
  const message = settings.message?.trim() || DEFAULT_MAINTENANCE.message;
  const expectedReturn = settings.expectedReturn?.trim();

  return (
    <main
      className="d-flex align-items-center justify-content-center min-vh-100 p-3 p-md-4"
      style={{ background: 'linear-gradient(145deg, #f3f7fb 0%, #e7eff7 100%)' }}
    >
      <section
        className="bg-white border shadow-sm rounded-3 w-100 text-center p-4 p-md-5"
        style={{ maxWidth: '640px' }}
        aria-labelledby="maintenance-title"
      >
        <img src={dtuLogo} alt="Debre Tabor University" className="mb-4" style={{ width: '82px', height: '82px', objectFit: 'contain' }} />
        <div className="d-flex align-items-center justify-content-center rounded-circle mx-auto mb-4 text-primary bg-primary-subtle" style={{ width: '72px', height: '72px' }}>
          <FiSettings size={34} aria-hidden="true" />
        </div>
        <p className="text-uppercase fw-semibold small text-primary mb-2">Debre Tabor University</p>
        <h1 id="maintenance-title" className="h2 fw-bold mb-3">{title}</h1>
        <p className="text-secondary mb-4" style={{ whiteSpace: 'pre-wrap' }}>{message}</p>
        {expectedReturn && (
          <p className="border-top pt-3 mb-4">
            <span className="d-block small text-muted mb-1">Expected resumption</span>
            <span className="fw-semibold">{expectedReturn}</span>
          </p>
        )}
        <div className="d-flex justify-content-center gap-3 mt-4">
          <button
            type="button"
            className="btn btn-outline-secondary px-4 py-2 rounded-pill fw-semibold shadow-sm"
            onClick={() => navigate(-1)}
          >
            ← Back
          </button>
          <Link
            to="/login"
            className="btn btn-primary px-4 py-2 rounded-pill fw-semibold shadow-sm text-white"
            style={{ backgroundColor: '#0a2d6d' }}
          >
            Admin Login
          </Link>
        </div>
      </section>
    </main>
  );
};

export default Maintenance;