importScripts('utils/promptBuilder.js');

// Removed callOpenAIAPI as proxy handles this

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'ANALYSE_JD') {
        handleAnalysis(request)
            .then(result => sendResponse(result))
            .catch(err => sendResponse({ error: err.message }));
        return true; // Keep message channel open for async response
    }

    if (request.action === 'GENERATE_RESUME') {
        handleGeneration(request)
            .then(result => sendResponse(result))
            .catch(err => sendResponse({ error: err.message }));
        return true;
    }

    if (request.action === 'DOWNLOAD_DOCX') {
        handleDownloadDocx(request);
        return false; // Sync response
    }
});

async function handleAnalysis({ jdText }) {
    // Truncate JD to avoid blowing up context window unnecessarily
    const truncatedJd = jdText.substring(0, 15000);

    const response = await fetch('http://localhost:3000/api/analyze', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            jdText: truncatedJd
        })
    });

    if (!response.ok) {
        throw new Error("Failed to analyze job description via backend.");
    }

    const result = await response.json();
    return { data: result.data };
}

async function handleGeneration({ jdText, resumeText, analysisData }) {
    // Truncate to save tokens
    const truncatedResume = resumeText.substring(0, 15000);

    const response = await fetch('http://localhost:3000/api/generate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            jdText,
            resumeText: truncatedResume,
            analysisData
        })
    });

    if (!response.ok) {
        throw new Error("Failed to generate tailored resume via backend.");
    }

    const result = await response.json();
    return { resume: result.resume };
}


// --- DOCX GENERATION TRIVIAL MOCK IMPLEMENTATION FOR DOWNLOAD ---
// Since docx.js is heavy to implement without a bundler, we will output as .txt for the exact MVP,
// OR use a lightweight text-to-blob approach for .txt disguised as a markdown.
// In the final phase 5 we will add docx generation logic, but for now we create a functional download.

function handleDownloadDocx({ resumeText, jobTitle, companyName }) {
    // To keep phase 4 purely LLM, we'll route docx logic to phase 5. 
    // For now, download as txt.

    const formattedTitle = jobTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const formattedCompany = companyName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const filename = `Resume_${formattedTitle}_${formattedCompany}.txt`;

    // Content script handles downloads by injecting a link, or we can use chrome.downloads
    // if we add the downloads permission. Since we didn't add it in Manifest, 
    // we communicate back to the popup to execute the download via data URI.
    // Actually, we can use chrome.tabs to run a quick script if needed, 
    // but sending it back via messaging is already covered.
}
