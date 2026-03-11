/**
 * ResumeMatch V2 — Onboarding Logic
 * Handles: PDF upload → text extraction → project detection → Q&A flow → Answer Bank storage
 * Includes: Resume change flow, back navigation, answer preservation
 */

// ── State ──
const state = {
    resumeText: null,
    resumeFileName: null,
    previousResumeText: null,
    projects: [],
    currentProjectIndex: 0,
    currentQuestionIndex: 0,
    currentQuestions: [],
    answerBank: [],
    answeredCount: 0,
    totalQuestions: 0,
    isResumeChange: false
};

// ── Backend URL ──
const BACKEND_URL = 'https://resumematch-extension-production.up.railway.app';

// ── DOM Elements ──
const screens = {
    upload: document.getElementById('screen-upload'),
    qa: document.getElementById('screen-qa'),
    transition: document.getElementById('screen-transition'),
    complete: document.getElementById('screen-complete')
};

const stepIndicators = {
    step1: document.getElementById('step-indicator-1'),
    step2: document.getElementById('step-indicator-2'),
    step3: document.getElementById('step-indicator-3')
};

const elements = {
    dropZone: document.getElementById('drop-zone'),
    fileInput: document.getElementById('file-input'),
    uploadError: document.getElementById('upload-error'),
    uploadSuccess: document.getElementById('upload-success'),
    fallbackSection: document.getElementById('fallback-section'),
    fallbackTextarea: document.getElementById('fallback-textarea'),
    fallbackSaveBtn: document.getElementById('fallback-save-btn'),
    skipOnboarding: document.getElementById('skip-onboarding'),
    loadingOverlay: document.getElementById('loading-overlay'),
    loadingText: document.getElementById('loading-text'),
    // Resume Context Bar
    resumeContextBar: document.getElementById('resume-context-bar'),
    resumeContextName: document.getElementById('resume-context-name'),
    resumeChangeBtn: document.getElementById('resume-change-btn'),
    backToResumeLink: document.getElementById('back-to-resume-link'),
    // Confirmation Modal
    confirmModalOverlay: document.getElementById('confirm-modal-overlay'),
    confirmModalBackdrop: document.getElementById('confirm-modal-backdrop'),
    confirmModalCancel: document.getElementById('confirm-modal-cancel'),
    confirmModalConfirm: document.getElementById('confirm-modal-confirm'),
    // Toast
    onboardingToast: document.getElementById('onboarding-toast'),
    // Q&A
    qaProgressFill: document.getElementById('qa-progress-fill'),
    qaProgressText: document.getElementById('qa-progress-text'),
    qaProjectName: document.getElementById('qa-project-name'),
    qaQuestionText: document.getElementById('qa-question-text'),
    qaAnswerInput: document.getElementById('qa-answer-input'),
    charCount: document.getElementById('char-count'),
    qaNextBtn: document.getElementById('qa-next-btn'),
    qaSkipQuestion: document.getElementById('qa-skip-question'),
    // Transition
    transitionTitle: document.getElementById('transition-title'),
    transitionSubtitle: document.getElementById('transition-subtitle'),
    transitionProjectName: document.getElementById('transition-project-name'),
    transitionContinueBtn: document.getElementById('transition-continue-btn'),
    // Completion
    completionSummary: document.getElementById('completion-summary'),
    completionCta: document.getElementById('completion-cta')
};

// ── Initialization ──
document.addEventListener('DOMContentLoaded', () => {
    checkExistingProgress();
    setupEventListeners();
});

