// STATE MANAGEMENT
const VIEWS = {
    ONBOARDING: 'view-onboarding',
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
    analysisData: null
};

// DOM ELEMENTS
const views = Object.values(VIEWS).map(id => document.getElementById(id));
const editResumeLink = document.getElementById('edit-resume-link');
const resumeInput = document.getElementById('resume-input');
const saveOnboardingBtn = document.getElementById('save-onboarding-btn');
const skipOnboardingLink = document.getElementById('skip-onboarding-link');
const onboardingError = document.getElementById('onboarding-error');
const idleWarning = document.getElementById('idle-warning');

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

// INITIALIZATION
document.addEventListener('DOMContentLoaded', async () => {
    await loadStoredData();
    setupEventListeners();
    checkCurrentTab();
});

async function loadStoredData() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['user_resume'], (result) => {
            currentState.resume = result.user_resume || null;
            resolve();
        });
    });
}

function setupEventListeners() {
    saveOnboardingBtn.addEventListener('click', handleSaveOnboarding);
    skipOnboardingLink.addEventListener('click', () => showView(VIEWS.IDLE, true));
    editResumeLink.addEventListener('click', () => {
        resumeInput.value = currentState.resume || '';
        showView(VIEWS.ONBOARDING);
    });

    generateResumeBtn.addEventListener('click', handleGenerateResume);
    downloadResumeBtn.addEventListener('click', handleDownloadResume);
    retryBtn.addEventListener('click', checkCurrentTab);
}

// VIEW NAVIGATION
function showView(viewId, forceIdle = false) {
    views.forEach(v => {
        if (v) v.classList.add('hidden');
    });
    const targetView = document.getElementById(viewId);
    if (targetView) targetView.classList.remove('hidden');

    // Header link visibility
    if (viewId === VIEWS.ONBOARDING) {
        editResumeLink.classList.add('hidden');
    } else {
        editResumeLink.classList.remove('hidden');
    }

    // Handle idle warnings
    if (viewId === VIEWS.IDLE && !currentState.resume) {
        idleWarning.classList.remove('hidden');
    } else {
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

// EVENT HANDLERS
async function handleSaveOnboarding() {
    const resumeText = resumeInput.value.trim();

    if (!resumeText) {
        onboardingError.textContent = "Please paste your resume first.";
        onboardingError.classList.remove('hidden');
        return;
    }

    if (resumeText.split(' ').length < 50) {
        // Just a warning, but we still save
        showToast("Resume seems short, but saved!");
    }

    onboardingError.classList.add('hidden');

    await chrome.storage.local.set({
        'user_resume': resumeText
    });

    currentState.resume = resumeText;

    showToast("Details saved ✓");
    setTimeout(checkCurrentTab, 1000); // Check if we are on a JD now
}

// MAIN LOGIC FLOW
async function checkCurrentTab() {
    if (!currentState.resume) {
        showView(VIEWS.ONBOARDING);
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

    criticalCount.textContent = critical.length;
    recommendedCount.textContent = recommended.length;

    // Clear existing
    criticalChips.innerHTML = '';
    recommendedChips.innerHTML = '';

    // Populate critical
    critical.slice(0, 8).forEach((kw, i) => {
        const chip = document.createElement('div');
        chip.className = 'chip critical';
        chip.textContent = kw;
        chip.style.animationDelay = `${i * 30}ms`;
        criticalChips.appendChild(chip);
    });
    if (critical.length > 8) {
        const chip = document.createElement('div');
        chip.className = 'chip critical';
        chip.textContent = `+${critical.length - 8} more`;
        criticalChips.appendChild(chip);
    }

    // Populate recommended
    recommended.slice(0, 6).forEach((kw, i) => {
        const chip = document.createElement('div');
        chip.className = 'chip recommended';
        chip.textContent = kw;
        chip.style.animationDelay = `${i * 30}ms`;
        recommendedChips.appendChild(chip);
    });

    showView(VIEWS.RESULTS);
}

function handleGenerateResume() {
    showView(VIEWS.GENERATING);

    chrome.runtime.sendMessage({
        action: 'GENERATE_RESUME',
        jdText: currentState.jobData?.text || '',
        analysisData: currentState.analysisData,
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
