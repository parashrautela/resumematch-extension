importScripts('utils/promptBuilder.js');

const BACKEND_URL = 'https://resumematch-extension-production.up.railway.app';

// ── First-launch detection: open onboarding if needed ──
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        // Fresh install — open onboarding in a new tab
        chrome.storage.local.get(['onboarding_complete'], (result) => {
            if (!result.onboarding_complete) {
                chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
            }
        });
    }
});

// ── Message Handler ──
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    // V1: Analyse JD
    if (request.action === 'ANALYSE_JD') {
        handleAnalysis(request)
            .then(result => sendResponse(result))
            .catch(err => sendResponse({ error: err.message }));
        return true;
    }

    // V1: Generate Resume
    if (request.action === 'GENERATE_RESUME') {
        handleGeneration(request)
            .then(result => sendResponse(result))
            .catch(err => sendResponse({ error: err.message }));
        return true;
    }

    // V2: Extract Projects from resume
    if (request.action === 'EXTRACT_PROJECTS') {
        handleExtractProjects(request)
            .then(result => sendResponse(result))
            .catch(err => sendResponse({ error: err.message }));
        return true;
    }

    // V2: Generate Questions for a project
    if (request.action === 'GET_QUESTIONS') {
        handleGetQuestions(request)
            .then(result => sendResponse(result))
            .catch(err => sendResponse({ error: err.message }));
        return true;
    }

    // V2: Save answers to storage
    if (request.action === 'SAVE_ANSWERS') {
        chrome.storage.local.set({ answer_bank: request.answerBank }, () => {
            sendResponse({ success: true });
        });
        return true;
    }

    // V2: Get answer bank from storage
    if (request.action === 'GET_ANSWER_BANK') {
        chrome.storage.local.get(['answer_bank'], (result) => {
            sendResponse({ answerBank: result.answer_bank || [] });
        });
        return true;
    }

    // V2: Update a specific answer
    if (request.action === 'UPDATE_ANSWER') {
        chrome.storage.local.get(['answer_bank'], (result) => {
            const bank = result.answer_bank || [];
            const project = bank.find(p => p.project_id === request.projectId);
            if (project) {
                const answer = project.answers.find(a => a.question_id === request.questionId);
                if (answer) {
                    answer.raw_answer = request.newAnswer;
                    answer.polished_answer = request.newAnswer;
                    answer.last_updated = new Date().toISOString();
                }
            }
            chrome.storage.local.set({ answer_bank: bank }, () => {
                sendResponse({ success: true });
            });
        });
        return true;
    }

    // V1 legacy: Download DOCX (kept for compatibility)
    if (request.action === 'DOWNLOAD_DOCX') {
        handleDownloadDocx(request);
        return false;
    }
});

// ── V1 Handlers ──
async function handleAnalysis({ jdText }) {
    const truncatedJd = jdText.substring(0, 15000);

    const response = await fetch(`${BACKEND_URL}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jdText: truncatedJd })
    });

    if (!response.ok) {
        throw new Error("Failed to analyze job description via backend.");
    }

    const result = await response.json();
    return { data: result.data };
}

async function handleGeneration({ jdText, resumeText, analysisData }) {
    const truncatedResume = resumeText.substring(0, 15000);

    const response = await fetch(`${BACKEND_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jdText, resumeText: truncatedResume, analysisData })
    });

    if (!response.ok) {
        throw new Error("Failed to generate tailored resume via backend.");
    }

    const result = await response.json();
    return { resume: result.resume };
}

// ── V2 Handlers ──
async function handleExtractProjects({ resumeText }) {
    const truncatedResume = resumeText.substring(0, 15000);

    const response = await fetch(`${BACKEND_URL}/api/extract-projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeText: truncatedResume })
    });

    if (!response.ok) {
        throw new Error("Failed to extract projects from resume.");
    }

    const result = await response.json();
    return { projects: result.projects || [] };
}

async function handleGetQuestions({ projectName, projectSummary }) {
    const response = await fetch(`${BACKEND_URL}/api/generate-questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName, projectSummary })
    });

    if (!response.ok) {
        throw new Error("Failed to generate questions.");
    }

    const result = await response.json();
    return { questions: result.questions || [] };
}

// ── Legacy DOCX handler ──
function handleDownloadDocx({ resumeText, jobTitle, companyName }) {
    // Placeholder from V1 — no-op for now
}
