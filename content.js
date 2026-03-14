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
        
        if (request.action === 'DETECT_QUESTION') {
            // Check URL
            const url = window.location.href.toLowerCase();
            const validPatterns = ['apply', 'application', 'careers', 'jobs', 'submit', 'greenhouse', 'lever'];
            const isValidUrl = validPatterns.some(pattern => url.includes(pattern));
            
            if (!isValidUrl) {
                sendResponse(null);
                return true;
            }

            // Look for textareas or large text inputs
            const inputs = document.querySelectorAll('textarea, input[type="text"]');
            const keywords = ['describe', 'tell us', 'explain', 'what', 'how', 'why', 'share', 'give an example'];
            
            let detectedQuestion = null;

            for (const input of inputs) {
                // If it's an input, it needs to be reasonably wide to be a long-form question
                if (input.tagName === 'INPUT' && input.offsetWidth < 200) continue;

                // Find the associated label
                let labelText = '';
                
                // 1. Check for explicit <label for="...">
                if (input.id) {
                    const label = document.querySelector(`label[for="${input.id}"]`);
                    if (label) labelText = label.innerText;
                }
                
                // 2. Check if wrapped in <label>
                if (!labelText) {
                    const parentLabel = input.closest('label');
                    if (parentLabel) labelText = parentLabel.innerText;
                }

                // 3. Fallback: check preceding elements (like divs/spans above the textarea)
                if (!labelText) {
                    let prev = input.previousElementSibling;
                    while (prev && prev.tagName !== 'TEXTAREA' && prev.tagName !== 'INPUT' && !labelText) {
                        if (prev.innerText && prev.innerText.trim().length > 10) {
                            labelText = prev.innerText;
                        }
                        prev = prev.previousElementSibling;
                    }
                }

                if (!labelText) continue;

                const lowerLabel = labelText.toLowerCase();
                const hasKeyword = keywords.some(kw => lowerLabel.includes(kw));

                if (hasKeyword && labelText.length > 15 && labelText.length < 300) {
                    // Clean up the label text (remove asterisks, "Required", etc)
                    detectedQuestion = labelText
                        .replace(/\*/g, '')
                        .replace(/Required\s*$/i, '')
                        .replace(/\n/g, ' ')
                        .trim();
                    break; // Stop at first good match
                }
            }
            
            sendResponse(detectedQuestion);
        }
        
        // ── V3 form scraper ──
        if (request.action === 'SCRAPE_FORM') {
            const inputs = Array.from(document.querySelectorAll('textarea, input[type="text"]'));
            const questions = [];
            
            // Words indicating Name/Email/Phone to skip
            const skipPhrases = ['name', 'first', 'last', 'email', 'phone', 'mobile'];
            
            inputs.forEach((input, index) => {
                // Ignore small text inputs
                if (input.tagName === 'INPUT' && input.offsetWidth < 150) return;

                let labelText = '';
                
                // 1. Check for explicit <label for="...">
                if (input.id) {
                    const label = document.querySelector(`label[for="${input.id}"]`);
                    if (label) labelText = label.innerText;
                }
                
                // 2. Check if wrapped in <label>
                if (!labelText) {
                    const parentLabel = input.closest('label');
                    if (parentLabel) labelText = parentLabel.innerText;
                }

                // 3. Check aria-label
                if (!labelText && input.getAttribute('aria-label')) {
                    labelText = input.getAttribute('aria-label');
                }

                // 4. LinkedIn Easy Apply specific: find the closest grouping and get its label
                if (!labelText && input.classList.contains('artdeco-text-input--input')) {
                    const group = input.closest('.jobs-easy-apply-form-section__grouping');
                    if (group) {
                        const groupLabel = group.querySelector('.artdeco-text-input--label');
                        if (groupLabel) labelText = groupLabel.innerText;
                    }
                }

                // 5. Fallback: check preceding elements
                if (!labelText) {
                    let prev = input.previousElementSibling;
                    let lookback = 0;
                    while (prev && lookback < 3 && !labelText) {
                        if (prev.innerText && prev.innerText.trim().length > 5 && !['TEXTAREA', 'INPUT', 'SELECT'].includes(prev.tagName)) {
                            labelText = prev.innerText;
                        }
                        prev = prev.previousElementSibling;
                        lookback++;
                    }
                }

                // 6. Final fallback: placeholder
                if (!labelText && input.placeholder) {
                    labelText = input.placeholder;
                }

                if (!labelText) return;

                const lowerLabel = labelText.toLowerCase();
                
                // Skip basic fields
                if (skipPhrases.some(p => lowerLabel.includes(p))) return;
                
                // Keep if label is decently long or contains a question mark
                if (labelText.length > 15 || labelText.includes('?')) {
                    const cleanLabel = labelText.replace(/\*/g, '').replace(/Required\s*$/i, '').replace(/\n/g, ' ').trim();
                    
                    // Assign a stable selector to the field so we can inject into it later
                    let selector = '';
                    if (input.id) {
                        selector = `#${input.id}`;
                    } else if (input.name) {
                        selector = `${input.tagName.toLowerCase()}[name="${input.name}"]`;
                    } else {
                        // Fallback data attribute to find it later
                        const uniqueId = `rm_field_${index}_${Date.now()}`;
                        input.setAttribute('data-rm-id', uniqueId);
                        selector = `[data-rm-id="${uniqueId}"]`;
                    }

                    // Extract character limit if present via maxlength or nearby text
                    let limit = null;
                    if (input.getAttribute('maxlength')) {
                        limit = parseInt(input.getAttribute('maxlength'));
                    } else {
                        const limitMatch = labelText.match(/max(?:imum)?\s*(\d+)\s*(?:chars|characters|words)/i);
                        if (limitMatch && limitMatch[1]) {
                            limit = parseInt(limitMatch[1]);
                        }
                    }

                    questions.push({
                        question_id: `q_${index}`,
                        question_text: cleanLabel,
                        field_selector: selector,
                        field_type: input.tagName.toLowerCase(),
                        character_limit: limit
                    });
                }
            });
            
            sendResponse({ questions });
        }

        // ── V3 form filler ──
        if (request.action === 'FILL_FORM') {
            const { answers } = request;
            let successCount = 0;
            let failedQuestions = [];

            answers.forEach(ans => {
                const field = document.querySelector(ans.field_selector);
                if (field) {
                    try {
                        // Try native setter first for React apps (like LinkedIn)
                        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                        const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
                        
                        if (field.tagName === 'INPUT' && nativeInputValueSetter) {
                            nativeInputValueSetter.call(field, ans.answer);
                        } else if (field.tagName === 'TEXTAREA' && nativeTextAreaValueSetter) {
                            nativeTextAreaValueSetter.call(field, ans.answer);
                        } else {
                            // Fallback
                            field.value = ans.answer;
                        }

                        // Dispatch events to trigger JS frameworks
                        field.dispatchEvent(new Event('input', { bubbles: true }));
                        field.dispatchEvent(new Event('change', { bubbles: true }));
                        
                        successCount++;
                    } catch (e) {
                        console.error('Error filling field:', e);
                        failedQuestions.push(ans.question_text);
                    }
                } else {
                    failedQuestions.push(ans.question_text || `Question ${ans.question_id}`);
                }
            });

            sendResponse({ successCount, failedQuestions });
        }

        return true; // Keep the message channel open
    });
})();
