import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import PasswordInput from './PasswordInput.jsx';

describe('PasswordInput', () => {
  it('starts masked and toggles visibility accessibly', () => {
    render(<PasswordInput aria-label="Password" label="password" />);
    const input = screen.getByLabelText('Password');

    expect(input).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input).toHaveAttribute('type', 'password');
  });
});
