/**
 * Utility functions for extracting job descriptions from various platforms.
 * These functions are injected via content.js.
 */

const Parser = {
    extractLinkedIn: () => {
        // LinkedIn has multiple view types (in-feed vs dedicated page)
        const selectors = [
            'div.jobs-description__content', // Standard
            'div#job-details', // Sometimes used in modal/feed
            'article.jobs-description'
        ];

        for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el && el.innerText.length > 100) {
                return {
                    platform: 'LinkedIn',
                    text: el.innerText.trim(),
                    title: document.querySelector('.job-details-jobs-unified-top-card__job-title')?.innerText?.trim() || 'Job',
                    company: document.querySelector('.job-details-jobs-unified-top-card__company-name')?.innerText?.trim() || 'Company'
                };
            }
        }
        return null;
    },

    extractIndeed: () => {
        const el = document.querySelector('div#jobDescriptionText');
        if (el && el.innerText.length > 100) {
            return {
                platform: 'Indeed',
                text: el.innerText.trim(),
                title: document.querySelector('h1.jobsearch-JobInfoHeader-title')?.innerText?.trim() || 'Job',
                company: document.querySelector('[data-testid="inlineHeader-companyName"]')?.innerText?.trim() || 'Company'
            };
        }
        return null;
    },

    extractGreenhouse: () => {
        const el = document.querySelector('div#content');
        if (el && el.innerText.length > 100) {
            return {
                platform: 'Greenhouse',
                text: el.innerText.trim(),
                title: document.querySelector('h1.app-title')?.innerText?.trim() || 'Job',
                company: document.querySelector('span.company-name')?.innerText?.trim() || 'Company'
            };
        }
        return null;
    },

    extractLever: () => {
        const el = document.querySelector('div.content');
        if (el && el.innerText.length > 100) {
            return {
                platform: 'Lever',
                text: el.innerText.trim(),
                title: document.querySelector('h2')?.innerText?.trim() || 'Job',
                company: document.title.split('-')[0]?.trim() || 'Company'
            };
        }
        return null;
    },

    extractFallback: () => {
        // A heuristic-based fallback extractor
        // We look for large text blocks containing keywords
        const keywords = ['requirements', 'responsibilities', 'qualifications', 'what you\'ll do', 'about the role'];
        const candidates = Array.from(document.querySelectorAll('div, section, article, main'));

        let bestEl = null;
        let highestScore = 0;

        for (const el of candidates) {
            // Ignore elements that are too small or likely navigation
            const text = el.innerText || '';
            if (text.length < 500) continue;
            if (el.tagName === 'NAV' || el.tagName === 'FOOTER' || el.tagName === 'HEADER') continue;

            let score = 0;
            const lowerText = text.toLowerCase();

            // Bonus points for keywords
            for (const kw of keywords) {
                if (lowerText.includes(kw)) score += 5;
            }

            // Bonus points for length (up to a reasonable limit)
            score += Math.min(text.length / 500, 10);

            // Bonus points for having a lot of list items (common in JDs)
            const listItems = el.querySelectorAll('li');
            score += Math.min(listItems.length, 15);

            if (score > highestScore) {
                highestScore = score;
                bestEl = el;
            }
        }

        if (bestEl && highestScore > 10) {
            return {
                platform: 'Generic',
                text: bestEl.innerText.trim(),
                title: document.title || 'Job',
                company: 'Company'
            };
        }

        return null;
    },

    extract: () => {
        const url = window.location.hostname;

        if (url.includes('linkedin.com')) {
            return Parser.extractLinkedIn();
        } else if (url.includes('indeed.com')) {
            return Parser.extractIndeed();
        } else if (url.includes('greenhouse.io')) {
            return Parser.extractGreenhouse();
        } else if (url.includes('lever.co')) {
            return Parser.extractLever();
        }

        // Fallback if not specifically handled
        return Parser.extractFallback();
    }
};

// Export if in module environment, though we'll likely inject this directly
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Parser;
}