async function checkExistingProgress() {
    const result = await chromeStorageGet(['onboarding_progress', 'onboarding_complete']);

    if (result.onboarding_complete) {
        showScreen('complete');
        return;
    }

    if (result.onboarding_progress) {
        const progress = result.onboarding_progress;
        state.resumeText = progress.resumeText;
        state.resumeFileName = progress.resumeFileName || 'resume.pdf';
        state.projects = progress.projects || [];
        state.answerBank = progress.answerBank || [];
        state.currentProjectIndex = progress.currentProjectIndex || 0;

        if (state.projects.length > 0 && state.currentProjectIndex < state.projects.length) {
            state.totalQuestions = state.projects.length * 5;
            state.answeredCount = progress.answeredCount || 0;
            startQAForProject(state.currentProjectIndex);
            return;
        }
    }

    showScreen('upload');
}

function setupEventListeners() {
    // Drop zone events
    const dropZone = elements.dropZone;

    dropZone.addEventListener('click', () => elements.fileInput.click());
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) handleFileUpload(file);
    });

    elements.fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) handleFileUpload(file);
    });

    // Fallback
    elements.fallbackSaveBtn.addEventListener('click', handleFallbackSave);

    // Skip
    elements.skipOnboarding.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.storage.local.set({ onboarding_complete: false });
        window.close();
    });

    // Q&A
    elements.qaAnswerInput.addEventListener('input', handleAnswerInput);
    elements.qaNextBtn.addEventListener('click', handleNextQuestion);
    elements.qaSkipQuestion.addEventListener('click', (e) => {
        e.preventDefault();
        handleSkipQuestion();
    });

    // Transition
    elements.transitionContinueBtn.addEventListener('click', handleTransitionContinue);

    // Completion
    elements.completionCta.addEventListener('click', handleCompletionCta);

    // ── NEW: Resume Change / Back Navigation ──

    // "CHANGE RESUME" button in context bar
    elements.resumeChangeBtn.addEventListener('click', () => {
        showConfirmModal();
    });

    // "← BACK TO RESUME" text link
    elements.backToResumeLink.addEventListener('click', (e) => {
        e.preventDefault();
        showConfirmModal();
    });

    // Step 1 stepper click (handled via delegation since class changes)
    stepIndicators.step1.addEventListener('click', () => {
        if (stepIndicators.step1.classList.contains('completed')) {
            showConfirmModal();
        }
    });

    // Confirmation Modal — Cancel
    elements.confirmModalCancel.addEventListener('click', hideConfirmModal);
    elements.confirmModalBackdrop.addEventListener('click', hideConfirmModal);

    // Confirmation Modal — Confirm
    elements.confirmModalConfirm.addEventListener('click', handleConfirmResumeChange);
}

// ══════════════════════════════════════
// SCREEN NAVIGATION
// ══════════════════════════════════════
function showScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.remove('active'));

    if (screens[screenName]) {
        screens[screenName].classList.add('active');
    }

    // Update step indicators
    const stepMap = { upload: 1, qa: 2, transition: 2, complete: 3 };
    const currentStep = stepMap[screenName] || 1;

    Object.values(stepIndicators).forEach((el, i) => {
        el.classList.remove('active', 'completed', 'clickable');
        if (i + 1 < currentStep) {
            el.classList.add('completed');
            // Make completed steps clickable (BUG FIX 2)
            if (i + 1 === 1 && currentStep >= 2) {
                el.classList.add('clickable');
            }
        }
        if (i + 1 === currentStep) el.classList.add('active');
    });

    // Update resume context bar filename when showing Q&A
    if (screenName === 'qa' || screenName === 'transition') {
        updateResumeContextBar();
    }
}

function updateResumeContextBar() {
    if (elements.resumeContextName && state.resumeFileName) {
        elements.resumeContextName.textContent = state.resumeFileName;
    }
}

function showLoading(text) {
    elements.loadingText.textContent = text;
    elements.loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
    elements.loadingOverlay.classList.add('hidden');
}

function showUploadError(message) {
    elements.uploadError.textContent = message;
    elements.uploadError.classList.remove('hidden');
    elements.uploadSuccess.classList.add('hidden');
}

function hideUploadError() {
    elements.uploadError.classList.add('hidden');
}

