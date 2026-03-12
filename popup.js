// ══════════════════════════════════════════════
// ResumeMatch V2 — Popup Logic
// Two-tab structure: Job Match + Answer Bank
// ══════════════════════════════════════════════

// ── State ──
const VIEWS = {
    NO_RESUME: 'view-no-resume',
    IDLE: 'view-idle',
    LOADING: 'view-loading',
    RESULTS: 'view-results',
    GENERATING: 'view-generating',
    SUCCESS: 'view-success',
    ERROR: 'view-error'
};

let currentState = {
    resume: null,
    jobData: null,
    analysisData: null,
    generatedResume: null,
    activeTab: 'job-match',
    dismissedKeywords: []  // { keyword, type: 'critical'|'recommended' }
};

// ── DOM Elements ──
const views = Object.values(VIEWS).map(id => document.getElementById(id));
const editResumeLink = document.getElementById('edit-resume-link');
const headerActions = document.getElementById('header-actions');
const idleWarning = document.getElementById('idle-warning');

// Job Match elements
const criticalCount = document.getElementById('critical-count');
const criticalChips = document.getElementById('critical-chips');
const recommendedCount = document.getElementById('recommended-count');
const recommendedChips = document.getElementById('recommended-chips');

const generateResumeBtn = document.getElementById('generate-resume-btn');
const downloadResumeBtn = document.getElementById('download-resume-btn');
const retryBtn = document.getElementById('retry-btn');
const errorTitle = document.getElementById('error-title');
const errorMessage = document.getElementById('error-message');
const successSummary = document.getElementById('success-summary');
const toastEl = document.getElementById('toast');
const startOnboardingBtn = document.getElementById('start-onboarding-btn');

// Tab elements
const tabBar = document.getElementById('tab-bar');
const tabButtons = tabBar.querySelectorAll('.tab');
const tabContentJobMatch = document.getElementById('tab-content-job-match');
const tabContentAnswerBank = document.getElementById('tab-content-answer-bank');
const answerBankContainer = document.getElementById('answer-bank-container');

// Resume modal elements
const resumeModal = document.getElementById('resume-modal');
const resumeModalBody = document.getElementById('resume-modal-body');
const resumeModalClose = document.getElementById('resume-modal-close');
const resumeModalBackdrop = document.getElementById('resume-modal-backdrop');
const resumeModalUpdateBtn = document.getElementById('resume-modal-update-btn');
const viewResumeLink = document.getElementById('view-resume-link');

// ── Initialization ──
document.addEventListener('DOMContentLoaded', async () => {
    await migrateStorage();
    await loadStoredData();
    setupEventListeners();
    setupTabListeners();
    checkCurrentTab();
});

// ── Storage Migration (V1 → V2) ──
async function migrateStorage() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['user_resume', 'user_resume_text'], (result) => {
            if (result.user_resume && !result.user_resume_text) {
                // Migrate V1 key to V2 key
                chrome.storage.local.set(
                    { user_resume_text: result.user_resume },
                    () => resolve()
                );
            } else {
                resolve();
            }
        });
    });
}

async function loadStoredData() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['user_resume_text', 'last_active_tab'], (result) => {
            currentState.resume = result.user_resume_text || null;

            // Restore last active tab
            if (result.last_active_tab === 'answer-bank') {
                switchTab('answer-bank');
            }

            resolve();
        });
    });
}

function setupEventListeners() {
    // Update resume link → opens onboarding
    editResumeLink.addEventListener('click', (e) => {
        e.preventDefault();
        openOnboarding();
    });

    // Start onboarding button (no resume state)
    if (startOnboardingBtn) {
        startOnboardingBtn.addEventListener('click', () => {
            openOnboarding();
        });
    }

    generateResumeBtn.addEventListener('click', handleGenerateResume);
    downloadResumeBtn.addEventListener('click', handleDownloadResume);
    retryBtn.addEventListener('click', checkCurrentTab);

    // View Resume modal listeners
    if (viewResumeLink) {
        viewResumeLink.addEventListener('click', (e) => {
            e.preventDefault();
            openResumeModal();
        });
    }
    if (resumeModalClose) {
        resumeModalClose.addEventListener('click', closeResumeModal);
    }
    if (resumeModalBackdrop) {
        resumeModalBackdrop.addEventListener('click', closeResumeModal);
    }
    if (resumeModalUpdateBtn) {
        resumeModalUpdateBtn.addEventListener('click', () => {
            closeResumeModal();
            openOnboarding();
        });
    }
}

