/**
 * ResumeMatch V2 — Answer Generator Module
 * Manages the Smart Answer Generator tab UI and logic.
 */

const AnswerGenerator = {
    // State
    state: {
        projectContext: [],
        lastAnswers: [],
        detectedQuestion: null, // Legacy single question
        detectedQuestionsArray: [], // V3: Array of scraped question objects
        formAnswers: [], // V3: Temporary hold for generated answers for review
        currentQuestion: null,
        isGenerating: false,
        jobData: null // From popup.js
    },

    // DOM Elements
    elements: {},

    // Initialize
    async init() {
        this.cacheElements();
        this.bindEvents();
        await this.loadState();
    },

    cacheElements() {
        this.elements = {
            viewEmpty: document.getElementById('view-ans-empty'),
            viewIdle: document.getElementById('view-ans-idle'),
            viewDetected: document.getElementById('view-ans-detected'),
            viewLoading: document.getElementById('view-ans-loading'),
            viewReady: document.getElementById('view-ans-ready'),
            viewFormReview: document.getElementById('view-form-review'),

            completeProfileBtn: document.getElementById('ans-complete-profile-btn'),
            
            manualInput: document.getElementById('ans-manual-input'),
            generateManualBtn: document.getElementById('ans-generate-manual-btn'),

            detectedCountText: document.getElementById('ans-detected-count-text'),
            singleQuestionPreview: document.getElementById('ans-single-question-preview'),
            multiQuestionPreview: document.getElementById('ans-multi-question-preview'),
            detectedText: document.getElementById('ans-detected-text'),
            useDetectedBtn: document.getElementById('ans-use-detected-btn'),
            enterDifferentLink: document.getElementById('ans-enter-different-link'),

            loadingText: document.getElementById('ans-loading-text'),

            formReviewList: document.getElementById('form-review-list'),
            fillFormBtn: document.getElementById('ans-fill-form-btn'),

            resultQuestionLabel: document.getElementById('ans-result-question-label'),
            resultText: document.getElementById('ans-result-text'),
            copyBtn: document.getElementById('ans-copy-btn'),
            regenerateLink: document.getElementById('ans-regenerate-link'),

            recentSection: document.getElementById('recent-answers-section'),
            recentList: document.getElementById('recent-answers-list'),
        };
    },

    bindEvents() {
        // Empty state
        if (this.elements.completeProfileBtn) {
            this.elements.completeProfileBtn.addEventListener('click', () => openOnboarding());
        }

        // Manual input
        if (this.elements.manualInput) {
            this.elements.manualInput.addEventListener('input', (e) => {
                const text = e.target.value.trim();
                this.elements.generateManualBtn.disabled = text.length < 20;
            });
        }

        if (this.elements.generateManualBtn) {
            this.elements.generateManualBtn.addEventListener('click', () => {
                const q = this.elements.manualInput.value.trim();
                if (q.length >= 20) this.generateAnswer(q, false);
            });
        }

        // Detected state
        if (this.elements.useDetectedBtn) {
            this.elements.useDetectedBtn.addEventListener('click', () => {
                if (this.state.detectedQuestionsArray.length > 1) {
                    this.generateFormAnswers(this.state.detectedQuestionsArray);
                } else if (this.state.detectedQuestion) {
                    this.generateAnswer(this.state.detectedQuestion, false);
                }
            });
        }

        if (this.elements.enterDifferentLink) {
            this.elements.enterDifferentLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.state.detectedQuestion = null;
                this.state.detectedQuestionsArray = [];
                this.showView(this.elements.viewIdle);
            });
        }

        // Form Review state
        if (this.elements.fillFormBtn) {
            this.elements.fillFormBtn.addEventListener('click', () => {
                this.fillAnswersIntoForm();
            });
        }

        // Ready state
        if (this.elements.copyBtn) {
            this.elements.copyBtn.addEventListener('click', () => this.copyCurrentAnswer());
        }

        if (this.elements.regenerateLink) {
            this.elements.regenerateLink.addEventListener('click', (e) => {
                e.preventDefault();
                if (this.state.currentQuestion) {
                    this.generateAnswer(this.state.currentQuestion, true);
                }
            });
        }
    },

    async loadState() {
        return new Promise((resolve) => {
            // Note: The PRD mentions 'project_context', but the old code stored it as 'answer_bank'.
            // We use 'answer_bank' as the source of truth for the project context.
            chrome.storage.local.get(['answer_bank', 'last_answers'], (result) => {
                this.state.projectContext = result.answer_bank || [];
                this.state.lastAnswers = result.last_answers || [];
                resolve();
            });
        });
    },

    /**
     * Called by popup.js when the Answer Generator tab is activated
     */
    async onTabActivated(jobData) {
        this.state.jobData = jobData;
        
        // Reload state to grab any new onboarding answers
        await this.loadState();

        if (this.state.projectContext.length === 0) {
            this.showView(this.elements.viewEmpty);
            return;
        }

        this.renderRecentAnswers();

        // Check if we are already showing a result
        if (this.state.currentQuestion && !this.elements.viewReady.classList.contains('hidden')) {
            return; // keep showing result
        }

        // Try detecting questions on the active page
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];
            if (!activeTab || !activeTab.url || activeTab.url.startsWith('chrome://')) {
                this.showView(this.elements.viewIdle);
                return;
            }

            // V3: Try to scrape the full form
            chrome.tabs.sendMessage(activeTab.id, { action: 'SCRAPE_FORM' }, (response) => {
                if (!chrome.runtime.lastError && response && response.questions && response.questions.length > 0) {
                    this.state.detectedQuestionsArray = response.questions;
                    
                    if (response.questions.length === 1) {
                        this.state.detectedQuestion = response.questions[0].question_text;
                        this.elements.detectedCountText.textContent = "We found a question on this page";
                        this.elements.singleQuestionPreview.classList.remove('hidden');
                        this.elements.multiQuestionPreview.classList.add('hidden');
                        this.elements.detectedText.textContent = `"${this.state.detectedQuestion}"`;
                        this.elements.useDetectedBtn.textContent = "ANSWER THIS QUESTION";
                    } else {
                        const count = response.questions.length;
                        this.elements.detectedCountText.textContent = `We found ${count} questions on this form`;
                        chrome.action.setBadgeText({ text: count.toString() });
                        chrome.action.setBadgeBackgroundColor({ color: '#14C25A' });
                        
                        this.elements.singleQuestionPreview.classList.add('hidden');
                        this.elements.multiQuestionPreview.classList.remove('hidden');
                        this.elements.useDetectedBtn.textContent = "ANSWER MY FORM";
                    }
                    this.showView(this.elements.viewDetected);
                } else {
                    // Fallback to legacy single question detection if SCRAPE_FORM fails
                    chrome.tabs.sendMessage(activeTab.id, { action: 'DETECT_QUESTION' }, (fallbackResponse) => {
                        if (chrome.runtime.lastError || !fallbackResponse) {
                            this.showView(this.elements.viewIdle);
                        } else {
                            this.state.detectedQuestionsArray = [{ question_text: fallbackResponse, question_id: 'q_legacy' }];
                            this.state.detectedQuestion = fallbackResponse;
                            this.elements.detectedCountText.textContent = "We found a question on this page";
                            this.elements.singleQuestionPreview.classList.remove('hidden');
                            this.elements.multiQuestionPreview.classList.add('hidden');
                            this.elements.detectedText.textContent = `"${fallbackResponse}"`;
                            this.elements.useDetectedBtn.textContent = "ANSWER THIS QUESTION";
                            this.showView(this.elements.viewDetected);
                        }
                    });
                }
            });
        });
    },

    showView(viewToShow) {
        const views = [
            this.elements.viewEmpty,
            this.elements.viewIdle,
            this.elements.viewDetected,
            this.elements.viewLoading,
            this.elements.viewReady,
            this.elements.viewFormReview
        ];
        views.forEach(v => {
            if (v) v.classList.add('hidden');
        });

        if (viewToShow) {
            viewToShow.classList.remove('hidden');
        }

        // Manage recent section visibility
        if (viewToShow === this.elements.viewEmpty || viewToShow === this.elements.viewLoading) {
            this.elements.recentSection.classList.add('hidden');
        } else if (this.state.lastAnswers.length > 0) {
            this.elements.recentSection.classList.remove('hidden');
        }
    },

    startCyclingLoadingText() {
        const texts = [
            "Reading your experience...",
            "Matching to your projects...",
            "Crafting your answer..."
        ];
        let i = 0;
        this.elements.loadingText.textContent = texts[0];
        
        this.loadingInterval = setInterval(() => {
            i = (i + 1) % texts.length;
            this.elements.loadingText.textContent = texts[i];
        }, 1500);
    },

    stopCyclingLoadingText() {
        if (this.loadingInterval) {
            clearInterval(this.loadingInterval);
            this.loadingInterval = null;
        }
    },

    async generateAnswer(question, isRegenerate = false) {
        this.state.currentQuestion = question;
        this.showView(this.elements.viewLoading);
        this.startCyclingLoadingText();

        chrome.runtime.sendMessage({
            action: 'GENERATE_ANSWER',
            question: question,
            projectContext: this.state.projectContext,
            jobData: this.state.jobData,
            isRegenerate: isRegenerate
        }, (response) => {
            this.stopCyclingLoadingText();

            if (chrome.runtime.lastError || !response || response.error) {
                alert("Failed to generate answer. Returning to input.");
                this.showView(this.elements.viewIdle);
                return;
            }

            const answer = response.answer;
            this.showReadyState(question, answer);
            this.saveAnswerToHistory(question, answer);
        });
    },

    // ── V3: Generate Answers for the Entire Form ──
    async generateFormAnswers(questionsArray) {
        this.showView(this.elements.viewLoading);
        this.startCyclingLoadingText();

        // Get full resume text from storage for context
        chrome.storage.local.get(['resume_text'], (res) => {
            chrome.runtime.sendMessage({
                action: 'GENERATE_FORM_ANSWERS',
                questionsArray: questionsArray,
                projectContext: this.state.projectContext,
                jobData: this.state.jobData,
                resumeText: res.resume_text || ""
            }, (response) => {
                this.stopCyclingLoadingText();

                if (chrome.runtime.lastError || !response || response.error) {
                    alert("Failed to generate form answers. Make sure the backend is running.");
                    this.showView(this.elements.viewIdle);
                    return;
                }

                // Merge answers with original questions
                this.state.formAnswers = questionsArray.map(q => {
                    const ansObj = response.answers.find(a => a.question_id === q.question_id);
                    return {
                        ...q,
                        answer: ansObj ? ansObj.answer : ""
                    };
                });

                this.renderFormReview();
            });
        });
    },

    renderFormReview() {
        const list = this.elements.formReviewList;
        list.innerHTML = '';

        this.state.formAnswers.forEach((qa, idx) => {
            const card = document.createElement('div');
            card.className = 'frm-card';

            // Top section: Question and limit
            const qHeader = document.createElement('div');
            qHeader.className = 'frm-question';
            qHeader.textContent = qa.question_text;
            if (qa.character_limit) {
                const limitSpan = document.createElement('span');
                limitSpan.className = 'frm-limit';
                limitSpan.textContent = `(Max ${qa.character_limit} chars)`;
                qHeader.appendChild(limitSpan);
            }
            card.appendChild(qHeader);

            // Display Mode
            const displayMode = document.createElement('div');
            
            const aText = document.createElement('div');
            aText.className = 'frm-answer-text';
            aText.textContent = qa.answer;
            displayMode.appendChild(aText);

            const displayActions = document.createElement('div');
            displayActions.className = 'frm-actions';
            const editBtn = document.createElement('button');
            editBtn.className = 'frm-btn';
            editBtn.textContent = 'EDIT';
            displayActions.appendChild(editBtn);
            displayMode.appendChild(displayActions);
            
            card.appendChild(displayMode);

            // Edit Mode
            const editMode = document.createElement('div');
            editMode.style.display = 'none';

            const textarea = document.createElement('textarea');
            textarea.className = 'frm-edit-area';
            textarea.value = qa.answer;
            editMode.appendChild(textarea);

            const counter = document.createElement('div');
            counter.className = 'frm-char-count';
            counter.textContent = `${qa.answer.length} chars`;
            if (qa.character_limit && qa.answer.length > qa.character_limit) {
                counter.classList.add('over-limit');
            }
            editMode.appendChild(counter);

            textarea.addEventListener('input', () => {
                const len = textarea.value.length;
                counter.textContent = `${len} chars`;
                if (qa.character_limit && len > qa.character_limit) {
                    counter.classList.add('over-limit');
                } else {
                    counter.classList.remove('over-limit');
                }
            });

            const editActions = document.createElement('div');
            editActions.className = 'frm-actions';
            
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'frm-btn';
            cancelBtn.textContent = 'CANCEL';
            
            const saveBtn = document.createElement('button');
            saveBtn.className = 'frm-btn save';
            saveBtn.textContent = 'SAVE';

            editActions.appendChild(cancelBtn);
            editActions.appendChild(saveBtn);
            editMode.appendChild(editActions);

            card.appendChild(editMode);

            // Interactions
            editBtn.addEventListener('click', () => {
                displayMode.style.display = 'none';
                editMode.style.display = 'block';
                textarea.value = qa.answer; // reset to current saved value
                // trigger input to update counter
                textarea.dispatchEvent(new Event('input'));
                textarea.focus();
            });

            cancelBtn.addEventListener('click', () => {
                editMode.style.display = 'none';
                displayMode.style.display = 'block';
            });

            saveBtn.addEventListener('click', () => {
                qa.answer = textarea.value;
                aText.textContent = qa.answer;
                editMode.style.display = 'none';
                displayMode.style.display = 'block';
                // Also update history if we wanted to
            });

            list.appendChild(card);
        });

        this.showView(this.elements.viewFormReview);
    },

    async fillAnswersIntoForm() {
        const btn = this.elements.fillFormBtn;
        const orgText = btn.textContent;
        btn.textContent = 'FILLING...';
        btn.disabled = true;

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];
            if (!activeTab) return;

            chrome.tabs.sendMessage(activeTab.id, { 
                action: 'FILL_FORM',
                answers: this.state.formAnswers
            }, (response) => {
                
                if (chrome.runtime.lastError) {
                    btn.textContent = 'FAILED';
                    setTimeout(() => { btn.textContent = orgText; btn.disabled = false; }, 2000);
                    return;
                }

                // Show success
                btn.textContent = 'FILLED ✓';
                btn.style.background = 'var(--np-success-bg)';
                btn.style.color = 'var(--np-success-text)';
                
                // Clear the badge
                chrome.action.setBadgeText({ text: '' });
                
                setTimeout(() => { 
                    btn.textContent = orgText; 
                    btn.disabled = false; 
                    btn.style.background = '';
                    btn.style.color = '';
                }, 3000);
            });
        });
    },

    showReadyState(question, answer) {
        this.elements.resultQuestionLabel.textContent = question;
        this.elements.resultText.textContent = answer;
        
        // Reset copy button
        this.elements.copyBtn.textContent = 'COPY';
        this.elements.copyBtn.classList.remove('copied');

        this.showView(this.elements.viewReady);
    },

    async copyCurrentAnswer() {
        const text = this.elements.resultText.textContent;
        const btn = this.elements.copyBtn;

        try {
            await navigator.clipboard.writeText(text);
            btn.textContent = 'COPIED ✓';
            btn.classList.add('copied');
            setTimeout(() => {
                btn.textContent = 'COPY';
                btn.classList.remove('copied');
            }, 2000);
        } catch (err) {
            btn.textContent = 'FAILED';
            setTimeout(() => {
                btn.textContent = 'COPY';
            }, 2000);
            
            // Allow manual selection
            this.elements.resultText.style.userSelect = 'text';
        }
    },

    saveAnswerToHistory(question, answer) {
        const newEntry = {
            question,
            answer,
            generated_at: new Date().toISOString()
        };

        // Add to front
        this.state.lastAnswers.unshift(newEntry);

        // Cap at 5
        if (this.state.lastAnswers.length > 5) {
            this.state.lastAnswers = this.state.lastAnswers.slice(0, 5);
        }

        // Save
        chrome.storage.local.set({ last_answers: this.state.lastAnswers }, () => {
            this.renderRecentAnswers();
        });
    },

    renderRecentAnswers() {
        const list = this.elements.recentList;
        list.innerHTML = '';

        if (this.state.lastAnswers.length === 0) {
            this.elements.recentSection.classList.add('hidden');
            return;
        }

        if (this.elements.viewEmpty.classList.contains('hidden') && 
            this.elements.viewLoading.classList.contains('hidden')) {
            this.elements.recentSection.classList.remove('hidden');
        }

        this.state.lastAnswers.forEach((item, index) => {
            const card = document.createElement('div');
            card.className = 'recent-answer-card';

            const header = document.createElement('div');
            header.className = 'rac-header';

            const qSpan = document.createElement('span');
            qSpan.className = 'rac-question';
            qSpan.textContent = item.question;

            const previewSpan = document.createElement('span');
            previewSpan.className = 'rac-preview';
            previewSpan.textContent = item.answer.substring(0, 80) + '...';

            header.appendChild(qSpan);
            header.appendChild(previewSpan);

            const body = document.createElement('div');
            body.className = 'rac-body';

            const fullAns = document.createElement('div');
            fullAns.className = 'rac-full-answer';
            fullAns.textContent = item.answer;

            const actions = document.createElement('div');
            actions.className = 'rac-actions';

            const copyBtn = document.createElement('button');
            copyBtn.className = 'copy-btn';
            copyBtn.textContent = 'COPY';

            copyBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                try {
                    await navigator.clipboard.writeText(item.answer);
                    copyBtn.textContent = 'COPIED ✓';
                    copyBtn.classList.add('copied');
                    setTimeout(() => {
                        copyBtn.textContent = 'COPY';
                        copyBtn.classList.remove('copied');
                    }, 2000);
                } catch (err) {
                    copyBtn.textContent = 'FAILED';
                    setTimeout(() => copyBtn.textContent = 'COPY', 2000);
                }
            });

            actions.appendChild(copyBtn);
            body.appendChild(fullAns);
            body.appendChild(actions);

            card.appendChild(header);
            card.appendChild(body);

            header.addEventListener('click', () => {
                // Collapse all others
                Array.from(list.children).forEach(c => {
                    if (c !== card) c.classList.remove('expanded');
                });
                card.classList.toggle('expanded');
            });

            list.appendChild(card);
        });
    }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    AnswerGenerator.init();
});
