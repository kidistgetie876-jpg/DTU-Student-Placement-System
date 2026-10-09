import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import StudentDashboard from './StudentDashboard';
import api from '../../services/api.js';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock('../../services/api.js', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

describe('StudentDashboard', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    mockNavigate.mockReset();

    localStorage.setItem('user', JSON.stringify({ id: '1', username: 'Alice', role: 'student' }));
    api.get.mockResolvedValue({ data: [{ id: 1, name: 'Computer Science' }] });
  });

  it('shows the student overview and opens the preference form', async () => {
    render(<StudentDashboard />);

    expect(await screen.findByText(/Welcome, /i)).toBeInTheDocument();
    expect(screen.getByText(/GPA/i)).toBeInTheDocument();
    expect(screen.getByText(/Stream/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /submit preferences/i }));

    expect(screen.getByText(/Rank Your Department Preferences/i)).toBeInTheDocument();
  });

  it('hides the other stream when the student belongs to Natural Science', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) {
        return Promise.resolve({ data: [{ id: 1, name: 'Computer Science', stream: 'Natural Science' }, { id: 2, name: 'Marketing', stream: 'Social Science' }] });
      }
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id: '1', username: 'Alice', stream: 'Natural Science', email: 'alice@example.com' } } });
      }
      if (url.includes('student_preferences.php')) {
        return Promise.resolve({ data: { success: true, choices: [] } });
      }
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);

    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));

    expect(screen.getByRole('option', { name: /^Natural$/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /^Social$/i })).not.toBeInTheDocument();
  });

  it('allows a saved preference set to be edited and undone', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) {
        return Promise.resolve({ data: [
          { id: 1, name: 'Computer Science', stream: 'Natural Science', college_name: 'College of Engineering' },
          { id: 2, name: 'Electrical Engineering', stream: 'Natural Science', college_name: 'College of Engineering' },
          { id: 3, name: 'Business Administration', stream: 'Social Science', college_name: 'College of Business' },
        ] });
      }
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id: '1', username: 'Alice', stream: 'Natural Science', email: 'alice@example.com' } } });
      }
      if (url.includes('student_preferences.php')) {
        return Promise.resolve({ data: { success: true, choices: [
          { id: 1, department: 'Computer Science', stream: 'Natural Science', college_name: 'College of Engineering' },
          { id: 2, department: 'Electrical Engineering', stream: 'Natural Science', college_name: 'College of Engineering' },
        ] } });
      }
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));

    expect(screen.getByText(/Preferences already saved/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /undo changes/i })).toBeInTheDocument();
  });

  it('does not crash when the student profile GPA is missing', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) {
        return Promise.resolve({ data: { departments: [] } });
      }
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: undefined } });
      }
      if (url.includes('student_preferences.php')) {
        return Promise.resolve({ data: { success: true, choices: [] } });
      }
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);

    expect(await screen.findByText(/Welcome, /i)).toBeInTheDocument();
    expect(screen.getByText(/GPA/i)).toBeInTheDocument();
    expect(screen.getAllByText('0.00').length).toBeGreaterThan(0);
  });
});