function setupTabListeners() {
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.getAttribute('data-tab');
            switchTab(tabName);
        });
    });
}

// ── Tab Switching ──
function switchTab(tabName) {
    currentState.activeTab = tabName;

    // Update tab button states
    tabButtons.forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
    });

    // Show/hide tab content
    if (tabName === 'job-match') {
        tabContentJobMatch.classList.add('active');
        tabContentAnswerBank.classList.remove('active');
        if (headerActions) headerActions.classList.remove('hidden');
    } else {
        tabContentJobMatch.classList.remove('active');
        tabContentAnswerBank.classList.add('active');
        if (headerActions) headerActions.classList.add('hidden');
        
        // Trigger Answer Generator logic
        if (typeof AnswerGenerator !== 'undefined') {
            AnswerGenerator.onTabActivated(currentState.jobData);
        }
    }

    // Persist tab choice
    chrome.storage.local.set({ last_active_tab: tabName });
}

// ── Open Onboarding Tab ──
function openOnboarding() {
    const onboardingUrl = chrome.runtime.getURL('onboarding.html');
    chrome.tabs.create({ url: onboardingUrl });
}

// ── Resume Preview Modal ──
function openResumeModal() {
    if (!resumeModal || !resumeModalBody) return;

    if (currentState.resume && currentState.resume.trim().length > 0) {
        // Render the resume text
        const textEl = document.createElement('div');
        textEl.className = 'resume-modal-text';
        textEl.textContent = currentState.resume;
        resumeModalBody.innerHTML = '';
        resumeModalBody.appendChild(textEl);
    } else {
        resumeModalBody.innerHTML = '<p class="resume-modal-empty">No resume found. Upload one via onboarding.</p>';
    }

    resumeModal.classList.remove('hidden');
}

function closeResumeModal() {
    if (resumeModal) {
        resumeModal.classList.add('hidden');
    }
}

 // AnswerGenerator handles its own logic inside answerbank.js

// ── View Navigation (Job Match tab only) ──
function showView(viewId) {
    views.forEach(v => {
        if (v) v.classList.add('hidden');
    });
    const targetView = document.getElementById(viewId);
    if (targetView) targetView.classList.remove('hidden');

    // Show/hide header actions
    if (currentState.resume && headerActions) {
        headerActions.classList.remove('hidden');
    }

    // Handle idle warnings
    if (viewId === VIEWS.IDLE && !currentState.resume) {
        idleWarning.classList.remove('hidden');
    } else if (idleWarning) {
        idleWarning.classList.add('hidden');
    }
}

function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.remove('hidden');
    toastEl.classList.add('show');
    setTimeout(() => {
        toastEl.classList.remove('show');
        setTimeout(() => toastEl.classList.add('hidden'), 300);
    }, 2000);
}

