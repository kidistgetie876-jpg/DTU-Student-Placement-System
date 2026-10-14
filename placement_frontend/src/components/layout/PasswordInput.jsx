import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import './PasswordInput.css';

const PasswordInput = ({
  className = '',
  inputClassName = 'form-control',
  label = 'password',
  ...inputProps
}) => {
  const [visible, setVisible] = useState(false);
  const visibilityLabel = `${visible ? 'Hide' : 'Show'} ${label}`;

  return (
    <div className={`password-input-wrap ${className}`.trim()}>
      <input
        {...inputProps}
        className={`${inputClassName} password-input-field`.trim()}
        type={visible ? 'text' : 'password'}
      />
      <button
        type="button"
        className="password-visibility-toggle"
        aria-label={visibilityLabel}
        title={visibilityLabel}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
      </button>
    </div>
  );
};

export default PasswordInput;
