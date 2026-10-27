import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ManageDepartments from './ManageDepartments';
import AssignHead from './AssignHead.jsx';
import api from '../../services/api.js';

jest.mock('../../services/api.js', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
  },
}));

describe('ManageDepartments', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    api.get.mockImplementation((url) => {
      if (url === 'api/common/departments_api.php') {
        return Promise.resolve({
          data: {
            departments: [
              {
                id: 10,
                name: 'Computer Science',
                capacity: 50,
                description: 'CS dept',
                stream: 'Natural',
                college_name: 'Engineering',
                status: 'active',
                head_id: null,
              },
            ],
          },
        });
      }

      if (url === 'api/admin/users_api.php') {
        return Promise.resolve({
          data: {
            users: [
              { id: 1, username: 'Head User', role: 'head' },
              { id: 2, username: 'Coordinator User', role: 'coordinator' },
            ],
          },
        });
      }

      return Promise.resolve({ data: [] });
    });
  });

  it('renders department columns in the logical order', async () => {
    render(
      <MemoryRouter>
        <ManageDepartments />
      </MemoryRouter>
    );

    expect(await screen.findByText('Computer Science')).toBeInTheDocument();

    expect(screen.getAllByRole('columnheader').map(header => header.textContent)).toEqual([
      '#',
      'STREAM',
      'COLLEGE',
      'NAME',
      'CAPACITY',
      'HEAD NAME',
      'ACTIONS',
    ]);
    expect(screen.getAllByText('Engineering').length).toBeGreaterThanOrEqual(1);
  });

  it('saves department placement group and semester metadata', async () => {
    api.get.mockImplementation((url) => {
      if (url === 'api/admin/get_streams.php') {
        return Promise.resolve({ data: { success: true, streams: [{ id: 1, name: 'Natural' }] } });
      }
      if (url === 'api/common/colleges_api.php') {
        return Promise.resolve({
          data: { success: true, colleges: [{ id: 2, name: 'Health Science', stream_id: 1, stream_name: 'Natural' }] },
        });
      }
      if (url === 'api/common/departments_api.php') {
        return Promise.resolve({ data: { departments: [] } });
      }
      return Promise.resolve({ data: [] });
    });
    api.post.mockResolvedValue({ data: { success: true, id: 11 } });

    render(
      <MemoryRouter>
        <ManageDepartments />
      </MemoryRouter>
    );

    fireEvent.change(await screen.findByRole('combobox', { name: 'College' }), {
      target: { value: 'Health Science' },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. Computer Science'), {
      target: { value: 'Medicine' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Placement group' }), {
      target: { value: 'health_science' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Offered semester' }), {
      target: { value: '1' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'First semester only' }));
    fireEvent.click(screen.getByRole('button', { name: 'Register Department' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      'api/common/departments_api.php',
      expect.objectContaining({
        name: 'Medicine',
        college_id: 2,
        offered_semester: 1,
        is_first_semester_only: 1,
        placement_group: 'health_science',
      }),
    ));
  });

  it('loads catalog options and creates and selects new streams and colleges', async () => {
    api.get.mockImplementation((url) => {
      if (url === 'api/admin/get_streams.php') {
        return Promise.resolve({ data: { success: true, streams: [{ id: 1, name: 'Natural' }] } });
      }
      if (url === 'api/common/colleges_api.php') {
        return Promise.resolve({
          data: {
            success: true,
            colleges: [
              { id: 2, name: 'Science College', stream_id: 1, stream_name: 'Natural' },
              { id: 5, name: '  SCIENCE COLLEGE ', stream_id: 1, stream_name: 'Natural' },
            ],
          },
        });
      }
      if (url === 'api/common/departments_api.php') {
        return Promise.resolve({ data: { departments: [] } });
      }
      return Promise.resolve({ data: { users: [] } });
    });

    api.post.mockImplementation((url) => {
      if (url === 'api/admin/add_stream.php') {
        return Promise.resolve({ data: { success: true, stream: { id: 3, name: 'Health' } } });
      }
      if (url === 'api/admin/add_college.php') {
        return Promise.resolve({
          data: { success: true, college: { id: 4, name: 'Health College', stream_id: 3, stream_name: 'Health' } },
        });
      }
      return Promise.resolve({ data: { success: true } });
    });

    render(
      <MemoryRouter>
        <ManageDepartments />
      </MemoryRouter>
    );

    const streamSelect = await screen.findByRole('combobox', { name: 'Stream' });
    const collegeSelect = screen.getByRole('combobox', { name: 'College' });
    expect(screen.getByRole('option', { name: 'Natural Science' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Science College' })).toBeInTheDocument();
    expect(screen.getAllByRole('option', { name: 'Science College' })).toHaveLength(1);

    fireEvent.change(streamSelect, { target: { value: '__add_new__' } });
    fireEvent.change(screen.getByLabelText('Stream Name'), { target: { value: 'Health' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add', exact: true }));

    await waitFor(() => {
      expect(streamSelect).toHaveValue('3');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    expect(api.post).toHaveBeenCalledWith('api/admin/add_stream.php', { name: 'Health' });

    fireEvent.change(collegeSelect, { target: { value: '__add_new__' } });
    fireEvent.change(screen.getByLabelText('College Name'), { target: { value: 'Health College' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add', exact: true }));

    await waitFor(() => expect(collegeSelect).toHaveValue('Health College'));
    expect(api.post).toHaveBeenCalledWith('api/admin/add_college.php', { name: 'Health College', stream_id: 3 });
  });

  it('deduplicates the Technology aliases and blocks adding an existing college alias', async () => {
    api.get.mockImplementation((url) => {
      if (url === 'api/admin/get_streams.php') {
        return Promise.resolve({ data: { success: true, streams: [{ id: 1, name: 'Natural' }] } });
      }
      if (url === 'api/common/colleges_api.php') {
        return Promise.resolve({
          data: {
            success: true,
            colleges: [
              { id: 2, name: 'Technology', stream_id: 1, stream_name: 'Natural' },
              { id: 3, name: 'Gefat Institute of Technology', stream_id: 1, stream_name: 'Natural' },
            ],
          },
        });
      }
      if (url === 'api/common/departments_api.php') return Promise.resolve({ data: { departments: [] } });
      return Promise.resolve({ data: { users: [] } });
    });

    render(
      <MemoryRouter>
        <ManageDepartments />
      </MemoryRouter>
    );

    const collegeSelect = await screen.findByRole('combobox', { name: 'College' });
    expect(screen.getAllByRole('option', { name: 'Gafat Institute of Technology' })).toHaveLength(1);
    expect(screen.getByRole('option', { name: '-- Select College --' })).toBeInTheDocument();

    fireEvent.change(collegeSelect, { target: { value: '__add_new__' } });
    fireEvent.change(screen.getByLabelText('College Name'), {
      target: { value: ' GAFAT INSTITUTE OF TECHNOLOGY ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add', exact: true }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A college with this name already exists for the selected stream.'
    );
    expect(api.post).not.toHaveBeenCalled();
  });

  it('keeps fallback stream and college options when catalog requests fail', async () => {
    api.get.mockImplementation((url) => {
      if (url === 'api/admin/get_streams.php' || url === 'api/common/colleges_api.php') {
        return Promise.reject({ response: { status: 500, data: { message: 'Server error' } } });
      }
      if (url === 'api/common/departments_api.php') {
        return Promise.resolve({ data: { departments: [] } });
      }
      return Promise.resolve({ data: { users: [] } });
    });

    render(
      <MemoryRouter>
        <ManageDepartments />
      </MemoryRouter>
    );

    const streamSelect = await screen.findByRole('combobox', { name: 'Stream' });
    const collegeSelect = screen.getByRole('combobox', { name: 'College' });
    expect(Array.from(streamSelect.options).map(option => option.textContent)).toEqual([
      '-- Select Stream --',
      'Natural Science',
      'Social Science',
      '+ Add New Stream',
    ]);
    expect(Array.from(collegeSelect.options).map(option => option.textContent)).toEqual([
      '-- Select College --',
      'Gafat Institute of Technology',
      'Agriculture and Environmental Sciences',
      'Natural and Computational Sciences',
      'Health Science',
      'Freshman Faculty',
      '+ Add New College',
    ]);
    expect(screen.getByRole('alert')).toHaveTextContent('Streams: Server error Colleges: Server error');
  });

  it('opens an assignment dialog for the selected department and saves its head', async () => {
    api.get.mockImplementation((url) => {
      if (url === 'api/common/departments_api.php') {
        return Promise.resolve({
          data: {
            departments: [{
              id: 10,
              name: 'Computer Science',
              stream: 'Natural',
              college_name: 'Engineering',
              head_id: null,
            }],
          },
        });
      }
      if (url === 'api/admin/users_api.php') {
        return Promise.resolve({
          data: {
            users: [
              { id: 1, first_name: 'Amina', last_name: 'Head', role: 'head' },
              { id: 2, username: 'Not a head', role: 'admin' },
            ],
          },
        });
      }
      return Promise.resolve({ data: [] });
    });
    api.post.mockResolvedValue({ data: { success: true } });

    render(
      <MemoryRouter>
        <ManageDepartments />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Assign Head Computer Science' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('Computer Science')).toBeInTheDocument();
    expect(within(dialog).getByText('Natural')).toBeInTheDocument();
    expect(within(dialog).getByText('Engineering')).toBeInTheDocument();

    const headSelect = await screen.findByRole('combobox', { name: 'Department Head' });
    expect(Array.from(headSelect.options).map(option => option.textContent)).toEqual([
      '-- Select a Department Head --',
      'Amina Head',
    ]);
    fireEvent.change(headSelect, { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Assignment' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      'api/admin/assign_department_head.php',
      { department_id: 10, head_id: 1 }
    ));
    expect(await screen.findByText('Amina Head')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows heads before department selection and prevents assigning a head from another department', async () => {
    api.get.mockImplementation((url) => {
      if (url === 'api/common/departments_api.php') {
        return Promise.resolve({
          data: {
            departments: [
              { id: 10, name: 'Computer Science', head_id: 1 },
              { id: 20, name: 'Electrical Engineering', head_id: 2 },
            ],
          },
        });
      }

      if (url === 'api/admin/users_api.php') {
        return Promise.resolve({
          data: {
            users: [
              { id: 1, username: 'Head User', role: 'head' },
              { id: 2, username: 'Coordinator User', role: 'coordinator' },
              { id: 3, username: 'Available User', role: 'head' },
            ],
          },
        });
      }

      return Promise.resolve({ data: [] });
    });

    render(
      <MemoryRouter>
        <AssignHead />
      </MemoryRouter>
    );

    const [departmentSelect, headSelect] = await screen.findAllByRole('combobox');
    expect(screen.getByRole('option', { name: /Head User — assigned to Computer Science/i })).toBeDisabled();
    expect(screen.getByRole('option', { name: /Coordinator User — assigned to Electrical Engineering/i })).toBeDisabled();
    expect(screen.getByRole('option', { name: /Available User/i })).toBeEnabled();

    fireEvent.change(departmentSelect, { target: { value: '20' } });

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Available User/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /Head User — assigned to Computer Science/i })).toBeDisabled();
      expect(screen.getByRole('option', { name: /Coordinator User/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /Coordinator User/i })).toBeEnabled();
    });
    expect(headSelect).toBeInTheDocument();
  });

  it('allows searching and selecting a head after choosing a department', async () => {
    api.get.mockImplementation((url) => {
      if (url === 'api/common/departments_api.php') {
        return Promise.resolve({ data: { departments: [{ id: 10, name: 'Computer Science', head_id: 1 }] } });
      }

      if (url === 'api/admin/users_api.php') {
        return Promise.resolve({
          data: {
            users: [
              { id: 1, username: 'alpha', first_name: 'Alpha', last_name: 'Head', role: 'head' },
              { id: 2, username: 'beta', first_name: 'Beta', last_name: 'Coordinator', role: 'coordinator' },
            ],
          },
        });
      }

      return Promise.resolve({ data: [] });
    });

    render(
      <MemoryRouter>
        <AssignHead />
      </MemoryRouter>
    );

    const [departmentSelect, headSelect] = await screen.findAllByRole('combobox');
    const searchInput = screen.getByRole('searchbox', { name: 'Search available heads' });
    fireEvent.change(searchInput, { target: { value: 'beta' } });
    expect(screen.queryByRole('button', { name: 'Search' })).not.toBeInTheDocument();

    fireEvent.change(departmentSelect, { target: { value: '10' } });
    await waitFor(() => {
      expect(departmentSelect).toHaveValue('10');
      expect(searchInput).toHaveValue('beta');
      expect(headSelect).toHaveValue('');
      expect(screen.getByRole('option', { name: /Beta Coordinator/ })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: /Alpha Head/ })).not.toBeInTheDocument();
    });

    fireEvent.change(headSelect, { target: { value: '2' } });
    expect(headSelect).toHaveValue('2');
    api.put.mockResolvedValue({ data: { success: true } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Assignment' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      'api/common/departments_api.php',
      { id: 10, head_id: 2 }
    ));
  });

  it('keeps matching heads unavailable when assigned to a different department', async () => {
    api.get.mockImplementation((url) => {
      if (url === 'api/common/departments_api.php') {
        return Promise.resolve({
          data: {
            departments: [
              { id: 10, name: 'Computer Science', head_id: 1 },
              { id: 20, name: 'Electrical Engineering', head_id: 2 },
            ],
          },
        });
      }

      if (url === 'api/admin/users_api.php') {
        return Promise.resolve({
          data: {
            users: [
              { id: 1, username: 'Head User', role: 'head' },
              { id: 2, username: 'Coordinator User', role: 'coordinator' },
              { id: 3, username: 'Available User', role: 'head' },
            ],
          },
        });
      }

      return Promise.resolve({ data: [] });
    });

    render(
      <MemoryRouter>
        <AssignHead />
      </MemoryRouter>
    );

    const [departmentSelect, headSelect] = await screen.findAllByRole('combobox');
    fireEvent.change(departmentSelect, { target: { value: '20' } });
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Head User .*assigned to Computer Science/i })).toBeDisabled();
      expect(screen.getByRole('option', { name: /Coordinator User/i })).toBeEnabled();
    });

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search available heads' }), {
      target: { value: 'head user' },
    });
    expect(screen.getByRole('option', { name: /Head User .*assigned to Computer Science/i })).toBeDisabled();
    expect(headSelect).toHaveValue('');
  });
});