// ── Main Logic Flow ──
async function checkCurrentTab() {
    if (!currentState.resume) {
        showView(VIEWS.NO_RESUME);
        return;
    }

    // Get active tab
    chrome.tabs.query({ active: true, currentWindow: true }, async function (tabs) {
        const activeTab = tabs[0];

        // Check if it's a valid URL for script injection
        if (!activeTab || !activeTab.url || activeTab.url.startsWith('chrome://') || activeTab.url.startsWith('chrome-extension://')) {
            showView(VIEWS.IDLE);
            return;
        }

        // Directly inject and execute extraction code on the page
        try {
            const results = await chrome.scripting.executeScript({
                target: { tabId: activeTab.id },
                func: () => {
                    // This function runs IN the context of the web page
                    const keywords = ['requirements', 'responsibilities', 'qualifications',
                        'what you\'ll do', 'what we are looking for', 'about the role',
                        'experience', 'skills', 'education', 'salary', 'compensation'];

                    // Strategy 1: Try common JD container selectors
                    const containerSelectors = [
                        'div.jobs-description__content', 'div#job-details', 'article.jobs-description',
                        '.jobs-search__job-details--container', '.job-view-layout',
                        'div#jobDescriptionText',
                        '#content', '.content', 'main', 'article',
                        '.job-description', '#job-description',
                        '.posting-requirements', '.section-wrapper',
                        '[role="main"]'
                    ];

                    for (const selector of containerSelectors) {
                        const el = document.querySelector(selector);
                        if (el && el.innerText && el.innerText.length > 200) {
                            return {
                                text: el.innerText.trim(),
                                title: document.querySelector('h1')?.innerText?.trim() || document.title || 'Job',
                                company: window.location.hostname.replace('www.', '').replace('job-boards.', '').split('.')[0] || 'Company'
                            };
                        }
                    }

                    // Strategy 2: Heuristic scoring
                    const candidates = Array.from(document.querySelectorAll('div, section, article, main'));
                    let bestEl = null;
                    let highestScore = 0;

                    for (const el of candidates) {
                        const text = el.innerText || '';
                        if (text.length < 300) continue;
                        if (['NAV', 'FOOTER', 'HEADER', 'ASIDE'].includes(el.tagName)) continue;

                        let score = 0;
                        const lowerText = text.toLowerCase();
                        for (const kw of keywords) {
                            if (lowerText.includes(kw)) score += 10;
                        }
                        score += Math.min(text.length / 500, 10);
                        score += Math.min(el.querySelectorAll('li').length, 20);

                        if (score > highestScore) {
                            highestScore = score;
                            bestEl = el;
                        }
                    }

                    if (bestEl && highestScore > 10) {
                        return {
                            text: bestEl.innerText.trim(),
                            title: document.querySelector('h1')?.innerText?.trim() || document.title || 'Job',
                            company: window.location.hostname.replace('www.', '').replace('job-boards.', '').split('.')[0] || 'Company'
                        };
                    }

                    // Strategy 3: Grab whole body minus nav/footer
                    const bodyClone = document.body.cloneNode(true);
                    bodyClone.querySelectorAll('nav, footer, header, script, style, noscript, aside').forEach(t => t.remove());
                    const bodyText = bodyClone.innerText.trim();
                    if (bodyText.length > 300) {
                        return {
                            text: bodyText,
                            title: document.querySelector('h1')?.innerText?.trim() || document.title || 'Job',
                            company: window.location.hostname.replace('www.', '').replace('job-boards.', '').split('.')[0] || 'Company'
                        };
                    }

                    return null;
                }
            });

            const jdData = results?.[0]?.result;

            if (jdData && jdData.text) {
                currentState.jobData = jdData;
                startAnalysis(jdData.text);
            } else {
                showView(VIEWS.IDLE);
            }
        } catch (err) {
            console.error('Script injection failed:', err);
            showView(VIEWS.IDLE);
        }
    });
}

function startAnalysis(jdText) {
    showView(VIEWS.LOADING);

    chrome.runtime.sendMessage({
        action: 'ANALYSE_JD',
        jdText: jdText,
        resumeText: currentState.resume
    }, (response) => {
        if (chrome.runtime.lastError || !response || response.error) {
            showError("Analysis Failed", response?.error || "We couldn't analyze the job description. Please try again.");
        } else {
            currentState.analysisData = response.data;
            displayResults(response.data);
        }
    });
}

