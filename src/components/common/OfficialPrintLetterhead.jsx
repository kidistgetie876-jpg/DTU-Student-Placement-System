import React from 'react';
import dtuLogo from '../../assets/images6.jpg';
import './OfficialPrintLetterhead.css';

const OfficialPrintLetterhead = ({ office, title, metadata }) => (
  <div className="dtu-print-letterhead">
    <img src={dtuLogo} alt="Debre Tabor University seal" />
    <div className="dtu-print-letterhead-copy">
      <div className="dtu-print-letterhead-university">DEBRE TABOR UNIVERSITY</div>
      {office && <div className="dtu-print-letterhead-office">{office}</div>}
      {title && <div className="dtu-print-letterhead-title">{title}</div>}
      {metadata && <div className="dtu-print-letterhead-metadata">{metadata}</div>}
    </div>
  </div>
);

export default OfficialPrintLetterhead;