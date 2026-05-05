// backend.js — connects the existing UI to the Flask backend
// This file overrides the form handlers in admin.js without modifying it

let editingOpportunityId = null;
let loadedOpportunities = [];

// ── Override LOGIN ──
document.getElementById('loginForm').removeEventListener('submit', null);
document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    e.stopImmediatePropagation(); // stops admin.js handler from also firing

    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    const captchaInput = document.getElementById('loginCaptchaInput').value.trim();
    const rememberMe = document.querySelector('#loginForm .remember-me input[type="checkbox"]').checked;

    // Still validate captcha on frontend
    if (!captchaInput || captchaInput !== captchas.login) {
        showError('loginCaptchaErr', 'Captcha does not match. Please try again.');
        generateCaptcha('login');
        return;
    }

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, remember_me: rememberMe })
        });
        const data = await res.json();
        if (!res.ok) {
            showError('loginPasswordErr', data.error);
            document.getElementById('loginPassword').classList.add('error');
            shakeForm('loginForm');
            generateCaptcha('login');
            return;
        }
        showToast('Login successful! Redirecting...');
        setTimeout(async () => {
            showDashboard(data.admin_name);
            await loadOpportunities();
        }, 1200);
        generateCaptcha('login');
    } catch (err) {
        showToast('Server error. Is Flask running?');
    }
}, true); // true = capture phase, runs before admin.js handler

// ── Override SIGNUP ──
document.getElementById('signupForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    e.stopImmediatePropagation();

    const name = document.getElementById('signupName').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value.trim();
    const confirmPassword = document.getElementById('signupConfirmPassword').value.trim();
    const captchaInput = document.getElementById('signupCaptchaInput').value.trim();

    if (!captchaInput || captchaInput !== captchas.signup) {
        showError('signupCaptchaErr', 'Captcha does not match.');
        generateCaptcha('signup');
        return;
    }

    try {
        const res = await fetch('/api/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ full_name: name, email, password, confirm_password: confirmPassword })
        });
        const data = await res.json();
        if (!res.ok) {
            showError('signupEmailErr', data.error);
            document.getElementById('signupEmail').classList.add('error');
            shakeForm('signupForm');
            return;
        }
        showToast('Account created successfully!');
        generateCaptcha('signup');
        document.getElementById('signupForm').reset();
        checkStrength('');
        setTimeout(() => showPage('loginPage'), 1500);
    } catch (err) {
        showToast('Server error. Is Flask running?');
    }
}, true);

// ── Override FORGOT PASSWORD ──
document.getElementById('forgotForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    e.stopImmediatePropagation();

    const email = document.getElementById('forgotEmail').value.trim();
    const captchaInput = document.getElementById('forgotCaptchaInput').value.trim();

    if (!captchaInput || captchaInput !== captchas.forgot) {
        showError('forgotCaptchaErr', 'Captcha does not match.');
        generateCaptcha('forgot');
        return;
    }

    try {
        await fetch('/api/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        showToast('If this email is registered, a reset link has been sent.');
        generateCaptcha('forgot');
        document.getElementById('forgotForm').reset();
    } catch (err) {
        showToast('Server error. Is Flask running?');
    }
}, true);

// ── Override LOGOUT ──
window.handleLogout = async function() {
    await fetch('/api/logout', { method: 'POST' });
    document.getElementById('dashboardWrapper').classList.remove('active');
    document.getElementById('authWrapper').style.display = 'flex';
    document.body.style.alignItems = '';
    showToast('Signed out successfully');
    showPage('loginPage');
};