// ══════════════════════════════════════
// CONFIRMATION MODAL (BUG FIX 3)
// ══════════════════════════════════════
function showConfirmModal() {
    elements.confirmModalOverlay.classList.remove('hidden');
}

function hideConfirmModal() {
    elements.confirmModalOverlay.classList.add('hidden');
}

function handleConfirmResumeChange() {
    hideConfirmModal();

    // Save current answers before navigating back
    state.previousResumeText = state.resumeText;
    state.isResumeChange = true;

    // Save progress so answers are preserved
    saveProgress();

    // Navigate back to upload screen
    showScreen('upload');

    // Reset upload UI
    elements.uploadSuccess.classList.add('hidden');
    hideUploadError();
    elements.fallbackSection.classList.add('hidden');
    elements.fileInput.value = '';
}

// ══════════════════════════════════════
// TOAST NOTIFICATION (BUG FIX 4)
// ══════════════════════════════════════
function showOnboardingToast(message, duration = 4000) {
    const toast = elements.onboardingToast;
    toast.textContent = message;
    toast.classList.remove('hidden');

    // Force reflow to restart animation
    toast.offsetHeight;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.classList.add('hidden');
        }, 300);
    }, duration);
}

// ══════════════════════════════════════
// PDF UPLOAD HANDLING
// ══════════════════════════════════════
async function handleFileUpload(file) {
    hideUploadError();
    elements.uploadSuccess.classList.add('hidden');

    // Track filename
    state.resumeFileName = file.name || 'resume.pdf';

    try {
        showLoading('Extracting text from your resume...');
        const text = await PdfExtractor.extractText(file);
        state.resumeText = text;

        // Store immediately
        await chromeStorageSet({
            user_resume_text: text,
            user_resume_filename: state.resumeFileName
        });

        hideLoading();
        elements.uploadSuccess.classList.remove('hidden');

        // Check if this is a resume change with smart diff
        if (state.isResumeChange && state.previousResumeText) {
            setTimeout(() => handleSmartResumeChange(text), 1000);
        } else {
            setTimeout(() => detectProjects(), 1000);
        }

    } catch (err) {
        hideLoading();

        if (err.message === 'INVALID_TYPE') {
            showUploadError('Please upload a PDF file only.');
        } else if (err.message === 'FILE_TOO_LARGE') {
            showUploadError('File must be under 5MB.');
        } else if (err.message === 'NO_TEXT_EXTRACTED') {
            showUploadError("We couldn't read this PDF. It may be a scanned image.");
            elements.fallbackSection.classList.remove('hidden');
        } else {
            showUploadError('Extraction failed. Please try again or paste your resume text below.');
            elements.fallbackSection.classList.remove('hidden');
        }
    }
}

async function handleFallbackSave() {
    const text = elements.fallbackTextarea.value.trim();
    if (!text || text.split(' ').length < 30) {
        showUploadError('Please paste a more detailed resume (at least 30 words).');
        return;
    }

    state.resumeText = text;
    state.resumeFileName = 'pasted_resume.txt';
    await chromeStorageSet({
        user_resume_text: text,
        user_resume_filename: state.resumeFileName
    });

    elements.uploadSuccess.classList.remove('hidden');
    hideUploadError();

    if (state.isResumeChange && state.previousResumeText) {
        setTimeout(() => handleSmartResumeChange(text), 1000);
    } else {
        setTimeout(() => detectProjects(), 1000);
    }
}

