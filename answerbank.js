/**
 * ResumeMatch V2 — Answer Generator Module
 * Manages the Smart Answer Generator tab UI and logic.
 */

const AnswerGenerator = {
    // State
    state: {
        projectContext: [],
        lastAnswers: [],
        detectedQuestion: null,
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

            completeProfileBtn: document.getElementById('ans-complete-profile-btn'),
            
            manualInput: document.getElementById('ans-manual-input'),
            generateManualBtn: document.getElementById('ans-generate-manual-btn'),

            detectedText: document.getElementById('ans-detected-text'),
            useDetectedBtn: document.getElementById('ans-use-detected-btn'),
            enterDifferentLink: document.getElementById('ans-enter-different-link'),

            loadingText: document.getElementById('ans-loading-text'),

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
                if (this.state.detectedQuestion) {
                    this.generateAnswer(this.state.detectedQuestion, false);
                }
            });
        }

        if (this.elements.enterDifferentLink) {
            this.elements.enterDifferentLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.state.detectedQuestion = null;
                this.showView(this.elements.viewIdle);
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

        // Try detecting a question on the active page
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];
            if (!activeTab || !activeTab.url || activeTab.url.startsWith('chrome://')) {
                this.showView(this.elements.viewIdle);
                return;
            }

            chrome.tabs.sendMessage(activeTab.id, { action: 'DETECT_QUESTION' }, (response) => {
                if (chrome.runtime.lastError || !response) {
                    this.showView(this.elements.viewIdle);
                } else {
                    this.state.detectedQuestion = response;
                    this.elements.detectedText.textContent = `"${response}"`;
                    this.showView(this.elements.viewDetected);
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
            this.elements.viewReady
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