// ── Override OPPORTUNITY FORM ──
document.getElementById('opportunityForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    e.stopImmediatePropagation();

    const name = document.getElementById('oppName').value.trim();
    const duration = document.getElementById('oppDuration').value.trim();
    const startDate = document.getElementById('oppStartDate').value;
    const description = document.getElementById('oppDescription').value.trim();
    const skillsRaw = document.getElementById('oppSkills').value.trim();
    const category = document.getElementById('oppCategory').value;
    const futureOpportunities = document.getElementById('oppFuture').value.trim();
    const maxApplicants = document.getElementById('oppMaxApplicants').value.trim();

    if (!name || !duration || !startDate || !description || !skillsRaw || !category || !futureOpportunities) {
        showToast('Please fill all required fields');
        return;
    }

    const categoryMap = {
        'technology': 'Technology', 'business': 'Business', 'design': 'Design',
        'marketing': 'Marketing', 'data': 'Data Science', 'other': 'Other'
    };

    const payload = {
        name, duration,
        start_date: startDate,
        description,
        skills: skillsRaw,
        category: categoryMap[category] || category,
        future_opportunities: futureOpportunities,
        max_applicants: maxApplicants || null
    };

    try {
        let res;
        if (editingOpportunityId) {
            res = await fetch(`/api/opportunities/${editingOpportunityId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } else {
            res = await fetch('/api/opportunities', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }

        if (!res.ok) {
            const data = await res.json();
            showToast(data.error || 'Error saving opportunity');
            return;
        }

        showToast(editingOpportunityId ? 'Opportunity updated!' : 'Opportunity created!');
        editingOpportunityId = null;
        document.querySelector('#opportunityModal .modal-header h3').textContent = 'Add New Opportunity';
        closeOpportunityModal();
        document.getElementById('opportunityForm').reset();
        await loadOpportunities();
    } catch (err) {
        showToast('Server error. Is Flask running?');
    }
}, true);

// ── Load & Render Opportunities ──
async function loadOpportunities() {
    try {
        const res = await fetch('/api/opportunities');
        if (!res.ok) return;
        loadedOpportunities = await res.json();
        renderOpportunities(loadedOpportunities);
    } catch (err) {
        console.error('Could not load opportunities:', err);
    }
}

function renderOpportunities(opps) {
    const grid = document.querySelector('.opportunities-grid');
    if (!grid) return;
    grid.innerHTML = '';

    if (opps.length === 0) {
        grid.innerHTML = '<p style="color:var(--qf-text-light);font-size:15px;padding:24px;grid-column:1/-1;">No opportunities yet. Click "Add New Opportunity" to create one.</p>';
        return;
    }

    opps.forEach(opp => {
        const skills = opp.skills.split(',').map(s => s.trim()).filter(Boolean);
        const skillTags = skills.map(s => `<span class="skill-tag">${escapeHtml(s)}</span>`).join('');

        const card = document.createElement('div');
        card.className = 'opportunity-card';
        card.dataset.id = opp.id;
        card.innerHTML = `
            <div class="opportunity-card-header">
                <h5>${escapeHtml(opp.name)}</h5>
                <div class="opportunity-meta">
                    <span><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${escapeHtml(opp.duration)}</span>
                    <span><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${escapeHtml(opp.start_date)}</span>
                </div>
                <span class="skill-tag" style="font-size:11px;">${escapeHtml(opp.category)}</span>
            </div>
            <p class="opportunity-description">${escapeHtml(opp.description)}</p>
            <div class="opportunity-skills">
                <div class="opportunity-skills-label">Skills You'll Gain</div>
                <div class="skills-tags">${skillTags}</div>
            </div>
            <div class="opportunity-footer">
                <span class="applicants-count">${opp.max_applicants ? opp.max_applicants + ' max applicants' : 'Open'}</span>
                <div style="display:flex;gap:8px;">
                    <button class="view-course-btn" style="width:auto;padding:6px 12px;" onclick="viewOppDetails(${opp.id})">View</button>
                    <button class="view-course-btn" style="width:auto;padding:6px 12px;background:#4a90d9;" onclick="editOpportunity(${opp.id})">Edit</button>
                    <button class="view-course-btn" style="width:auto;padding:6px 12px;background:#d94f4f;" onclick="deleteOpportunity(${opp.id})">Delete</button>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

function viewOppDetails(id) {
    const opp = loadedOpportunities.find(o => o.id === id);
    if (!opp) return;
    openOpportunityDetails(opp.name, {
        duration: opp.duration,
        startDate: opp.start_date,
        description: opp.description,
        skills: opp.skills.split(',').map(s => s.trim()),
        applicants: opp.max_applicants || 0,
        futureOpportunities: opp.future_opportunities,
        prerequisites: ''
    });
}

function editOpportunity(id) {
    const opp = loadedOpportunities.find(o => o.id === id);
    if (!opp) return;

    editingOpportunityId = id;
    document.querySelector('#opportunityModal .modal-header h3').textContent = 'Edit Opportunity';

    document.getElementById('oppName').value = opp.name;
    document.getElementById('oppDuration').value = opp.duration;
    document.getElementById('oppStartDate').value = opp.start_date;
    document.getElementById('oppDescription').value = opp.description;
    document.getElementById('oppSkills').value = opp.skills;
    document.getElementById('oppFuture').value = opp.future_opportunities;
    document.getElementById('oppMaxApplicants').value = opp.max_applicants || '';

    const reverseCategoryMap = {
        'Technology': 'technology', 'Business': 'business', 'Design': 'design',
        'Marketing': 'marketing', 'Data Science': 'data', 'Other': 'other'
    };
    document.getElementById('oppCategory').value = reverseCategoryMap[opp.category] || '';

    openOpportunityModal();
}

async function deleteOpportunity(id) {
    if (!confirm('Are you sure you want to permanently delete this opportunity?')) return;
    try {
        const res = await fetch(`/api/opportunities/${id}`, { method: 'DELETE' });
        if (!res.ok) {
            const data = await res.json();
            showToast(data.error || 'Delete failed');
            return;
        }
        showToast('Opportunity deleted.');
        await loadOpportunities();
    } catch (err) {
        showToast('Server error. Is Flask running?');
    }
}