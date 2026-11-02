import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ManageDepartments from './ManageDepartments';
import EditDepartment from './EditDepartment';
import api from '../../services/api.js';

jest.mock('../../services/api.js', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
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

  it('loads all departments for the management table and uses the complete total', async () => {
    api.get.mockImplementation((url) => {
      if (url === 'api/common/departments_api.php') {
        return Promise.resolve({
          data: {
            success: true,
            total_departments: 2,
            departments: [
              { id: 10, name: 'Computer Science', stream: 'Natural', college_name: 'Engineering', status: 'active' },
              { id: 11, name: 'Inactive Department', stream: 'Natural', college_name: 'Engineering', status: 'inactive' },
            ],
          },
        });
      }
      return Promise.resolve({ data: [] });
    });

    render(
      <MemoryRouter>
        <ManageDepartments />
      </MemoryRouter>
    );

    expect(await screen.findByText('Inactive Department')).toBeInTheDocument();
    expect(screen.getByText('2 Depts')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith(
      'api/common/departments_api.php',
      { params: { status: 'all' } },
    );
  });

  it('opens the department edit form in a modal and returns to the table', async () => {
    render(
      <MemoryRouter>
        <ManageDepartments />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Computer Science' }));

    expect(await screen.findByRole('dialog', { name: 'Edit Department' })).toBeInTheDocument();
    expect(screen.getByLabelText('Department name')).toHaveValue('Computer Science');
    const editStream = within(screen.getByRole('dialog', { name: 'Edit Department' }))
      .getByRole('combobox', { name: 'Stream' });
    const editCollege = within(screen.getByRole('dialog', { name: 'Edit Department' }))
      .getByRole('combobox', { name: 'College' });
    expect(editCollege).toHaveValue('Engineering');

    fireEvent.change(editStream, { target: { value: 'default-social' } });
    expect(Array.from(editCollege.options).map(option => option.textContent)).toEqual([
      '-- Select College --',
      'School of Law',
      'Other Social Science',
      '+ Add New College',
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Back to Departments' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Computer Science')).toBeInTheDocument();
  });

  it('removes an existing department head assignment', async () => {
    api.get.mockImplementation((url) => {
      if (url === 'api/common/departments_api.php') {
        return Promise.resolve({
          data: {
            departments: [{
              id: 10,
              name: 'Computer Science',
              stream: 'Natural',
              college_name: 'Engineering',
              status: 'active',
              head_id: 1,
              head_name: 'Amina Head',
            }],
          },
        });
      }
      if (url === 'api/admin/users_api.php') {
        return Promise.resolve({ data: { users: [{ id: 1, first_name: 'Amina', last_name: 'Head', role: 'head' }] } });
      }
      return Promise.resolve({ data: [] });
    });
    api.delete.mockResolvedValue({ data: { success: true } });

    render(
      <MemoryRouter>
        <ManageDepartments />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Assign Head Computer Science' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Head' }));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith(
      'api/admin/assign_department_head.php',
      { data: { department_id: 10 } }
    ));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Not Assigned')).toBeInTheDocument();
  });

  it('infers placement metadata from the selected college without showing duplicate inputs', async () => {
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

    fireEvent.change(await screen.findByRole('combobox', { name: /COLLEGE/ }), {
      target: { value: 'Health Science' },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. Computer Science'), {
      target: { value: 'Medicine' },
    });
    expect(screen.queryByLabelText('Placement group')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Offered semester')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('First semester only')).not.toBeInTheDocument();
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

  it('submits inferred placement metadata when editing a department', async () => {
    api.get.mockResolvedValue({
      data: {
        departments: [{
          id: 10,
          name: 'Computer Science',
          description: 'CS dept',
          stream: 'Natural',
          college_name: 'Health Science',
          college_id: 2,
        }],
      },
    });
    api.put.mockResolvedValue({ data: { success: true } });
    const onSaved = jest.fn();

    render(
      <MemoryRouter>
        <EditDepartment id={10} onClose={jest.fn()} onSaved={onSaved} />
      </MemoryRouter>
    );

    const collegeSelect = await screen.findByRole('combobox', { name: 'College' });
    expect(screen.queryByLabelText('Placement group')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Offered semester')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('First semester only')).not.toBeInTheDocument();
    fireEvent.change(collegeSelect, { target: { value: 'Other Natural Science' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      'api/common/departments_api.php',
      expect.objectContaining({
        id: 10,
        college_name: 'Other Natural Science',
        college_id: null,
        offered_semester: 2,
        is_first_semester_only: 0,
        placement_group: 'other_natural_science',
      }),
    ));
    expect(onSaved).toHaveBeenCalled();
  });

  it('limits college choices to the selected stream placement options', async () => {
    api.get.mockImplementation((url) => {
      if (url === 'api/admin/get_streams.php') {
        return Promise.resolve({
          data: { success: true, streams: [{ id: 1, name: 'Natural' }, { id: 2, name: 'Social' }, { id: 3, name: 'Legacy Stream' }] },
        });
      }
      if (url === 'api/common/colleges_api.php') {
        return Promise.resolve({
          data: {
            success: true,
            colleges: [
              { id: 2, name: 'College of Agriculture and Environmental Sciences', stream_id: 1, stream_name: 'Natural' },
              { id: 5, name: 'Freshman Faculty', stream_id: 1, stream_name: 'Natural' },
            ],
          },
        });
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

    const streamSelect = await screen.findByRole('combobox', { name: /STREAM/ });
    const collegeSelect = screen.getByRole('combobox', { name: /COLLEGE/ });
    expect(Array.from(streamSelect.options).map(option => option.textContent)).toEqual([
      '-- Select Stream --',
      'Natural Science',
      'Social Science',
      'Legacy Stream',
      '+ Add New Stream',
    ]);
    expect(Array.from(collegeSelect.options).map(option => option.textContent)).toEqual([
      '-- Select College --',
      'Gafat Institute of Technology (GIT)',
      'Health Science',
      'Other Natural Science',
      '+ Add New College',
    ]);

    fireEvent.change(streamSelect, { target: { value: '2' } });
    await waitFor(() => expect(Array.from(collegeSelect.options).map(option => option.textContent)).toEqual([
      '-- Select College --',
      'School of Law',
      'Other Social Science',
      '+ Add New College',
    ]));
    expect(streamSelect).not.toHaveValue('3');
  });

  it('adds a stream and college from the Add Department dropdowns without reloading catalogs', async () => {
    api.get.mockImplementation(url => {
      if (url === 'api/admin/get_streams.php') {
        return Promise.resolve({
          data: { success: true, streams: [{ id: 1, name: 'Natural' }, { id: 2, name: 'Social' }] },
        });
      }
      if (url === 'api/common/colleges_api.php') {
        return Promise.resolve({
          data: { success: true, colleges: [{ id: 2, name: 'Health Science', stream_id: 1, stream_name: 'Natural' }] },
        });
      }
      if (url === 'api/common/departments_api.php') {
        return Promise.resolve({ data: { departments: [] } });
      }
      return Promise.resolve({ data: { users: [] } });
    });
    api.post.mockImplementation((url, body) => {
      if (url === 'api/admin/add_stream.php') {
        return Promise.resolve({ data: { success: true, stream: { id: 3, name: body.name } } });
      }
      if (url === 'api/admin/add_college.php') {
        return Promise.resolve({
          data: { success: true, college: { id: 7, name: body.name, stream_id: body.stream_id, stream_name: 'Applied Science' } },
        });
      }
      return Promise.resolve({ data: { success: true } });
    });

    render(
      <MemoryRouter>
        <ManageDepartments />
      </MemoryRouter>
    );

    const streamSelect = await screen.findByRole('combobox', { name: /STREAM/ });
    const collegeSelect = screen.getByRole('combobox', { name: /COLLEGE/ });
    await waitFor(() => expect(streamSelect).toHaveValue('1'));

    fireEvent.change(streamSelect, { target: { value: '__add_new_stream__' } });
    fireEvent.change(await screen.findByLabelText('Stream name'), { target: { value: 'Applied Science' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add', exact: true }));

    await waitFor(() => expect(streamSelect).toHaveValue('3'));
    expect(Array.from(streamSelect.options).map(option => option.textContent)).toContain('Applied Science');
    expect(collegeSelect).toHaveValue('');

    fireEvent.change(collegeSelect, { target: { value: '__add_new_college__' } });
    fireEvent.change(await screen.findByLabelText('College name'), { target: { value: 'Applied Computing' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add', exact: true }));

    await waitFor(() => expect(collegeSelect).toHaveValue('Applied Computing'));
    expect(Array.from(collegeSelect.options).map(option => option.textContent)).toContain('Applied Computing');
    expect(api.post).toHaveBeenNthCalledWith(1, 'api/admin/add_stream.php', { name: 'Applied Science' });
    expect(api.post).toHaveBeenNthCalledWith(2, 'api/admin/add_college.php', { name: 'Applied Computing', stream_id: 3 });
    expect(api.get.mock.calls.filter(([url]) => url === 'api/admin/get_streams.php')).toHaveLength(1);
  });

  it('adds streams and colleges directly from the Edit Department dropdowns', async () => {
    api.get.mockImplementation(url => {
      if (url === 'api/common/departments_api.php') {
        return Promise.resolve({
          data: {
            departments: [{
              id: 10,
              name: 'Computer Science',
              stream: 'Natural',
              college_name: 'Health Science',
              college_id: 2,
            }],
          },
        });
      }
      if (url === 'api/admin/get_streams.php') {
        return Promise.resolve({
          data: { success: true, streams: [{ id: 1, name: 'Natural' }, { id: 2, name: 'Social' }] },
        });
      }
      if (url === 'api/common/colleges_api.php') {
        return Promise.resolve({
          data: { success: true, colleges: [{ id: 2, name: 'Health Science', stream_id: 1, stream_name: 'Natural' }] },
        });
      }
      return Promise.resolve({ data: [] });
    });
    api.post.mockImplementation((url, body) => (
      url === 'api/admin/add_stream.php'
        ? Promise.resolve({ data: { success: true, stream: { id: 3, name: body.name } } })
        : Promise.resolve({
          data: { success: true, college: { id: 7, name: body.name, stream_id: body.stream_id, stream_name: 'Custom Stream' } },
        })
    ));
    api.put.mockResolvedValue({ data: { success: true } });
    const onSaved = jest.fn();

    render(
      <MemoryRouter>
        <EditDepartment id={10} onClose={jest.fn()} onSaved={onSaved} />
      </MemoryRouter>
    );

    const streamSelect = await screen.findByRole('combobox', { name: 'Stream' });
    const collegeSelect = screen.getByRole('combobox', { name: 'College' });
    fireEvent.change(streamSelect, { target: { value: '__add_new_stream__' } });
    fireEvent.change(await screen.findByLabelText('Stream name'), { target: { value: 'Custom Stream' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add', exact: true }));

    await waitFor(() => expect(streamSelect).toHaveValue('3'));
    fireEvent.change(collegeSelect, { target: { value: '__add_new_college__' } });
    fireEvent.change(await screen.findByLabelText('College name'), { target: { value: 'Custom College' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add', exact: true }));
    await waitFor(() => expect(collegeSelect).toHaveValue('Custom College'));

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      'api/common/departments_api.php',
      expect.objectContaining({ stream: 'Custom Stream', college_name: 'Custom College', college_id: 7 }),
    ));
    expect(onSaved).toHaveBeenCalled();
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

    const streamSelect = await screen.findByRole('combobox', { name: /STREAM/ });
    const collegeSelect = screen.getByRole('combobox', { name: /COLLEGE/ });
    expect(Array.from(streamSelect.options).map(option => option.textContent)).toEqual([
      '-- Select Stream --',
      'Natural Science',
      'Social Science',
      '+ Add New Stream',
    ]);
    expect(Array.from(collegeSelect.options).map(option => option.textContent)).toEqual([
      '-- Select College --',
      'Gafat Institute of Technology (GIT)',
      'Health Science',
      'Other Natural Science',
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

});
