# Student Placement Dashboard

A React-based admin portal for managing student placements, departments, bulk data import, system configuration, and audit logs.

## Project Structure

- `src/` — React application source code
- `public/` — public assets and HTML template
- `import_api.php` — backend endpoint for import uploads
- `departments_api.php` — department management backend
- `users_api.php` — user management backend

## Development Setup

This project is split between a frontend React app and a PHP backend.

### Frontend

Use PowerShell in the frontend folder:

```powershell
PS C:\Users\hp\student-placement> npm install
PS C:\Users\hp\student-placement> npm start
```

The local React app runs at:

- `http://127.0.0.1:3000`

### Local MAMP backend

Start Apache and MySQL from MAMP. With MAMP's default Apache port (8888) and this
project in `C:\MAMP\htdocs`, the backend API base is:

- `http://127.0.0.1:8888/student-placement/placement_backend`

Run the frontend from `placement_frontend` with `npm start`, then open either
`http://127.0.0.1:3000` or `http://localhost:3000`. The React app selects the
matching host for the API so browser session cookies are sent consistently.
The backend is available at
`http://127.0.0.1:8888/student-placement/placement_backend`.

The local database config defaults to database `placement_db`, MySQL user `root`,
password `root` (with an empty-password fallback), and MySQL port `8889`. Create
or import the placement system database in MAMP MySQL, or configure `DB_NAME`,
`DB_USER`, and `DB_PASSWORD` to match your local database.

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.

### `npm test`

Launches the test runner in the interactive watch mode.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time.

## API Usage

The frontend is configured to connect to the backend at
`http://localhost/student-placement/placement_backend`.

### Import endpoint

- `POST /api/admin/import_api.php`
- Accepts `multipart/form-data`
- Fields:
  - `dataFile` — uploaded CSV file
  - `type` — `student` or `grade`

Example with `curl`:

```bash
curl -X POST \
  -F "dataFile=@students.csv" \
  -F "type=student" \
  http://localhost/student-placement/placement_backend/api/admin/import_api.php
```

### User management

- `GET /api/admin/users_api.php` — list users
- `POST /api/admin/users_api.php` — create user
- `PUT /api/admin/users_api.php?id={id}` — update user
- `DELETE /api/admin/users_api.php?id={id}` — delete user

### Department management

- `GET /api/common/departments_api.php` — list departments
- `POST /api/common/departments_api.php` — create department
- `DELETE /api/common/departments_api.php?id={id}` — delete department

### Unassigned students

Before using the registrar's Unassigned Students tab, apply
`../placement_backend/database/migrations/20261011_create_unassigned_students.sql`
to the placement database. Successful placement runs keep the latest unassigned
student records in this table; students who later receive a placement are removed.
The list and notification endpoints also synchronize students whose current
`student_data.status` is `Not assigned`, so they appear even if a prior run did
not populate the report table.

- `GET /api/registrar/unassigned_students_api.php` — list unassigned students as JSON
- `GET /api/registrar/unassigned_students_api.php?format=csv` — download `unassigned_students_report.csv`
- `POST /api/registrar/unassigned_students_api.php` — post meeting notifications to the current unassigned students' portals

The meeting notification request accepts `meetingDate` (`YYYY-MM-DD`), `meetingTime` (`HH:MM`),
`meetingLocation`, and an optional `message`. Meeting notifications are stored
in `student_notifications` and appear in each student's portal Notifications tab.
Apply `../placement_backend/database/migrations/20261011_create_student_notifications.sql`
to enable this feature. The registrar routes require an authenticated registrar
or admin session.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
