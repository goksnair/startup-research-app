// Company Disambiguation UI Component
class DisambiguationModal {
    constructor() {
        this.currentStep = 0;
        this.answers = {};
        this.candidates = [];
        this.questions = [];
        this.originalQuery = '';
        this.resolve = null;
        this.reject = null;
        this.modal = null;
    }

    async show(disambiguationData) {
        this.candidates = disambiguationData.candidates;
        this.questions = disambiguationData.suggestedQuestions || [];
        this.originalQuery = disambiguationData.originalQuery;
        
        return new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
            this.render();
        });
    }

    render() {
        // Remove existing modal if any
        const existingModal = document.querySelector('.disambiguation-modal');
        if (existingModal) {
            existingModal.remove();
        }

        this.modal = document.createElement('div');
        this.modal.className = 'disambiguation-modal';
        this.modal.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Multiple companies found for "${this.originalQuery}"</h3>
                        <button class="modal-close" onclick="this.parentElement.parentElement.parentElement.parentElement.remove()">×</button>
                    </div>
                    
                    <div class="step-indicator">
                        ${this.questions.length > 0 ? `Step ${this.currentStep + 1} of ${this.questions.length + 1}` : 'Select Company'}
                    </div>

                    <div class="modal-body">
                        ${this.renderCurrentStep()}
                    </div>

                    <div class="modal-actions">
                        ${this.currentStep > 0 ? '<button class="btn btn-secondary" onclick="disambiguationModal.goBack()">← Back</button>' : ''}
                        ${this.currentStep < this.questions.length ? '<button class="btn btn-primary" onclick="disambiguationModal.goNext()">Next →</button>' : ''}
                        <button class="btn btn-outline" onclick="disambiguationModal.skipDisambiguation()">Skip & Use Original Name</button>
                    </div>
                </div>
            </div>
        `;

        // Add styles
        this.addStyles();
        
        document.body.appendChild(this.modal);
        
        // Make modal instance globally accessible for onclick handlers
        window.disambiguationModal = this;
        
        // Focus first input/button
        setTimeout(() => {
            const firstInput = this.modal.querySelector('input[type="radio"], .company-card');
            if (firstInput) {
                firstInput.focus();
            }
        }, 100);
    }

    renderCurrentStep() {
        if (this.currentStep < this.questions.length) {
            return this.renderQuestion(this.questions[this.currentStep]);
        } else {
            return this.renderFinalSelection();
        }
    }

    renderQuestion(question) {
        return `
            <div class="question-step">
                <h4>${question.question}</h4>
                <div class="options">
                    ${question.options.map(option => `
                        <label class="option-label">
                            <input type="radio" name="answer" value="${option.value}" onchange="disambiguationModal.updateAnswer('${question.type}', this.value)">
                            <span class="option-text">
                                ${option.label}
                                <small>(${option.count} matching ${option.count === 1 ? 'company' : 'companies'})</small>
                            </span>
                        </label>
                    `).join('')}
                </div>
            </div>
        `;
    }

    renderFinalSelection() {
        const filteredCandidates = this.getFilteredCandidates();
        
        if (filteredCandidates.length === 0) {
            return `
                <div class="final-selection">
                    <div class="no-matches">
                        <h4>No companies match your criteria</h4>
                        <p>Try going back and selecting different options, or use the original company name.</p>
                    </div>
                </div>
            `;
        }
        
        return `
            <div class="final-selection">
                <h4>Select the correct company:</h4>
                <div class="company-options">
                    ${filteredCandidates.map(company => `
                        <div class="company-card" tabindex="0" onclick="disambiguationModal.selectCompany('${company.id}')" onkeydown="if(event.key==='Enter') disambiguationModal.selectCompany('${company.id}')">
                            <h5>${company.name}</h5>
                            ${company.legal_name && company.legal_name !== company.name ? `<p class="legal-name">${company.legal_name}</p>` : ''}
                            <p class="company-details">
                                ${company.industry || 'Unknown Industry'}
                                ${company.headquarters ? ` • ${company.headquarters}` : ''}
                                ${company.founded ? ` • Founded ${company.founded}` : ''}
                            </p>
                            ${company.description ? `<p class="company-description">${company.description}</p>` : ''}
                            <div class="confidence-badge">
                                ${Math.round(company.confidence * 100)}% match
                            </div>
                            ${company.source === 'ai_recognition' ? '<div class="ai-badge">AI Identified</div>' : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    getFilteredCandidates() {
        let filtered = [...this.candidates];
        
        Object.entries(this.answers).forEach(([key, value]) => {
            filtered = filtered.filter(candidate => {
                switch(key) {
                    case 'industry': return candidate.industry === value;
                    case 'location': return candidate.headquarters === value;
                    case 'size': return candidate.size === value;
                    default: return true;
                }
            });
        });

        return filtered.sort((a, b) => b.confidence - a.confidence);
    }

    updateAnswer(questionType, value) {
        this.answers[questionType] = value;
        console.log('Updated answers:', this.answers);
    }

    goNext() {
        if (this.currentStep < this.questions.length) {
            this.currentStep++;
            this.updateModalBody();
        }
    }

    goBack() {
        if (this.currentStep > 0) {
            this.currentStep--;
            this.updateModalBody();
        }
    }

    updateModalBody() {
        const modalBody = this.modal.querySelector('.modal-body');
        const stepIndicator = this.modal.querySelector('.step-indicator');
        const modalActions = this.modal.querySelector('.modal-actions');
        
        modalBody.innerHTML = this.renderCurrentStep();
        stepIndicator.textContent = this.questions.length > 0 ? `Step ${this.currentStep + 1} of ${this.questions.length + 1}` : 'Select Company';
        
        // Update action buttons
        modalActions.innerHTML = `
            ${this.currentStep > 0 ? '<button class="btn btn-secondary" onclick="disambiguationModal.goBack()">← Back</button>' : ''}
            ${this.currentStep < this.questions.length ? '<button class="btn btn-primary" onclick="disambiguationModal.goNext()">Next →</button>' : ''}
            <button class="btn btn-outline" onclick="disambiguationModal.skipDisambiguation()">Skip & Use Original Name</button>
        `;
    }

    selectCompany(companyId) {
        const selectedCompany = this.candidates.find(c => c.id === companyId);
        if (selectedCompany) {
            this.cleanup();
            this.resolve({
                type: 'company_selected',
                company: selectedCompany,
                answers: this.answers
            });
        }
    }

    skipDisambiguation() {
        this.cleanup();
        this.resolve({
            type: 'skip_disambiguation',
            originalQuery: this.originalQuery
        });
    }

    cleanup() {
        if (this.modal) {
            this.modal.remove();
        }
        delete window.disambiguationModal;
    }

    addStyles() {
        // Check if styles already exist
        if (document.querySelector('#disambiguation-styles')) {
            return;
        }

        const styles = document.createElement('style');
        styles.id = 'disambiguation-styles';
        styles.textContent = `
            .disambiguation-modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 1000;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }

            .modal-overlay {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }

            .modal-content {
                background: white;
                border-radius: 12px;
                width: 100%;
                max-width: 600px;
                max-height: 80vh;
                overflow-y: auto;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            }

            .modal-header {
                padding: 24px 24px 0;
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
            }

            .modal-header h3 {
                margin: 0;
                color: #333;
                font-size: 20px;
                line-height: 1.3;
                flex: 1;
                margin-right: 16px;
            }

            .modal-close {
                background: none;
                border: none;
                font-size: 24px;
                color: #666;
                cursor: pointer;
                padding: 0;
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 6px;
                transition: background-color 0.2s;
            }

            .modal-close:hover {
                background: #f5f5f5;
            }

            .step-indicator {
                padding: 12px 24px;
                background: #f8f9fa;
                border-bottom: 1px solid #eee;
                font-size: 14px;
                color: #666;
                font-weight: 500;
            }

            .modal-body {
                padding: 24px;
            }

            .question-step h4 {
                margin: 0 0 16px;
                color: #333;
                font-size: 18px;
            }

            .options {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            .option-label {
                display: flex;
                align-items: flex-start;
                gap: 12px;
                padding: 16px;
                border: 2px solid #e1e5e9;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s;
            }

            .option-label:hover {
                border-color: #667eea;
                background: #f8f9ff;
            }

            .option-label input[type="radio"] {
                margin: 0;
                margin-top: 2px;
            }

            .option-text {
                flex: 1;
                line-height: 1.5;
            }

            .option-text small {
                display: block;
                color: #666;
                margin-top: 4px;
            }

            .company-options {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            .company-card {
                border: 2px solid #e1e5e9;
                border-radius: 8px;
                padding: 20px;
                cursor: pointer;
                transition: all 0.2s;
                position: relative;
                outline: none;
            }

            .company-card:hover,
            .company-card:focus {
                border-color: #667eea;
                background: #f8f9ff;
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(102, 126, 234, 0.1);
            }

            .company-card h5 {
                margin: 0 0 4px;
                color: #333;
                font-size: 18px;
            }

            .legal-name {
                margin: 0 0 8px;
                color: #666;
                font-size: 14px;
                font-style: italic;
            }

            .company-details {
                margin: 0 0 8px;
                color: #666;
                font-size: 14px;
            }

            .company-description {
                margin: 0 0 12px;
                color: #555;
                font-size: 14px;
                line-height: 1.4;
            }

            .confidence-badge {
                position: absolute;
                top: 16px;
                right: 16px;
                background: #28a745;
                color: white;
                padding: 4px 8px;
                border-radius: 12px;
                font-size: 12px;
                font-weight: 500;
            }

            .ai-badge {
                position: absolute;
                top: 44px;
                right: 16px;
                background: #667eea;
                color: white;
                padding: 2px 6px;
                border-radius: 8px;
                font-size: 10px;
                font-weight: 500;
            }

            .modal-actions {
                padding: 0 24px 24px;
                display: flex;
                gap: 12px;
                flex-wrap: wrap;
            }

            .btn {
                padding: 12px 20px;
                border-radius: 6px;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s;
                border: none;
                outline: none;
            }

            .btn:focus {
                box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.2);
            }

            .btn-primary {
                background: #667eea;
                color: white;
            }

            .btn-primary:hover {
                background: #5a6fd8;
            }

            .btn-secondary {
                background: #6c757d;
                color: white;
            }

            .btn-secondary:hover {
                background: #5a6268;
            }

            .btn-outline {
                background: transparent;
                color: #666;
                border: 1px solid #ddd;
            }

            .btn-outline:hover {
                background: #f5f5f5;
                border-color: #bbb;
            }

            .no-matches {
                text-align: center;
                padding: 40px 20px;
                color: #666;
            }

            .no-matches h4 {
                margin: 0 0 8px;
                color: #333;
            }

            @media (max-width: 768px) {
                .modal-overlay {
                    padding: 12px;
                }

                .modal-content {
                    max-height: 90vh;
                }

                .modal-header {
                    padding: 20px 20px 0;
                }

                .modal-body {
                    padding: 20px;
                }

                .modal-actions {
                    padding: 0 20px 20px;
                    flex-direction: column;
                }

                .btn {
                    width: 100%;
                }
            }
        `;
        
        document.head.appendChild(styles);
    }
}

// Usage function for integration with existing code
async function analyzeCompanyWithDisambiguation(companyName) {
    try {
        console.log(`Starting analysis for: ${companyName}`);
        
        // Step 1: Attempt disambiguation
        const disambiguationResponse = await fetch('/api/v1/disambiguate', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${window.apiKey || ''}`
            },
            body: JSON.stringify({ company: companyName })
        });

        if (!disambiguationResponse.ok) {
            throw new Error(`Disambiguation failed: ${disambiguationResponse.statusText}`);
        }

        const disambiguationResult = await disambiguationResponse.json();

        if (disambiguationResult.data.isAmbiguous) {
            console.log('Company requires disambiguation');
            
            // Show disambiguation modal
            const modal = new DisambiguationModal();
            const userChoice = await modal.show(disambiguationResult.data);
            
            if (userChoice.type === 'company_selected') {
                // Proceed with selected company
                return await proceedWithAnalysis(companyName, {
                    companyId: userChoice.company.id,
                    candidates: disambiguationResult.data.candidates,
                    disambiguationAnswers: userChoice.answers
                });
            } else {
                // Skip disambiguation, use original name
                return await proceedWithAnalysis(companyName, {
                    skipDisambiguation: true
                });
            }
        } else if (disambiguationResult.data.isUnknown) {
            console.log('Unknown company, proceeding with warning');
            return await proceedWithAnalysis(companyName, {
                skipDisambiguation: true
            });
        } else {
            console.log('Single company resolved automatically');
            // Proceed directly with resolved company
            return await proceedWithAnalysis(companyName, {
                companyId: disambiguationResult.data.company.id
            });
        }

    } catch (error) {
        console.error('Company analysis failed:', error);
        throw error;
    }
}

async function proceedWithAnalysis(originalCompany, options = {}) {
    const requestBody = {
        company: originalCompany,
        ...options
    };

    const response = await fetch('/api/v1/research', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${window.apiKey || ''}`
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        throw new Error(`Analysis failed: ${response.statusText}`);
    }

    return await response.json();
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DisambiguationModal, analyzeCompanyWithDisambiguation };
}