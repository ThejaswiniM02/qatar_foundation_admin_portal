from flask import Flask, request, jsonify, session, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
from datetime import datetime, timedelta
import secrets, re

app = Flask(__name__)
app.secret_key = secrets.token_hex(32)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///qatar.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=30)

db = SQLAlchemy(app)

class Admin(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    full_name = db.Column(db.String(150), nullable=False)
    email = db.Column(db.String(150), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    opportunities = db.relationship('Opportunity', backref='admin', lazy=True, cascade='all, delete-orphan')

class PasswordResetToken(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    admin_id = db.Column(db.Integer, db.ForeignKey('admin.id'), nullable=False)
    token = db.Column(db.String(100), unique=True, nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)
    used = db.Column(db.Boolean, default=False)

class Opportunity(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    admin_id = db.Column(db.Integer, db.ForeignKey('admin.id'), nullable=False)
    name = db.Column(db.String(200), nullable=False)
    category = db.Column(db.String(100), nullable=False)
    duration = db.Column(db.String(100), nullable=False)
    start_date = db.Column(db.String(50), nullable=False)
    description = db.Column(db.Text, nullable=False)
    skills = db.Column(db.String(500), nullable=False)
    future_opportunities = db.Column(db.Text, nullable=False)
    max_applicants = db.Column(db.Integer, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'category': self.category,
            'duration': self.duration,
            'start_date': self.start_date,
            'description': self.description,
            'skills': self.skills,
            'future_opportunities': self.future_opportunities,
            'max_applicants': self.max_applicants,
        }

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'admin_id' not in session:
            return jsonify({'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return decorated

@app.route('/')
def index():
    return send_from_directory('sky', 'admin.html')

@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory('sky', filename)

@app.route('/api/signup', methods=['POST'])
def signup():
    data = request.get_json()
    full_name = data.get('full_name', '').strip()
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    confirm_password = data.get('confirm_password', '')

    if not all([full_name, email, password, confirm_password]):
        return jsonify({'error': 'All fields are required.'}), 400
    if not re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', email):
        return jsonify({'error': 'Invalid email format.'}), 400
    if len(password) < 8:
        return jsonify({'error': 'Password must be at least 8 characters.'}), 400
    if password != confirm_password:
        return jsonify({'error': 'Passwords do not match.'}), 400
    if Admin.query.filter_by(email=email).first():
        return jsonify({'error': 'An account with this email already exists.'}), 409

    admin = Admin(full_name=full_name, email=email, password_hash=generate_password_hash(password))
    db.session.add(admin)
    db.session.commit()
    return jsonify({'message': 'Account created successfully.'}), 201

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    remember_me = data.get('remember_me', False)

    if not email or not password:
        return jsonify({'error': 'All fields are required.'}), 400

    admin = Admin.query.filter_by(email=email).first()
    if not admin or not check_password_hash(admin.password_hash, password):
        return jsonify({'error': 'Invalid email or password.'}), 401

    session['admin_id'] = admin.id
    session['admin_name'] = admin.full_name
    session.permanent = bool(remember_me)
    return jsonify({'message': 'Login successful.', 'admin_name': admin.full_name}), 200

@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'message': 'Logged out.'}), 200

@app.route('/api/forgot-password', methods=['POST'])
def forgot_password():
    data = request.get_json()
    email = data.get('email', '').strip().lower()
    admin = Admin.query.filter_by(email=email).first()
    if admin:
        token = secrets.token_urlsafe(32)
        reset = PasswordResetToken(
            admin_id=admin.id,
            token=token,
            expires_at=datetime.utcnow() + timedelta(hours=1)
        )
        db.session.add(reset)
        db.session.commit()
        print(f"[RESET LINK] http://localhost:5000/reset?token={token}")
    return jsonify({'message': 'If this email is registered, a reset link has been sent.'}), 200

@app.route('/api/opportunities', methods=['GET'])
@login_required
def get_opportunities():
    opps = Opportunity.query.filter_by(admin_id=session['admin_id']).order_by(Opportunity.created_at.desc()).all()
    return jsonify([o.to_dict() for o in opps]), 200

@app.route('/api/opportunities', methods=['POST'])
@login_required
def create_opportunity():
    data = request.get_json()
    required = ['name', 'category', 'duration', 'start_date', 'description', 'skills', 'future_opportunities']
    for field in required:
        if not data.get(field, '').strip():
            return jsonify({'error': f'{field.replace("_", " ").title()} is required.'}), 400

    max_applicants = data.get('max_applicants')
    if max_applicants:
        try:
            max_applicants = int(max_applicants)
        except ValueError:
            return jsonify({'error': 'Max applicants must be a number.'}), 400
    else:
        max_applicants = None

    opp = Opportunity(
        admin_id=session['admin_id'],
        name=data['name'].strip(),
        category=data['category'],
        duration=data['duration'].strip(),
        start_date=data['start_date'].strip(),
        description=data['description'].strip(),
        skills=data['skills'].strip(),
        future_opportunities=data['future_opportunities'].strip(),
        max_applicants=max_applicants
    )
    db.session.add(opp)
    db.session.commit()
    return jsonify(opp.to_dict()), 201

@app.route('/api/opportunities/<int:opp_id>', methods=['PUT'])
@login_required
def update_opportunity(opp_id):
    opp = Opportunity.query.filter_by(id=opp_id, admin_id=session['admin_id']).first()
    if not opp:
        return jsonify({'error': 'Not found or access denied.'}), 404

    data = request.get_json()
    required = ['name', 'category', 'duration', 'start_date', 'description', 'skills', 'future_opportunities']
    for field in required:
        if not data.get(field, '').strip():
            return jsonify({'error': f'{field.replace("_", " ").title()} is required.'}), 400

    max_applicants = data.get('max_applicants')
    if max_applicants:
        try:
            max_applicants = int(max_applicants)
        except ValueError:
            return jsonify({'error': 'Max applicants must be a number.'}), 400
    else:
        max_applicants = None

    opp.name = data['name'].strip()
    opp.category = data['category']
    opp.duration = data['duration'].strip()
    opp.start_date = data['start_date'].strip()
    opp.description = data['description'].strip()
    opp.skills = data['skills'].strip()
    opp.future_opportunities = data['future_opportunities'].strip()
    opp.max_applicants = max_applicants
    db.session.commit()
    return jsonify(opp.to_dict()), 200

@app.route('/api/opportunities/<int:opp_id>', methods=['DELETE'])
@login_required
def delete_opportunity(opp_id):
    opp = Opportunity.query.filter_by(id=opp_id, admin_id=session['admin_id']).first()
    if not opp:
        return jsonify({'error': 'Not found or access denied.'}), 404
    db.session.delete(opp)
    db.session.commit()
    return jsonify({'message': 'Deleted successfully.'}), 200

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True, port=5000)