// ══════════════════════════════════════
// SMART RESUME CHANGE LOGIC (BUG FIX 4)
// ══════════════════════════════════════
async function handleSmartResumeChange(newText) {
    const oldText = state.previousResumeText;
    const changePercent = calculateTextDifference(oldText, newText);

    if (changePercent > 30) {
        // Substantially different — regenerate questions
        showOnboardingToast('NEW RESUME DETECTED — QUESTIONS UPDATED');

        // Reset Q&A state but preserve structure
        state.answerBank = [];
        state.answeredCount = 0;
        state.currentProjectIndex = 0;
        state.currentQuestionIndex = 0;
        state.isResumeChange = false;
        state.previousResumeText = null;

        // Re-detect projects from new resume
        detectProjects();
    } else {
        // Similar resume — keep existing questions and answers
        showOnboardingToast('RESUME UPDATED — YOUR ANSWERS ARE PRESERVED');

        state.isResumeChange = false;
        state.previousResumeText = null;

        // Save updated resume text and resume Q&A
        await saveProgress();

        // Resume Q&A from where user left off
        if (state.projects.length > 0 && state.currentProjectIndex < state.projects.length) {
            startQAForProject(state.currentProjectIndex);
        } else {
            detectProjects();
        }
    }
}

/**
 * Calculate approximate percentage difference between two texts
 * Uses word-level comparison for speed
 */
function calculateTextDifference(oldText, newText) {
    if (!oldText || !newText) return 100;

    const oldWords = new Set(oldText.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const newWords = new Set(newText.toLowerCase().split(/\s+/).filter(w => w.length > 2));

    const totalWords = Math.max(oldWords.size, newWords.size);
    if (totalWords === 0) return 100;

    let matchCount = 0;
    for (const word of oldWords) {
        if (newWords.has(word)) matchCount++;
    }

    const similarity = (matchCount / totalWords) * 100;
    return 100 - similarity;
}

// ══════════════════════════════════════
// PROJECT DETECTION
// ══════════════════════════════════════
async function detectProjects() {
    showLoading('Analyzing your resume for projects...');

    try {
        const response = await fetch(`${BACKEND_URL}/api/extract-projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resumeText: state.resumeText })
        });

        if (!response.ok) throw new Error('API error');

        const result = await response.json();
        const projects = result.projects || [];

        if (projects.length === 0) {
            hideLoading();
            showUploadError("We couldn't detect projects in your resume. Please try a different resume.");
            return;
        }

        state.projects = projects;
        state.totalQuestions = projects.length * 5;
        state.answerBank = projects.map(p => ({
            project_id: p.id,
            project_name: p.name,
            context: p.context || '',
            answers: []
        }));

        await saveProgress();

        hideLoading();
        startQAForProject(0);

    } catch (err) {
        console.error('Project detection failed:', err);
        hideLoading();
        showUploadError('Failed to analyze your resume. Please check your connection and try again.');
    }
}

// ══════════════════════════════════════
// Q&A FLOW
// ══════════════════════════════════════
async function startQAForProject(projectIndex) {
    state.currentProjectIndex = projectIndex;
    state.currentQuestionIndex = 0;

    const project = state.projects[projectIndex];

    showLoading(`Generating questions for "${project.name}"...`);

    try {
        const response = await fetch(`${BACKEND_URL}/api/generate-questions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                projectName: project.name,
                projectSummary: project.summary
            })
        });

        if (!response.ok) throw new Error('API error');

        const result = await response.json();
        state.currentQuestions = result.questions || [];

        if (state.currentQuestions.length === 0) {
            handleProjectComplete();
            return;
        }

        hideLoading();
        showScreen('qa');
        renderCurrentQuestion();

    } catch (err) {
        console.error('Question generation failed for project:', project.name, err);
        hideLoading();
        handleProjectComplete();
    }
}

function renderCurrentQuestion() {
    const project = state.projects[state.currentProjectIndex];
    const question = state.currentQuestions[state.currentQuestionIndex];

    // Progress
    const totalProjects = state.projects.length;
    const projectNum = state.currentProjectIndex + 1;
    const questionNum = state.currentQuestionIndex + 1;
    const totalQForProject = state.currentQuestions.length;

    elements.qaProgressText.textContent =
        `Project ${projectNum} of ${totalProjects} — Question ${questionNum} of ${totalQForProject}`;

    // Calculate overall progress
    const overallProgress = ((state.answeredCount) / state.totalQuestions) * 100;
    elements.qaProgressFill.style.width = `${Math.min(overallProgress, 100)}%`;

    // Project name
    elements.qaProjectName.textContent = project.name;

    // Question
    elements.qaQuestionText.textContent = question.text;

    // Reset answer input
    elements.qaAnswerInput.value = '';
    elements.charCount.textContent = '0 / 500';
    elements.qaNextBtn.disabled = true;
    elements.qaAnswerInput.focus();
}

