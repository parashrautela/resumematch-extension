/**
 * ResumeMatch V2 — Answer Bank Module
 * Handles reading, writing, editing, and copying answers from chrome.storage.local
 */

const AnswerBank = {

    /**
     * Load the full answer bank from storage
     * @returns {Promise<Array>} answer bank data
     */
    async load() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['answer_bank'], (result) => {
                resolve(result.answer_bank || []);
            });
        });
    },

    /**
     * Save the full answer bank to storage
     * @param {Array} answerBank 
     */
    async save(answerBank) {
        return new Promise((resolve) => {
            chrome.storage.local.set({ answer_bank: answerBank }, () => resolve());
        });
    },

    /**
     * Update a specific answer in the answer bank
     * @param {string} projectId 
     * @param {string} questionId 
     * @param {string} newAnswer 
     */
    async updateAnswer(projectId, questionId, newAnswer) {
        const bank = await this.load();
        const project = bank.find(p => p.project_id === projectId);
        if (project) {
            const answer = project.answers.find(a => a.question_id === questionId);
            if (answer) {
                answer.raw_answer = newAnswer;
                answer.polished_answer = newAnswer;
                answer.last_updated = new Date().toISOString();
                await this.save(bank);
                return true;
            }
        }
        return false;
    },

    /**
     * Copy text to clipboard with fallback
     * @param {string} text 
     * @returns {Promise<boolean>} success
     */
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            // Fallback: create a temporary textarea
            try {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                return true;
            } catch (fallbackErr) {
                console.error('Copy failed:', fallbackErr);
                return false;
            }
        }
    },

    /**
     * Render the Answer Bank UI into a container
     * @param {HTMLElement} container 
     * @param {Array} data - answer bank data
     */
    render(container, data) {
        container.innerHTML = '';

        if (!data || data.length === 0) {
            container.innerHTML = this.renderEmptyState();
            return;
        }

        data.forEach((project, index) => {
            const accordion = this.createProjectAccordion(project, index === 0);
            container.appendChild(accordion);
        });
    },

    /**
     * Render empty state HTML
     */
    renderEmptyState() {
        return `
            <div class="ab-empty-state">
                <div class="ab-empty-icon">📋</div>
                <h3>No answers yet</h3>
                <p>Complete your profile to build your Answer Bank</p>
                <button class="btn-primary ab-start-btn" id="ab-start-onboarding">Start Now →</button>
            </div>
        `;
    },

    /**
     * Create a project accordion element
     * @param {Object} project 
     * @param {boolean} expanded 
     * @returns {HTMLElement}
     */
    createProjectAccordion(project, expanded = false) {
        const section = document.createElement('div');
        section.className = 'ab-project';

        const header = document.createElement('div');
        header.className = 'ab-project-header';
        header.innerHTML = `
            <span class="ab-project-name">${this.escapeHtml(project.project_name)}</span>
            <span class="ab-project-count">${project.answers.filter(a => a.raw_answer).length} answers</span>
            <svg class="ab-arrow ${expanded ? 'expanded' : ''}" width="12" height="12" viewBox="0 0 12 12">
                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            </svg>
        `;

        const body = document.createElement('div');
        body.className = `ab-project-body ${expanded ? 'expanded' : ''}`;

        // Render answer cards
        const answersWithContent = project.answers.filter(a => a.raw_answer);
        if (answersWithContent.length === 0) {
            body.innerHTML = '<p class="ab-no-answers">No answers for this project yet.</p>';
        } else {
            answersWithContent.forEach(answer => {
                const card = this.createAnswerCard(project.project_id, answer);
                body.appendChild(card);
            });
        }

        // Toggle accordion
        header.addEventListener('click', () => {
            const arrow = header.querySelector('.ab-arrow');
            const isExpanded = body.classList.contains('expanded');
            body.classList.toggle('expanded');
            arrow.classList.toggle('expanded');
        });

        section.appendChild(header);
        section.appendChild(body);
        return section;
    },

    /**
     * Create an answer card element
     * @param {string} projectId 
     * @param {Object} answer 
     * @returns {HTMLElement}
     */
    createAnswerCard(projectId, answer) {
        const card = document.createElement('div');
        card.className = 'ab-answer-card';

        const questionEl = document.createElement('p');
        questionEl.className = 'ab-question';
        questionEl.textContent = answer.question_text;

        const answerEl = document.createElement('div');
        answerEl.className = 'ab-answer-content';

        const answerText = document.createElement('p');
        answerText.className = 'ab-answer-text';
        answerText.textContent = answer.polished_answer || answer.raw_answer;

        // Edit textarea (hidden by default)
        const editArea = document.createElement('textarea');
        editArea.className = 'ab-edit-textarea hidden';
        editArea.value = answer.polished_answer || answer.raw_answer;

        const actions = document.createElement('div');
        actions.className = 'ab-actions';

        // Edit button
        const editBtn = document.createElement('button');
        editBtn.className = 'ab-btn-edit';
        editBtn.textContent = 'Edit';

        // Save button (hidden)
        const saveBtn = document.createElement('button');
        saveBtn.className = 'ab-btn-save hidden';
        saveBtn.textContent = 'Save';

        // Copy button
        const copyBtn = document.createElement('button');
        copyBtn.className = 'ab-btn-copy';
        copyBtn.textContent = 'Copy';

        // Edit click
        editBtn.addEventListener('click', () => {
            answerText.classList.add('hidden');
            editArea.classList.remove('hidden');
            editBtn.classList.add('hidden');
            saveBtn.classList.remove('hidden');
            editArea.focus();
        });

        // Save click
        saveBtn.addEventListener('click', async () => {
            const newText = editArea.value.trim();
            if (newText) {
                await this.updateAnswer(projectId, answer.question_id, newText);
                answerText.textContent = newText;
            }
            answerText.classList.remove('hidden');
            editArea.classList.add('hidden');
            editBtn.classList.remove('hidden');
            saveBtn.classList.add('hidden');
        });

        // Copy click
        copyBtn.addEventListener('click', async () => {
            const text = answerText.textContent;
            const success = await this.copyToClipboard(text);
            if (success) {
                copyBtn.textContent = 'Copied ✓';
                copyBtn.classList.add('copied');
                setTimeout(() => {
                    copyBtn.textContent = 'Copy';
                    copyBtn.classList.remove('copied');
                }, 2000);
            } else {
                copyBtn.textContent = 'Failed';
                setTimeout(() => {
                    copyBtn.textContent = 'Copy';
                }, 2000);
            }
        });

        actions.appendChild(editBtn);
        actions.appendChild(saveBtn);
        actions.appendChild(copyBtn);

        answerEl.appendChild(answerText);
        answerEl.appendChild(editArea);

        card.appendChild(questionEl);
        card.appendChild(answerEl);
        card.appendChild(actions);

        return card;
    },

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
};
