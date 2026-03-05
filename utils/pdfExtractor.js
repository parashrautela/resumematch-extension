/**
 * PDF Text Extractor using pdf.js
 * Extracts text from a PDF file entirely in the browser.
 * No file is sent to any server.
 */

const PdfExtractor = {
    /**
     * Extract text from a PDF File object.
     * @param {File} file - The PDF file to extract text from
     * @returns {Promise<string>} - The extracted text
     */
    async extractText(file) {
        // Validate file type
        if (!file || file.type !== 'application/pdf') {
            throw new Error('INVALID_TYPE');
        }

        // Validate file size (5MB max)
        const MAX_SIZE = 5 * 1024 * 1024;
        if (file.size > MAX_SIZE) {
            throw new Error('FILE_TOO_LARGE');
        }

        const arrayBuffer = await file.arrayBuffer();

        // Set worker source path
        pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.js');

        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const pageText = content.items.map(item => item.str).join(' ');
            fullText += pageText + '\n';
        }

        const trimmed = fullText.trim();

        if (!trimmed || trimmed.length < 50) {
            throw new Error('NO_TEXT_EXTRACTED');
        }

        return trimmed;
    }
};