function handleAnswerInput() {
    const len = elements.qaAnswerInput.value.length;
    elements.charCount.textContent = `${len} / 500`;
    elements.qaNextBtn.disabled = len < 20;
}

async function handleNextQuestion() {
    const answer = elements.qaAnswerInput.value.trim();
    await saveCurrentAnswer(answer);
    advanceQuestion();
}

async function handleSkipQuestion() {
    await saveCurrentAnswer('');
    advanceQuestion();
}

async function saveCurrentAnswer(answer) {
    const question = state.currentQuestions[state.currentQuestionIndex];
    const projectEntry = state.answerBank[state.currentProjectIndex];

    projectEntry.answers.push({
        question_id: question.id,
        question_type: question.type,
        question_text: question.text,
        raw_answer: answer,
        polished_answer: answer,
        last_updated: new Date().toISOString()
    });

    state.answeredCount++;
    await saveProgress();
}

function advanceQuestion() {
    state.currentQuestionIndex++;

    if (state.currentQuestionIndex >= state.currentQuestions.length) {
        handleProjectComplete();
    } else {
        renderCurrentQuestion();
    }
}

function handleProjectComplete() {
    const projectIndex = state.currentProjectIndex;
    const nextProjectIndex = projectIndex + 1;

    if (nextProjectIndex >= state.projects.length) {
        completeOnboarding();
    } else {
        const answeredInProject = state.answerBank[projectIndex]?.answers?.length || 0;
        const totalInProject = state.currentQuestions.length;
        const nextProject = state.projects[nextProjectIndex];

        elements.transitionSubtitle.textContent =
            `${answeredInProject} of ${totalInProject} questions answered`;
        elements.transitionProjectName.textContent = nextProject.name;

        showScreen('transition');
    }
}

function handleTransitionContinue() {
    startQAForProject(state.currentProjectIndex + 1);
}

// ══════════════════════════════════════
// COMPLETION
// ══════════════════════════════════════
async function completeOnboarding() {
    const totalAnswers = state.answerBank.reduce((sum, p) => sum + p.answers.filter(a => a.raw_answer).length, 0);
    const totalProjects = state.answerBank.length;

    elements.completionSummary.textContent =
        `We've saved ${totalAnswers} answers across ${totalProjects} projects.`;

    await chromeStorageSet({
        answer_bank: state.answerBank,
        onboarding_complete: true
    });

    await chromeStorageRemove(['onboarding_progress']);

    showScreen('complete');
}

function handleCompletionCta() {
    window.close();
}

// ══════════════════════════════════════
// PROGRESS PERSISTENCE
// ══════════════════════════════════════
async function saveProgress() {
    await chromeStorageSet({
        onboarding_progress: {
            resumeText: state.resumeText,
            resumeFileName: state.resumeFileName,
            projects: state.projects,
            answerBank: state.answerBank,
            currentProjectIndex: state.currentProjectIndex,
            answeredCount: state.answeredCount
        }
    });
}

// ══════════════════════════════════════
// CHROME STORAGE HELPERS
// ══════════════════════════════════════
function chromeStorageGet(keys) {
    return new Promise((resolve) => {
        chrome.storage.local.get(keys, (result) => resolve(result));
    });
}

function chromeStorageSet(data) {
    return new Promise((resolve) => {
        chrome.storage.local.set(data, () => resolve());
    });
}

function chromeStorageRemove(keys) {
    return new Promise((resolve) => {
        chrome.storage.local.remove(keys, () => resolve());
    });
}