function displayResults(data) {
    const critical = data.critical_keywords || [];
    const recommended = data.recommended_phrases || [];

    if (critical.length === 0 && recommended.length === 0) {
        showError("No Gaps Found", "We couldn't find specific gaps — your resume may already be well-aligned.");
        return;
    }

    // Reset dismissed state for fresh analysis
    currentState.dismissedKeywords = [];

    renderActiveChips(critical, recommended);
    renderDismissedTray();
    updateGenerateButtonState();
    showView(VIEWS.RESULTS);
}

function renderActiveChips(critical, recommended) {
    // Filter out dismissed
    const dismissedSet = new Set(currentState.dismissedKeywords.map(d => d.keyword));
    const activeCritical = (critical || currentState.analysisData?.critical_keywords || []).filter(k => !dismissedSet.has(k));
    const activeRecommended = (recommended || currentState.analysisData?.recommended_phrases || []).filter(k => !dismissedSet.has(k));

    criticalCount.textContent = activeCritical.length;
    recommendedCount.textContent = activeRecommended.length;

    // Clear existing
    criticalChips.innerHTML = '';
    recommendedChips.innerHTML = '';

    // Populate critical with X button
    activeCritical.slice(0, 8).forEach((kw, i) => {
        criticalChips.appendChild(createActiveChip(kw, 'critical', i));
    });
    if (activeCritical.length > 8) {
        const chip = document.createElement('div');
        chip.className = 'chip critical';
        chip.textContent = `+${activeCritical.length - 8} more`;
        criticalChips.appendChild(chip);
    }

    // Populate recommended with X button
    activeRecommended.slice(0, 6).forEach((kw, i) => {
        recommendedChips.appendChild(createActiveChip(kw, 'recommended', i));
    });
}

function createActiveChip(keyword, type, index) {
    const chip = document.createElement('div');
    chip.className = `chip ${type}`;
    chip.style.animationDelay = `${index * 30}ms`;

    const textSpan = document.createElement('span');
    textSpan.className = 'chip-text';
    textSpan.textContent = keyword;
    chip.appendChild(textSpan);

    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'chip-dismiss-btn';
    dismissBtn.title = `Remove ${keyword}`;
    dismissBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    dismissBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleDismissKeyword(keyword, type, chip);
    });
    chip.appendChild(dismissBtn);

    return chip;
}

function handleDismissKeyword(keyword, type, chipEl) {
    // Animate out
    chipEl.classList.add('chip-exit');
    chipEl.addEventListener('animationend', () => {
        // Add to dismissed list
        currentState.dismissedKeywords.push({ keyword, type });
        // Re-render
        renderActiveChips();
        renderDismissedTray();
        updateGenerateButtonState();
    }, { once: true });
}

function handleRestoreKeyword(keyword, type) {
    // Remove from dismissed
    currentState.dismissedKeywords = currentState.dismissedKeywords.filter(d => d.keyword !== keyword);
    // Re-render
    renderActiveChips();
    renderDismissedTray();
    updateGenerateButtonState();
}

function renderDismissedTray() {
    const tray = document.getElementById('dismissed-tray');
    const chipsContainer = document.getElementById('dismissed-chips');
    if (!tray || !chipsContainer) return;

    if (currentState.dismissedKeywords.length === 0) {
        tray.classList.add('hidden');
        return;
    }

    tray.classList.remove('hidden');
    chipsContainer.innerHTML = '';

    currentState.dismissedKeywords.forEach(({ keyword, type }) => {
        const chip = document.createElement('div');
        chip.className = 'chip dismissed chip-enter';
        chip.title = 'Click to restore';

        chip.innerHTML = `<span class="chip-restore-icon">↩</span><span class="chip-text">${keyword}</span>`;
        chip.addEventListener('click', () => handleRestoreKeyword(keyword, type));

        chipsContainer.appendChild(chip);
    });
}

