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

The React app runs at:

- `http://localhost:3000`

### Backend

Start Apache and MySQL from XAMPP. With this project in the XAMPP `htdocs` folder,
the backend API base is:

- `http://localhost/student-placement/placement_backend`

### Password reset email configuration

Run `placement_backend/database/migrations/20261008_add_password_reset_tokens.sql`
against the placement database before enabling password recovery. The backend sends
reset messages through PHP's `mail()` function, so configure an SMTP relay in the
PHP runtime (for XAMPP, configure the `[mail function]` settings in `php.ini`).
Set these environment variables for the PHP/Apache process:

- `DTU_MAIL_FROM` — verified sender email address, for example `noreply@example.edu`
- `DTU_FRONTEND_URL` — public frontend origin, for example `https://placement.example.edu`

For local development only, the frontend URL defaults to the request's localhost
origin. Production deployments must set `DTU_FRONTEND_URL` so reset links point to
the deployed frontend.

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
