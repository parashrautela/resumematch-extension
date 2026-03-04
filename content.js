// Content script injected into every page matched by manifest.json
// To keep things simple without a bundler, we will include the parser logic directly here,
// or we can assume utils/parser.js could be injected before content.js. 
// For Manifest V3 content scripts, it's safer to bundle the parser logic or inject sequentially.
// Here we'll just include a copy of the vital parser logic directly.

(function () {
    // Always re-register the listener so it works after extension reloads

    const Parser = {
        extractLinkedIn: () => {
            const selectors = [
                'div.jobs-description__content',
                'div#job-details',
                'article.jobs-description',
                '.jobs-search__job-details--container', // Often used in the split view
                '.job-view-layout'
            ];
            for (const selector of selectors) {
                const el = document.querySelector(selector);
                if (el && el.innerText.length > 100) {
                    return {
                        platform: 'LinkedIn',
                        text: el.innerText.trim(),
                        title: document.querySelector('.job-details-jobs-unified-top-card__job-title, .job-details-jobs-unified-top-card__job-title h1, h1')?.innerText?.trim() || 'Job',
                        company: document.querySelector('.job-details-jobs-unified-top-card__company-name, .job-details-jobs-unified-top-card__primary-description a')?.innerText?.trim() || 'Company'
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
        extractFallback: () => {
            // First, try standard generic selectors used by ATS platforms
            const genericSelectors = [
                '#content', '.content', 'main', 'article',
                '.job-description', '#job-description',
                '.posting-requirements', '.section-wrapper'
            ];

            for (const selector of genericSelectors) {
                const els = document.querySelectorAll(selector);
                for (const el of els) {
                    if (el && el.innerText.length > 500) {
                        return {
                            platform: 'Generic',
                            text: el.innerText.trim(),
                            title: document.querySelector('h1')?.innerText?.trim() || document.title || 'Job',
                            company: window.location.hostname.replace('www.', '').split('.')[0] || 'Company'
                        };
                    }
                }
            }

            // If no specific container matches, try the heuristic scoring
            const keywords = ['requirements', 'responsibilities', 'qualifications', 'what you\'ll do', 'what we are looking for', 'about the role'];
            const candidates = Array.from(document.querySelectorAll('div, section, article, main'));
            let bestEl = null; let highestScore = 0;

            for (const el of candidates) {
                const text = el.innerText || '';
                // Need a decent chunk of text to be a JD
                if (text.length < 500) continue;

                // Skip navigation and structural elements
                if (['NAV', 'FOOTER', 'HEADER', 'ASIDE'].includes(el.tagName)) continue;

                let score = 0;
                const lowerText = text.toLowerCase();

                // Check for keywords
                for (const kw of keywords) {
                    if (lowerText.includes(kw)) score += 10;
                }

                // Bonus for length (up to a point)
                score += Math.min(text.length / 500, 10);

                // Bonus for bullet points (JDs have lots of them)
                score += Math.min(el.querySelectorAll('li').length, 20);

                if (score > highestScore) {
                    highestScore = score;
                    bestEl = el;
                }
            }

            if (bestEl && highestScore > 15) {
                return {
                    platform: 'Generic Fallback',
                    text: bestEl.innerText.trim(),
                    title: document.querySelector('h1')?.innerText?.trim() || document.title || 'Job',
                    company: window.location.hostname.replace('www.', '').split('.')[0] || 'Company'
                };
            }

            // Absolute last resort: just grab the body text, stripping out obviously bad tags
            try {
                const bodyClone = document.body.cloneNode(true);
                const badTags = bodyClone.querySelectorAll('nav, footer, header, script, style, noscript, aside');
                badTags.forEach(tag => tag.remove());

                const bodyText = bodyClone.innerText.trim();
                if (bodyText.length > 300) {
                    return {
                        platform: 'Generic Body Extraction',
                        text: bodyText,
                        title: document.querySelector('h1')?.innerText?.trim() || document.title || 'Job',
                        company: window.location.hostname.replace('www.', '').split('.')[0] || 'Company'
                    }
                }
            } catch (e) {
                console.error("DOM extraction error", e);
            }

            return null;
        },
        extract: () => {
            const url = window.location.hostname;
            if (url.includes('linkedin.com')) return Parser.extractLinkedIn();
            if (url.includes('indeed.com')) return Parser.extractIndeed();

            // Note: These functions aren't defined in the content.js subset of Parser yet
            // If they are in parser.js, we should make sure they exist here too.
            // Since we implemented a highly robust fallback parser, let's rely on that 
            // for greenhouse/lever if the specific extractors aren't defined in content.js
            if (typeof Parser.extractGreenhouse === 'function' && url.includes('greenhouse.io')) {
                return Parser.extractGreenhouse();
            }
            if (typeof Parser.extractLever === 'function' && url.includes('lever.co')) {
                return Parser.extractLever();
            }

            return Parser.extractFallback();
        }
    };

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'GET_JD') {
            const jdData = Parser.extract();
            sendResponse(jdData);
        }
        return true; // Keep the message channel open
    });
})();
