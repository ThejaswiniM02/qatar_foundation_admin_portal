# Qatar Foundation Admin Portal — Full Stack Intern Assessment

## Tech Stack
- Backend: Python + Flask
- Database: SQLite (via SQLAlchemy)
- Frontend: Pre-built Admin UI (unchanged)

## Setup & Run

```bash
pip install -r requirements.txt
python app.py
```
Visit `http://localhost:5000`

## Features Implemented
- Admin Signup with validation
- Admin Login with Remember Me + session management
- Forgot Password with expiring reset tokens
- View, Create, Edit, Delete Opportunities
- Opportunities linked to logged-in admin — persists across sessions
- Admins cannot see each other's data

## Project Structure
```
├── app.py              # Flask backend (all API routes)
├── requirements.txt
└── sky/
    ├── admin.html      # Pre-built UI (unchanged)
    ├── admin.css       # Pre-built UI (unchanged)
    ├── admin.js        # Pre-built UI (unchanged)
    └── backend.js      # Connects UI to Flask API
```