function updateGenerateButtonState() {
    const dismissedSet = new Set(currentState.dismissedKeywords.map(d => d.keyword));
    const allCritical = currentState.analysisData?.critical_keywords || [];
    const allRecommended = currentState.analysisData?.recommended_phrases || [];
    const totalActive = allCritical.filter(k => !dismissedSet.has(k)).length +
                        allRecommended.filter(k => !dismissedSet.has(k)).length;

    const disabledMsg = document.getElementById('generate-disabled-msg');
    const helpText = document.getElementById('generate-help-text');

    if (totalActive === 0) {
        generateResumeBtn.disabled = true;
        if (disabledMsg) disabledMsg.classList.remove('hidden');
        if (helpText) helpText.classList.add('hidden');
    } else {
        generateResumeBtn.disabled = false;
        if (disabledMsg) disabledMsg.classList.add('hidden');
        if (helpText) helpText.classList.remove('hidden');
    }
}

function handleGenerateResume() {
    showView(VIEWS.GENERATING);

    // Filter out dismissed keywords — only send active ones
    const dismissedSet = new Set(currentState.dismissedKeywords.map(d => d.keyword));
    const filteredAnalysis = {
        ...currentState.analysisData,
        critical_keywords: (currentState.analysisData.critical_keywords || []).filter(k => !dismissedSet.has(k)),
        recommended_phrases: (currentState.analysisData.recommended_phrases || []).filter(k => !dismissedSet.has(k)),
    };

    console.log('Generating with active keywords only:', {
        critical: filteredAnalysis.critical_keywords,
        recommended: filteredAnalysis.recommended_phrases,
        dismissed: currentState.dismissedKeywords.map(d => d.keyword)
    });

    chrome.runtime.sendMessage({
        action: 'GENERATE_RESUME',
        jdText: currentState.jobData?.text || '',
        analysisData: filteredAnalysis,
        resumeText: currentState.resume
    }, (response) => {
        if (chrome.runtime.lastError || !response || response.error) {
            showError("Generation Failed", response?.error || "We couldn't rewrite your resume. Please try again.");
        } else if (!response.resume || typeof response.resume !== 'object') {
            console.error('Invalid resume response:', response);
            showError("Generation Failed", "Received an invalid resume format. Please reload the extension and try again.");
        } else {
            currentState.generatedResume = response.resume;
            console.log('Resume data stored:', Object.keys(currentState.generatedResume));
            showSuccessState();
        }
    });
}

function showSuccessState() {
    const addedCount = (currentState.analysisData.critical_keywords?.length || 0) +
        (currentState.analysisData.recommended_phrases?.length || 0);
    successSummary.textContent = `Optimized for ${currentState.analysisData.job_title || 'this role'}`;
    showView(VIEWS.SUCCESS);
}

async function handleDownloadResume() {
    if (!currentState.generatedResume) {
        showToast('No resume data found. Please generate again.');
        return;
    }

    const title = currentState.analysisData?.job_title || 'Target';
    const company = currentState.analysisData?.company_name || 'Role';

    try {
        const response = await fetch('https://resumematch-extension-production.up.railway.app/api/pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentState.generatedResume)
        });

        if (!response.ok) {
            throw new Error('PDF generation failed');
        }

        const blob = await response.blob();
        const safeName = `${title}_${company}`.replace(/[^a-z0-9]/gi, '_').toLowerCase();

        // Convert blob to data URL for chrome.downloads API
        const reader = new FileReader();
        reader.onloadend = function () {
            chrome.downloads.download({
                url: reader.result,
                filename: `ResumeMatch_${safeName}.pdf`,
                saveAs: true
            }, (downloadId) => {
                if (chrome.runtime.lastError) {
                    console.error('Download error:', chrome.runtime.lastError);
                    showToast('PDF download failed, try again.');
                }
            });
        };
        reader.readAsDataURL(blob);
    } catch (err) {
        console.error('PDF download error:', err);
        showToast('PDF download failed, try again.');
    }
}

function showError(title, message) {
    errorTitle.textContent = title;
    errorMessage.textContent = message;
    showView(VIEWS.ERROR);
}
