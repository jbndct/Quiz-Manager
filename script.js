const firebaseConfig = {
  apiKey: "AIzaSyDk9qs4OlzUKlPKB2TZvRJqqAeeApeHgtc",
  authDomain: "quiz-manager-e39be.firebaseapp.com",
  projectId: "quiz-manager-e39be",
  storageBucket: "quiz-manager-e39be.firebasestorage.app",
  messagingSenderId: "739408414646",
  appId: "1:739408414646:web:0be12679191aad40d2e317",
  measurementId: "G-R80HWKGNL6"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Create a reference to the Firestore database
const db = firebase.firestore();
// Create a reference to our "quizzes" collection
const quizCollection = db.collection('quizzes');


document.addEventListener('DOMContentLoaded', () => {

    // --- STATE VARIABLES ---
    const STORAGE_KEY = 'quizManagerStorage_v2'; // Upped version for new structure
    
    // appState now holds local quizzes AND progress for all quizzes
    let appState = {
        localQuizzes: [], // Stores full quiz definitions { id, name, quizData, createdAt }
        quizProgress: []  // Stores progress { id, currentQuestionIndex, ... }
    };
    
    // This map will store the public quiz definitions
    // fetched from Firebase, so we don't have to re-fetch them.
    let publicQuizMap = new Map();
    
    let currentQuizId = null; // Can be a local ID ('local_...') or Firebase ID
    let currentLoadTab = 'json'; // 'json' or 'text'
    let currentExtractTab = 'json'; // 'json' or 'text'
    let isAdmin = false; // Flag for admin delete privileges
    
    // NEW: Editing, Sorting, Search State
    let editingQuizId = null; // ID of the quiz currently being edited (null = creating new)
    let editingMode = 'local'; // 'local' or 'public'
    let currentSort = 'date-desc'; // Default sort order
    let currentSearchTerm = ''; // Default search term
    
    // --- ELEMENT REFERENCES ---
    // Containers
    const screenContainers = {
        'list': document.getElementById('quiz-list-container'),
        'setup': document.getElementById('setup-container'),
        'quiz': document.getElementById('quiz-container'),
        'results': document.getElementById('results-container'),
        'review': document.getElementById('review-container')
    };

    // Screen 1: List
    const activeQuizList = document.getElementById('active-quiz-list'); // Local quizzes
    const noQuizzesMessage = document.getElementById('no-quizzes-message');
    const publicQuizList = document.getElementById('public-quiz-list'); // Public quizzes
    const noPublicQuizzesMessage = document.getElementById('no-public-quizzes-message');
    const loadNewQuizBtn = document.getElementById('load-new-quiz-btn');
    const sortSelect = document.getElementById('sort-select'); // Sort Dropdown
    const searchInput = document.getElementById('search-input'); // Search Input

    // Screen 2: Setup
    const setupTitle = document.getElementById('setup-title');
    const backToListBtn = document.getElementById('back-to-list-btn');
    const tabBtnJson = document.getElementById('tab-btn-json');
    const tabBtnText = document.getElementById('tab-btn-text');
    const tabContentJson = document.getElementById('tab-content-json');
    const tabContentText = document.getElementById('tab-content-text');
    const jsonTextInput = document.getElementById('json-text-input');
    const fileInput = document.getElementById('file-input');
    const fileNameDisplay = document.getElementById('file-name');
    const simpleTextInput = document.getElementById('simple-text-input');
    const loadQuizBtn = document.getElementById('load-quiz-btn');
    const setupError = document.getElementById('setup-error');
    const publicCheckbox = document.getElementById('public-checkbox');
    const publicCheckboxContainer = document.getElementById('public-checkbox-container');
    const quizNameInput = document.getElementById('quiz-name-input');

    // Screen 3: Quiz
    const quizContainer = document.getElementById('quiz-container');
    const skippedModeBanner = document.getElementById('skipped-mode-banner');
    const progressBar = document.getElementById('progress-bar');
    const quizTitle = document.getElementById('quiz-title');
    const showTocBtn = document.getElementById('show-toc-btn');
    const quizBackToListBtn = document.getElementById('quiz-back-to-list-btn');
    const questionCounter = document.getElementById('question-counter');
    const totalQuestions = document.getElementById('total-questions');
    const currentScore = document.getElementById('current-score');
    const questionText = document.getElementById('question-text');
    const optionsContainer = document.getElementById('options-container');
    const feedbackMessage = document.getElementById('feedback-message');
    const prevQuestionBtn = document.getElementById('prev-question-btn');
    const skipQuestionBtn = document.getElementById('skip-question-btn');
    const nextQuestionBtn = document.getElementById('next-question-btn');

    // Screen 4: Results
    const scoreText = document.getElementById('score-text');
    const reviewAnswersBtn = document.getElementById('review-answers-btn');
    const resultsBackToListBtn = document.getElementById('results-back-to-list-btn');
    
    // Screen 5: Review
    const reviewList = document.getElementById('review-list');
    const reviewBackToResultsBtn = document.getElementById('review-back-to-results-btn');
    
    // TOC Modal
    const tocModalContainer = document.getElementById('toc-modal-container');
    const tocGrid = document.getElementById('toc-grid');
    const closeTocBtn = document.getElementById('close-toc-btn');

    // Extract Modal Elements
    const extractModalContainer = document.getElementById('extract-modal-container');
    const closeExtractBtn = document.getElementById('close-extract-btn');
    const extractQuizName = document.getElementById('extract-quiz-name');
    const extractTabBtnJson = document.getElementById('extract-tab-btn-json');
    const extractTabBtnText = document.getElementById('extract-tab-btn-text');
    const extractTabContentJson = document.getElementById('extract-tab-content-json');
    const extractTabContentText = document.getElementById('extract-tab-content-text');
    const extractJsonTextarea = document.getElementById('extract-json-textarea');
    const extractTextTextarea = document.getElementById('extract-text-textarea');
    const copyJsonBtn = document.getElementById('copy-json-btn');
    const copyTextBtn = document.getElementById('copy-text-btn');
    
    // --- STORAGE FUNCTIONS ---
    // Save/load the entire appState (local quizzes + all progress)

    function loadStateFromStorage() {
        const storedData = localStorage.getItem(STORAGE_KEY);
        if (storedData) {
            appState = JSON.parse(storedData);
            
            // Migrate from old structure if necessary
            if (appState.activeQuizzes) {
                appState.quizProgress = appState.activeQuizzes;
                delete appState.activeQuizzes;
            }

            // Ensure new structure is initialized
            if (!appState.localQuizzes) {
                appState.localQuizzes = [];
            }
            if (!appState.quizProgress) {
                appState.quizProgress = [];
            }
        } else {
            appState = { localQuizzes: [], quizProgress: [] };
        }
    }

    function saveStateToStorage() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
    }
    
    // Saves progress for the *current* quiz
    function updateQuizProgress() {
        saveStateToStorage();
    }

    // Deletes only the *progress* for a quiz
    function deleteQuizProgress(quizId) {
        appState.quizProgress = appState.quizProgress.filter(q => q.id !== quizId);
        saveStateToStorage();
    }

    // --- NEW: Functions to manage local quiz definitions ---
    function saveLocalQuiz(quizDefinition) {
        const existingIndex = appState.localQuizzes.findIndex(q => q.id === quizDefinition.id);
        if (existingIndex !== -1) {
            // Update existing
            appState.localQuizzes[existingIndex] = quizDefinition;
        } else {
            // Add new
            appState.localQuizzes.push(quizDefinition);
        }
        saveStateToStorage();
    }

    function deleteLocalQuiz(quizId) {
        // Delete the quiz definition
        appState.localQuizzes = appState.localQuizzes.filter(q => q.id !== quizId);
        // Also delete its progress
        deleteQuizProgress(quizId);
        // saveStateToStorage() is called by deleteQuizProgress
    }

    // --- NAVIGATION ---
    
    function showScreen(screenKey) {
        for (const key in screenContainers) {
            if (key === screenKey) {
                screenContainers[key].classList.remove('d-none');
            } else {
                screenContainers[key].classList.add('d-none');
            }
        }
    }

    // --- SCREEN 1: QUIZ LIST LOGIC ---
    
    // NEW: Sorting Helper
    function sortQuizzes(quizzes) {
        return quizzes.sort((a, b) => {
            if (currentSort === 'name-asc') {
                return a.name.localeCompare(b.name);
            } else if (currentSort === 'name-desc') {
                return b.name.localeCompare(a.name);
            } else if (currentSort === 'date-asc') {
                const dateA = a.createdAt || 0;
                const dateB = b.createdAt || 0;
                return dateA - dateB;
            } else { // date-desc (default)
                const dateA = a.createdAt || 0;
                const dateB = b.createdAt || 0;
                return dateB - dateA;
            }
        });
    }

    // NEW: Search Filter Helper
    function filterQuizzes(quizzes) {
        if (!currentSearchTerm) return quizzes;
        const term = currentSearchTerm.toLowerCase();
        return quizzes.filter(q => q.name.toLowerCase().includes(term));
    }

    // --- Render *Local* Quizzes ---
    function renderLocalQuizzes() {
        activeQuizList.innerHTML = ''; // Clear local list
        let localQuizzes = [...appState.localQuizzes]; // Create copy to sort/filter

        // 1. Filter
        localQuizzes = filterQuizzes(localQuizzes);
        
        if (localQuizzes.length === 0) {
            if (currentSearchTerm) {
               activeQuizList.innerHTML = `<div class="text-center text-muted p-3 border border-secondary rounded bg-dark">No local quizzes match "${currentSearchTerm}"</div>`;
               noQuizzesMessage.classList.add('d-none');
            } else {
               noQuizzesMessage.classList.remove('d-none'); // Show "You have no active quizzes"
            }
        } else {
            noQuizzesMessage.classList.add('d-none');
            
            // 2. Sort
            localQuizzes = sortQuizzes(localQuizzes);
            
            localQuizzes.forEach(localQuiz => {
                const quizItem = document.createElement('div');
                quizItem.className = 'card bg-dark border-secondary shadow-sm';
                
                const totalQuestions = localQuiz.quizData.length;
                
                // Check if we have local progress for this quiz
                const localProgress = appState.quizProgress.find(q => q.id === localQuiz.id);
                
                let progressText = '';
                let buttonText = 'Start';
                let buttonClass = 'btn-primary';
                let isFinished = false;

                if (localProgress) {
                    const answeredCount = localProgress.userAnswers.filter(a => a !== null).length;
                    isFinished = answeredCount === totalQuestions;
                    
                    if (isFinished) {
                        progressText = `Finished! (Score: ${localProgress.score})`;
                        buttonText = 'Review';
                        buttonClass = 'btn-info text-white';
                    } else {
                        progressText = `Progress: ${localProgress.currentQuestionIndex} / ${totalQuestions} (Score: ${localProgress.score})`;
                        buttonText = 'Continue';
                    }
                } else {
                    progressText = `Not started (${totalQuestions} questions)`;
                }

                // Local quiz gets a FULL delete button AND an Edit button
                quizItem.innerHTML = `
                    <div class="card-body p-3">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <h5 class="card-title mb-0 text-light" data-id="${localQuiz.id}" data-type="name">${localQuiz.name}</h5>
                        </div>
                        <p class="card-text text-muted small mb-3">
                            ${progressText}
                        </p>
                        <div class="d-flex gap-2">
                            <button data-id="${localQuiz.id}" class="continue-btn btn ${buttonClass} btn-sm flex-grow-1 d-flex align-items-center justify-content-center">
                                ${buttonText}
                            </button>
                            <!-- NEW EDIT BUTTON -->
                            <button data-id="${localQuiz.id}" class="edit-btn btn btn-warning btn-sm d-flex align-items-center justify-content-center" title="Edit Quiz">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                  <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                            </button>
                            <button data-id="${localQuiz.id}" class="extract-btn btn btn-secondary btn-sm d-flex align-items-center justify-content-center" title="Extract JSON">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M10 20l4-16m4 4l-4 4-4-4M6 16l-4-4 4-4" />
                                </svg>
                            </button>
                            <button data-id="${localQuiz.id}" class="delete-local-btn btn btn-danger btn-sm d-flex align-items-center justify-content-center" title="Delete">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                        </div>
                    </div>
                `;
                activeQuizList.appendChild(quizItem);
            });

            // Add event listeners
            activeQuizList.querySelectorAll('.continue-btn').forEach(btn => {
                btn.addEventListener('click', (e) => startQuiz(e.currentTarget.dataset.id));
            });
            activeQuizList.querySelectorAll('.delete-local-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    if (confirm('Are you sure you want to permanently delete this local quiz?')) {
                        deleteLocalQuiz(e.currentTarget.dataset.id);
                        renderLocalQuizzes(); 
                    }
                });
            });
            activeQuizList.querySelectorAll('.extract-btn').forEach(btn => {
                btn.addEventListener('click', (e) => showExtractModal(e.currentTarget.dataset.id));
            });
            // NEW Edit Listener
            activeQuizList.querySelectorAll('.edit-btn').forEach(btn => {
                btn.addEventListener('click', (e) => handleEditLocalQuiz(e.currentTarget.dataset.id));
            });
        }
    }

    // --- Load Public Quizzes from Firebase ---
    async function fetchAndRenderPublicQuizzes() {
        publicQuizList.innerHTML = '<p class="text-muted">Loading public quizzes...</p>';
        noPublicQuizzesMessage.classList.add('d-none');
        
        publicQuizMap.clear(); 
        let publicQuizzes = [];
        
        try {
            const snapshot = await quizCollection.get();
            if (snapshot.empty) {
                noPublicQuizzesMessage.classList.remove('d-none');
                publicQuizList.innerHTML = '';
                return;
            }
            
            snapshot.forEach(doc => {
                const quizData = doc.data();
                if (quizData.name && quizData.quizData) {
                    publicQuizzes.push({
                        id: doc.id,
                        name: quizData.name,
                        quizData: quizData.quizData,
                        createdAt: quizData.createdAt ? quizData.createdAt.toMillis() : 0 // Handle timestamp
                    });
                    publicQuizMap.set(doc.id, {
                        id: doc.id,
                        name: quizData.name,
                        quizData: quizData.quizData,
                        createdAt: quizData.createdAt ? quizData.createdAt.toMillis() : 0
                    });
                }
            });
            
            renderPublicQuizList(publicQuizzes);
            
        } catch (error) {
            console.error("Error loading public quizzes:", error);
            publicQuizList.innerHTML = '<p class="text-danger">Error loading public quizzes. Check console.</p>';
            noPublicQuizzesMessage.classList.remove('d-none');
        }
    }

    // --- Render *Public* Quiz List ---
    function renderPublicQuizList(publicQuizzes) {
        publicQuizList.innerHTML = ''; 
        
        // 1. Filter
        publicQuizzes = filterQuizzes(publicQuizzes);

        if (publicQuizzes.length === 0) {
             if (currentSearchTerm) {
                publicQuizList.innerHTML = `<div class="text-center text-muted p-3 border border-secondary rounded bg-dark">No public quizzes match "${currentSearchTerm}"</div>`;
            } else {
                noPublicQuizzesMessage.classList.remove('d-none');
            }
        } else {
            noPublicQuizzesMessage.classList.add('d-none');
            
            // 2. Sort
            publicQuizzes = sortQuizzes(publicQuizzes);

            publicQuizzes.forEach(publicQuiz => {
                const quizItem = document.createElement('div');
                quizItem.className = 'card bg-dark border-secondary shadow-sm';
                
                const totalQuestions = publicQuiz.quizData.length;
                const localProgress = appState.quizProgress.find(q => q.id === publicQuiz.id);
                
                let progressText = '';
                let buttonText = 'Start';
                let buttonClass = 'btn-primary';
                let isFinished = false;

                if (localProgress) {
                    const answeredCount = localProgress.userAnswers.filter(a => a !== null).length;
                    isFinished = answeredCount === totalQuestions;
                    
                    if (isFinished) {
                        progressText = `Finished! (Score: ${localProgress.score})`;
                        buttonText = 'Review';
                        buttonClass = 'btn-info text-white';
                    } else {
                        progressText = `Progress: ${localProgress.currentQuestionIndex} / ${totalQuestions} (Score: ${localProgress.score})`;
                        buttonText = 'Continue';
                    }
                } else {
                    progressText = `Not started (${totalQuestions} questions)`;
                }

                // --- Admin Buttons ---
                const adminDeleteButton = `
                    <button data-id="${publicQuiz.id}" class="delete-public-btn btn btn-danger btn-sm d-flex align-items-center justify-content-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                           <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        <span class="ms-1">ADMIN DELETE</span>
                    </button>
                `;

                // NEW: Admin Edit Button
                const adminEditButton = `
                     <button data-id="${publicQuiz.id}" class="edit-public-btn btn btn-warning btn-sm d-flex align-items-center justify-content-center" title="Admin Edit">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                    </button>
                `;

                quizItem.innerHTML = `
                    <div class="card-body p-3">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <h5 class="card-title mb-0 text-light" data-id="${publicQuiz.id}" data-type="name">${publicQuiz.name}</h5>
                        </div>
                        <p class="card-text text-muted small mb-3">
                            ${progressText}
                        </p>
                        <div class="d-flex gap-2">
                            <button data-id="${publicQuiz.id}" class="continue-btn btn ${buttonClass} btn-sm flex-grow-1 d-flex align-items-center justify-content-center">
                                ${buttonText}
                            </button>
                            ${isAdmin ? adminEditButton : ''}
                            <button data-id="${publicQuiz.id}" class="extract-btn btn btn-secondary btn-sm d-flex align-items-center justify-content-center">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M10 20l4-16m4 4l-4 4-4-4M6 16l-4-4 4-4" />
                                </svg>
                                <span class="ms-1 d-none d-sm-inline">Extract</span>
                            </button>
                            <button data-id="${publicQuiz.id}" class="delete-progress-btn btn btn-danger btn-sm d-flex align-items-center justify-content-center ${!localProgress ? 'd-none' : ''}">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                <span class="ms-1 d-none d-sm-inline">Reset</span>
                            </button>
                            ${isAdmin ? adminDeleteButton : ''} 
                        </div>
                    </div>
                `;
                publicQuizList.appendChild(quizItem);
            });

            // Event Listeners
            publicQuizList.querySelectorAll('.continue-btn').forEach(btn => {
                btn.addEventListener('click', (e) => startQuiz(e.currentTarget.dataset.id));
            });
            publicQuizList.querySelectorAll('.delete-progress-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    deleteQuizProgress(e.currentTarget.dataset.id);
                    fetchAndRenderPublicQuizzes();
                });
            });
            publicQuizList.querySelectorAll('.extract-btn').forEach(btn => {
                btn.addEventListener('click', (e) => showExtractModal(e.currentTarget.dataset.id));
            });

            // Admin Actions
            if (isAdmin) {
                // Delete
                publicQuizList.querySelectorAll('.delete-public-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const quizId = e.currentTarget.dataset.id;
                        if (confirm(`ADMIN: Are you sure you want to permanently delete this PUBLIC quiz (${quizId}) from Firebase?`)) {
                            try {
                                btn.textContent = '...';
                                btn.disabled = true;
                                await quizCollection.doc(quizId).delete();
                                deleteQuizProgress(quizId); 
                                fetchAndRenderPublicQuizzes(); 
                            } catch (error) {
                                console.error("Error admin-deleting quiz:", error);
                                alert("Error deleting quiz. Check console.");
                                btn.textContent = 'ADMIN DELETE';
                                btn.disabled = false;
                            }
                        }
                    });
                });

                // Edit
                publicQuizList.querySelectorAll('.edit-public-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => handleEditPublicQuiz(e.currentTarget.dataset.id));
                });
            }
        }
    }
    
    // --- SCREEN 2: SETUP LOGIC ---

    function switchSetupTab(tab) {
        currentLoadTab = tab;
        if (tab === 'json') {
            tabBtnJson.classList.add('active', 'text-primary');
            tabBtnJson.classList.remove('text-secondary');
            tabBtnText.classList.remove('active', 'text-primary');
            tabBtnText.classList.add('text-secondary');
            
            tabContentJson.classList.remove('d-none');
            tabContentText.classList.add('d-none');
        } else {
            tabBtnText.classList.add('active', 'text-primary');
            tabBtnText.classList.remove('text-secondary');
            tabBtnJson.classList.remove('active', 'text-primary');
            tabBtnJson.classList.add('text-secondary');

            tabContentText.classList.remove('d-none');
            tabContentJson.classList.add('d-none');
        }
    }
    
    tabBtnJson.addEventListener('click', () => switchSetupTab('json'));
    tabBtnText.addEventListener('click', () => switchSetupTab('text'));
    
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            fileNameDisplay.textContent = file.name;
            jsonTextInput.value = '';
            simpleTextInput.value = '';
        } else {
            fileNameDisplay.textContent = 'No file chosen';
        }
    });

    // Handle Editing Local
    function handleEditLocalQuiz(quizId) {
        const quiz = appState.localQuizzes.find(q => q.id === quizId);
        if (!quiz) return;

        prepareEditForm(quizId, quiz.name, quiz.quizData, 'local');
    }

    // Handle Editing Public (Admin)
    function handleEditPublicQuiz(quizId) {
        const quiz = publicQuizMap.get(quizId);
        if (!quiz) return;

        prepareEditForm(quizId, quiz.name, quiz.quizData, 'public');
    }

    // Helper to prep form
    function prepareEditForm(id, name, data, mode) {
        editingQuizId = id;
        editingMode = mode;
        
        // Pre-fill fields
        quizNameInput.value = name;
        jsonTextInput.value = JSON.stringify(data, null, 2);
        
        // Hide Public option (we lock the type when editing)
        publicCheckbox.checked = (mode === 'public');
        publicCheckboxContainer.classList.add('d-none');

        // UI Updates
        setupTitle.textContent = mode === 'public' ? "Edit Public Quiz (Admin)" : "Edit Local Quiz";
        loadQuizBtn.textContent = "Save Changes";
        loadQuizBtn.classList.remove('btn-success');
        loadQuizBtn.classList.add('btn-warning');
        
        // Switch to JSON tab by default
        switchSetupTab('json');
        
        showScreen('setup');
    }

    loadQuizBtn.addEventListener('click', async () => {
        loadQuizBtn.disabled = true;
        
        // Determine mode
        const isEditing = editingQuizId !== null;
        const isPublic = publicCheckbox.checked;

        if (isEditing) {
            loadQuizBtn.textContent = 'Saving Changes...';
        } else {
            loadQuizBtn.textContent = isPublic ? 'Saving to Public Library...' : 'Saving locally...';
        }

        let quizName = ""; 
        let quizData = null;

        try {
            quizName = quizNameInput.value.trim();
            if (!quizName) {
                throw new Error('Please enter a name for your quiz.');
            }

            if (currentLoadTab === 'json') {
                const file = fileInput.files[0];
                const pastedText = jsonTextInput.value;

                if (file) {
                    const fileText = await file.text();
                    quizData = JSON.parse(fileText);
                } else if (pastedText) {
                    quizData = JSON.parse(pastedText);
                } else {
                    throw new Error('Please paste JSON data or upload a file.');
                }
            } else { 
                const simpleText = simpleTextInput.value;
                if (!simpleText) {
                    throw new Error('Please paste your simple text data.');
                }
                quizData = parseSimpleText(simpleText);
            }

            if (validateQuizData(quizData)) {
                
                if (isEditing) {
                    // --- UPDATE EXISTING QUIZ ---
                    
                    if (editingMode === 'public') {
                        // Admin updating Firebase
                        if (!isAdmin) throw new Error("Unauthorized to edit public quiz.");
                        
                        await quizCollection.doc(editingQuizId).update({
                            name: quizName,
                            quizData: quizData
                            // We don't update createdAt so sorting stays consistent, or we could add updatedAt
                        });
                        
                        // We do NOT reset progress for public quizzes automatically to avoid frustrating users,
                        // but realize that if questions changed, their progress might be buggy.
                        // For a simple app, this is acceptable. 
                        
                        // Refresh to show changes
                        fetchAndRenderPublicQuizzes();
                        
                    } else {
                        // Local Update
                        const updatedQuiz = { 
                            id: editingQuizId, 
                            name: quizName, 
                            quizData: quizData,
                            createdAt: Date.now() 
                        };
                        
                        // Reset progress for local because it's just one user
                        deleteQuizProgress(editingQuizId);
                        saveLocalQuiz(updatedQuiz);
                        refreshAllLists();
                    }
                    
                    // Reset editing state
                    editingQuizId = null;
                    editingMode = 'local';
                    showScreen('list');
                    
                } else {
                    // --- CREATE NEW QUIZ ---
                    if (isPublic) {
                        const newPublicQuiz = { 
                            name: quizName, 
                            quizData: quizData,
                            createdAt: firebase.firestore.FieldValue.serverTimestamp() // Add timestamp for sorting
                        };
                        const docRef = await quizCollection.add(newPublicQuiz);
                        fetchAndRenderPublicQuizzes();
                        showScreen('list');
                    } else {
                        const newQuizId = `local_${Date.now()}`;
                        const newLocalQuiz = { 
                            id: newQuizId, 
                            name: quizName, 
                            quizData: quizData,
                            createdAt: Date.now() // Save timestamp for sorting
                        };
                        saveLocalQuiz(newLocalQuiz); 
                        
                        // Initialize progress for immediate start
                        const newQuizProgress = {
                            id: newQuizId, 
                            currentQuestionIndex: 0,
                            score: 0,
                            userAnswers: new Array(quizData.length).fill(null),
                            visited: new Array(quizData.length).fill(false),
                            reviewingSkipped: false
                        };
                        appState.quizProgress.push(newQuizProgress);
                        saveStateToStorage();
                        
                        startQuiz(newQuizId); 
                    }
                }
                
                resetSetupForm();

            } else {
                throw new Error('Invalid quiz data structure.');
            }
        } catch (error) {
            console.error(error);
            showSetupError(error.message);
        } finally {
            loadQuizBtn.disabled = false;
            // Reset button text default
            if (!editingQuizId) {
                loadQuizBtn.textContent = 'Create Quiz';
            }
        }
    });
    
    function resetSetupForm() {
        jsonTextInput.value = '';
        simpleTextInput.value = '';
        fileInput.value = null;
        fileNameDisplay.textContent = 'No file chosen';
        setupError.classList.add('d-none');
        publicCheckbox.checked = false; 
        quizNameInput.value = '';
        
        // Reset Editing UI
        editingQuizId = null;
        editingMode = 'local';
        setupTitle.textContent = "Load New Quiz";
        publicCheckboxContainer.classList.remove('d-none');
        loadQuizBtn.classList.remove('btn-warning');
        loadQuizBtn.classList.add('btn-success');
        loadQuizBtn.textContent = 'Create Quiz';
    }

    function parseSimpleText(text) {
        const questionBlocks = text.trim().split(/\n\s*\n/);
        const quizData = [];

        for (const block of questionBlocks) {
            const lines = block.trim().split('\n').filter(line => line.trim() !== '');
            if (lines.length < 2) continue;

            const questionText = lines[0].trim();
            const options = [];
            let correctAnswerIndex = -1;

            for (let i = 1; i < lines.length; i++) {
                let optionText = lines[i].trim();
                if (optionText.startsWith('*')) {
                    optionText = optionText.substring(1).trim();
                    correctAnswerIndex = options.length;
                }
                options.push(optionText);
            }

            if (questionText && options.length > 1 && correctAnswerIndex !== -1) {
                quizData.push({
                    type: 'multiple-choice', 
                    questionText,
                    options,
                    correctAnswerIndex
                });
            }
        }

        if (quizData.length === 0) {
            throw new Error('Could not parse any valid questions. Check the format.');
        }
        return quizData;
    }
    
    function showSetupError(message) {
        setupError.textContent = message;
        setupError.classList.remove('d-none');
    }

    function validateQuizData(data) {
        if (!Array.isArray(data) || data.length === 0) return false;
        
        return data.every(q => {
            const type = q.type || 'multiple-choice';
            
            if (!q.hasOwnProperty('questionText')) return false;

            if (type === 'multiple-choice') {
                return q.hasOwnProperty('options') &&
                       Array.isArray(q.options) &&
                       q.hasOwnProperty('correctAnswerIndex') &&
                       typeof q.correctAnswerIndex === 'number';
            } else if (type === 'identification') {
                const hasStringAnswer = q.hasOwnProperty('correctAnswer') && typeof q.correctAnswer === 'string';
                const hasArrayAnswer = q.hasOwnProperty('correctAnswers') && Array.isArray(q.correctAnswers) && q.correctAnswers.length > 0;
                return hasStringAnswer || hasArrayAnswer;
            } else if (type === 'enumeration') {
                return q.hasOwnProperty('correctAnswers') && 
                       Array.isArray(q.correctAnswers) &&
                       q.correctAnswers.length > 0;
            }
            return false; 
        });
    }


    // --- SCREEN 3: QUIZ LOGIC ---

    async function startQuiz(quizId) {
        let quizDefinition = null;

        // Step 1: Get the Quiz Definition
        if (quizId.startsWith('local_')) {
            quizDefinition = appState.localQuizzes.find(q => q.id === quizId);
        } else {
            quizDefinition = publicQuizMap.get(quizId);
            if (!quizDefinition) {
                try {
                    const doc = await quizCollection.doc(quizId).get();
                    if (doc.exists) {
                        const data = doc.data();
                        quizDefinition = { 
                            id: doc.id, 
                            ...data,
                            createdAt: data.createdAt ? data.createdAt.toMillis() : 0 
                        };
                        publicQuizMap.set(quizId, quizDefinition);
                    } else {
                        console.error("No public quiz found!");
                        deleteQuizProgress(quizId);
                        renderLocalQuizzes();
                        fetchAndRenderPublicQuizzes();
                        showScreen('list');
                        return;
                    }
                } catch (err) {
                    console.error("Error fetching quiz:", err);
                    showScreen('list');
                    return;
                }
            }
        }

        if (!quizDefinition) {
             showScreen('list');
             return;
        }

        // Step 2: Find or create progress
        let quizProgress = appState.quizProgress.find(q => q.id === quizId);
        
        if (!quizProgress) {
            quizProgress = {
                id: quizId,
                currentQuestionIndex: 0,
                score: 0,
                userAnswers: new Array(quizDefinition.quizData.length).fill(null),
                visited: new Array(quizDefinition.quizData.length).fill(false),
                reviewingSkipped: false
            };
            appState.quizProgress.push(quizProgress);
            saveStateToStorage();
        }
        
        const answeredCount = quizProgress.userAnswers.filter(a => a !== null).length;
        const isFinished = answeredCount === quizDefinition.quizData.length;
        
        if (isFinished) {
            currentQuizId = quizId;
            showResults();
            return;
        }

        currentQuizId = quizId;
        
        quizTitle.textContent = quizDefinition.name;
        quizTitle.title = quizDefinition.name;
        totalQuestions.textContent = quizDefinition.quizData.length;
        
        showScreen('quiz');
        displayQuestion();
    }

    function getCurrentQuiz() {
        if (!currentQuizId) return null;
        
        const progress = appState.quizProgress.find(q => q.id === currentQuizId);
        let definition = null;

        if (currentQuizId.startsWith('local_')) {
            definition = appState.localQuizzes.find(q => q.id === currentQuizId);
        } else {
            definition = publicQuizMap.get(currentQuizId);
        }
        
        if (!progress || !definition) {
            return null;
        }
        
        return { progress, definition };
    }

    function updateProgressBar() {
        const quiz = getCurrentQuiz();
        if (!quiz) return;
        
        const answeredCount = quiz.progress.userAnswers.filter(a => a !== null).length;
        const percent = (answeredCount / quiz.definition.quizData.length) * 100;
        progressBar.style.width = `${percent}%`;
    }

    // --- MODIFIED: displayQuestion (Bootstrap Styling) ---
    function displayQuestion() {
        const quiz = getCurrentQuiz();
        if (!quiz) {
            renderLocalQuizzes();
            fetchAndRenderPublicQuizzes();
            showScreen('list');
            return;
        }
        
        const { progress, definition } = quiz;
        
        // Safety check if quiz definition changed length (edited)
        if (progress.visited.length !== definition.quizData.length) {
            // Resize arrays
            const newLen = definition.quizData.length;
            const oldLen = progress.userAnswers.length;
            
            if (newLen > oldLen) {
                // Grow
                for(let i=oldLen; i<newLen; i++) {
                    progress.userAnswers.push(null);
                    progress.visited.push(false);
                }
            } else {
                // Shrink
                progress.userAnswers = progress.userAnswers.slice(0, newLen);
                progress.visited = progress.visited.slice(0, newLen);
                if (progress.currentQuestionIndex >= newLen) {
                    progress.currentQuestionIndex = newLen - 1;
                }
            }
        }
        
        progress.visited[progress.currentQuestionIndex] = true;
        const question = definition.quizData[progress.currentQuestionIndex];
        const type = question.type || 'multiple-choice';

        updateProgressBar();
        questionText.textContent = question.questionText;
        questionCounter.textContent = progress.currentQuestionIndex + 1;
        currentScore.textContent = progress.score;
        
        optionsContainer.innerHTML = '';
        feedbackMessage.textContent = '';
        feedbackMessage.className = 'text-center fw-bold fs-5 my-3';
        quizContainer.classList.remove('shake', 'pop');
        
        if (progress.reviewingSkipped) {
            skippedModeBanner.classList.remove('d-none');
        } else {
            skippedModeBanner.classList.add('d-none');
        }

        const existingAnswer = progress.userAnswers[progress.currentQuestionIndex];
        const isAnswered = existingAnswer !== null;

        if (type === 'multiple-choice') {
            question.options.forEach((option, index) => {
                const button = document.createElement('button');
                button.textContent = `${index + 1}. ${option}`;
                button.dataset.index = index;
                button.className = "btn btn-outline-light text-start p-3 w-100 mb-2 shadow-sm position-relative";
                
                if (isAnswered) {
                    button.disabled = true;
                    button.style.opacity = "0.8";
                    if (index === question.correctAnswerIndex) {
                        button.classList.remove('btn-outline-light');
                        button.classList.add('btn-success');
                    } else if (index === existingAnswer) {
                         button.classList.remove('btn-outline-light');
                         button.classList.add('btn-danger');
                    }
                } else {
                    button.addEventListener('click', handleOptionClick);
                }
                optionsContainer.appendChild(button);
            });

        } else if (type === 'identification') {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'form-control form-control-lg bg-dark text-light border-secondary mb-3';
            input.placeholder = 'Type your answer here...';
            input.id = 'ident-input';
            
            const submitBtn = document.createElement('button');
            submitBtn.textContent = 'Submit Answer';
            submitBtn.className = 'btn btn-primary w-100 py-2';
            submitBtn.addEventListener('click', handleIdentificationSubmit);

            if (isAnswered) {
                input.value = existingAnswer; 
                input.disabled = true;
                submitBtn.classList.add('d-none');
            } else {
                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') submitBtn.click();
                });
            }

            optionsContainer.appendChild(input);
            optionsContainer.appendChild(submitBtn);

        } else if (type === 'enumeration') {
            const count = question.correctAnswers.length;
            for(let i = 0; i < count; i++) {
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'enum-input form-control bg-dark text-light border-secondary mb-2';
                input.placeholder = `Item ${i + 1}`;
                input.dataset.index = i;
                
                if (isAnswered) {
                    input.value = existingAnswer[i] || '';
                    input.disabled = true;
                }
                optionsContainer.appendChild(input);
            }
            
            const submitBtn = document.createElement('button');
            submitBtn.textContent = 'Submit Answers';
            submitBtn.className = 'btn btn-primary w-100 py-2 mt-2';
            submitBtn.addEventListener('click', handleEnumerationSubmit);
            
            if (isAnswered) {
                submitBtn.classList.add('d-none');
            }

            optionsContainer.appendChild(submitBtn);
        }

        if (isAnswered) {
             if (type === 'multiple-choice') {
                 showFeedbackMC(existingAnswer, false); 
             } else if (type === 'identification') {
                 showFeedbackIdentification(existingAnswer, false);
             } else if (type === 'enumeration') {
                 showFeedbackEnumeration(existingAnswer, false);
             }
            skipQuestionBtn.disabled = true;
        } else {
            nextQuestionBtn.classList.add('d-none');
            skipQuestionBtn.disabled = false;
        }
        prevQuestionBtn.disabled = progress.currentQuestionIndex === 0;
    }

    // --- ANSWER HANDLERS ---

    function handleOptionClick(e) {
        const quiz = getCurrentQuiz();
        if (!quiz) return;
        
        const { progress, definition } = quiz;
        const question = definition.quizData[progress.currentQuestionIndex];
        const correctIndex = question.correctAnswerIndex;
        const selectedButton = e.currentTarget;
        const selectedIndex = parseInt(selectedButton.dataset.index);
        
        const isCorrect = (selectedIndex === correctIndex);
        if (isCorrect) progress.score++;

        progress.userAnswers[progress.currentQuestionIndex] = selectedIndex;
        currentScore.textContent = progress.score;
        
        updateQuizProgress();
        showFeedbackMC(selectedIndex, true);
    }

    function handleIdentificationSubmit() {
        const quiz = getCurrentQuiz();
        if (!quiz) return;

        const input = document.getElementById('ident-input');
        const userAnswer = input.value.trim();
        if (!userAnswer) return; 

        const { progress, definition } = quiz;
        const question = definition.quizData[progress.currentQuestionIndex];
        const validAnswers = question.correctAnswers || [question.correctAnswer];

        const normalizedUserAnswer = userAnswer.toLowerCase().trim();
        const isCorrect = validAnswers.some(ans => ans.toLowerCase().trim() === normalizedUserAnswer);
        if (isCorrect) progress.score++;

        progress.userAnswers[progress.currentQuestionIndex] = userAnswer;
        currentScore.textContent = progress.score;

        updateQuizProgress();
        showFeedbackIdentification(userAnswer, true);
    }

    function handleEnumerationSubmit() {
        const quiz = getCurrentQuiz();
        if (!quiz) return;

        const inputs = document.querySelectorAll('.enum-input');
        const userAnswers = Array.from(inputs).map(input => input.value.trim());
        
        const { progress, definition } = quiz;
        const question = definition.quizData[progress.currentQuestionIndex];
        const correctAnswers = question.correctAnswers; 

        const normUser = userAnswers.map(a => a.toLowerCase());
        const normCorrect = correctAnswers.map(a => a.toLowerCase());

        let correctCount = 0;
        normCorrect.forEach(ca => {
            if (normUser.includes(ca)) correctCount++;
        });

        const isCorrect = correctCount === correctAnswers.length;
        if (isCorrect) progress.score++;

        progress.userAnswers[progress.currentQuestionIndex] = userAnswers;
        currentScore.textContent = progress.score;

        updateQuizProgress();
        showFeedbackEnumeration(userAnswers, true);
    }
    
    // --- FEEDBACK FUNCTIONS ---

    function showFeedbackMC(selectedIndex, withAnimation) {
        const quiz = getCurrentQuiz();
        const { definition, progress } = quiz;
        const question = definition.quizData[progress.currentQuestionIndex];
        const correctIndex = question.correctAnswerIndex;
        
        const buttons = optionsContainer.querySelectorAll('button');
        buttons.forEach(btn => {
            btn.disabled = true;
            btn.style.opacity = "0.8";
            
            const idx = parseInt(btn.dataset.index);
            if (idx === correctIndex) {
                 btn.classList.remove('btn-outline-light');
                 btn.classList.add('btn-success');
            } else if (idx === selectedIndex) {
                 btn.classList.remove('btn-outline-light');
                 btn.classList.add('btn-danger');
            }
        });

        if (selectedIndex === correctIndex) {
            setFeedbackText('Correct!', true);
            if (withAnimation) quizContainer.classList.add('pop');
        } else {
            setFeedbackText(`Wrong! The correct answer was: ${question.options[correctIndex]}`, false);
            if (withAnimation) quizContainer.classList.add('shake');
        }
        
        finalizeQuestionState();
    }

    function showFeedbackIdentification(userAnswer, withAnimation) {
        const quiz = getCurrentQuiz();
        const { definition, progress } = quiz;
        const question = definition.quizData[progress.currentQuestionIndex];
        const validAnswers = question.correctAnswers || [question.correctAnswer];

        const normalizedUserAnswer = (userAnswer || '').toLowerCase().trim();
        const isCorrect = validAnswers.some(ans => ans.toLowerCase().trim() === normalizedUserAnswer);
        const input = document.getElementById('ident-input');
        if (input) {
            input.disabled = true;
            if (isCorrect) {
                input.classList.add('is-valid');
            } else {
                input.classList.add('is-invalid');
            }
        }
        
        const submitBtn = optionsContainer.querySelector('button');
        if (submitBtn) submitBtn.classList.add('d-none');

        if (isCorrect) {
            setFeedbackText('Correct!', true);
            if (withAnimation) quizContainer.classList.add('pop');
        } else {
            const correctAnswerText = validAnswers.join(' OR ');
            setFeedbackText(`Wrong! Correct answer: ${correctAnswerText}`, false);
            if (withAnimation) quizContainer.classList.add('shake');
        }

        finalizeQuestionState();
    }

    function showFeedbackEnumeration(userAnswers, withAnimation) {
        const quiz = getCurrentQuiz();
        const { definition, progress } = quiz;
        const question = definition.quizData[progress.currentQuestionIndex];
        const correctAnswers = question.correctAnswers;

        const normCorrect = correctAnswers.map(a => a.toLowerCase());

        const inputs = optionsContainer.querySelectorAll('.enum-input');
        let allCorrect = true;

        inputs.forEach((input, i) => {
            input.disabled = true;
            const val = (userAnswers[i] || '').trim();
            if (normCorrect.includes(val.toLowerCase())) {
                input.classList.add('is-valid');
            } else {
                input.classList.add('is-invalid');
                allCorrect = false;
            }
        });
        
        const submitBtn = optionsContainer.querySelector('button');
        if(submitBtn) submitBtn.classList.add('d-none');

        if (allCorrect) {
             setFeedbackText('Correct! You listed them all.', true);
             if (withAnimation) quizContainer.classList.add('pop');
        } else {
             setFeedbackText(`Partially correct or Wrong. Expected: ${correctAnswers.join(', ')}`, false);
             if (withAnimation) quizContainer.classList.add('shake');
        }
        
        finalizeQuestionState();
    }

    function setFeedbackText(msg, isSuccess) {
        feedbackMessage.textContent = msg;
        feedbackMessage.className = `text-center fw-bold fs-5 my-3 ${isSuccess ? 'text-success' : 'text-danger'}`;
    }

    function finalizeQuestionState() {
        skipQuestionBtn.disabled = true;
        nextQuestionBtn.classList.remove('d-none');
    }
    
    function goToNextQuestion() {
        const quiz = getCurrentQuiz();
        if (!quiz) return;
        
        const { progress, definition } = quiz;
        if (progress.reviewingSkipped) {
            let nextSkippedIndex = progress.userAnswers.indexOf(null, progress.currentQuestionIndex + 1);
            if (nextSkippedIndex === -1) {
                nextSkippedIndex = progress.userAnswers.indexOf(null);
            }
            if (nextSkippedIndex !== -1 && nextSkippedIndex !== progress.currentQuestionIndex) {
                progress.currentQuestionIndex = nextSkippedIndex;
            } else {
                const allSkipped = progress.userAnswers.filter(a => a === null).length;
                if (allSkipped === 0) {
                    updateQuizProgress();
                    showResults();
                    return;
                } else {
                    progress.currentQuestionIndex = nextSkippedIndex;
                }
            }
        } else {
            progress.currentQuestionIndex++;
            if (progress.currentQuestionIndex >= definition.quizData.length) {
                const firstSkippedIndex = progress.userAnswers.indexOf(null);
                if (firstSkippedIndex !== -1) {
                    progress.reviewingSkipped = true;
                    progress.currentQuestionIndex = firstSkippedIndex;
                } else {
                    updateQuizProgress();
                    showResults();
                    return;
                }
            }
        }
        updateQuizProgress();
        displayQuestion();
    }

    nextQuestionBtn.addEventListener('click', goToNextQuestion);
    
    prevQuestionBtn.addEventListener('click', () => {
        const quiz = getCurrentQuiz();
        if (!quiz) return;
        if (quiz.progress.currentQuestionIndex > 0) {
            quiz.progress.currentQuestionIndex--;
            updateQuizProgress();
            displayQuestion();
        }
    });
    
    skipQuestionBtn.addEventListener('click', () => {
        goToNextQuestion();
    });

    // --- SCREEN 4: RESULTS LOGIC ---
    
    function showResults() {
        const quiz = getCurrentQuiz();
        if (!quiz) {
            renderLocalQuizzes();
            fetchAndRenderPublicQuizzes();
            showScreen('list');
            return;
        }
        
        const { progress, definition } = quiz;
        progress.reviewingSkipped = false;
        updateQuizProgress();
        const { score } = progress;
        const { quizData } = definition;
        showScreen('results');
        scoreText.textContent = `${score} / ${quizData.length}`;
        const percentage = (score / quizData.length);
        if (percentage < 0.5) {
            scoreText.className = 'display-2 fw-bold mb-5 text-danger';
        } else if (percentage < 0.8) {
            scoreText.className = 'display-2 fw-bold mb-5 text-warning';
        } else {
            scoreText.className = 'display-2 fw-bold mb-5 text-success';
        }
    }
    
    // --- SCREEN 5: REVIEW LOGIC ---
    
    function renderReviewList() {
        const quiz = getCurrentQuiz();
        if (!quiz) {
            showScreen('list');
            return;
        }

        const { progress, definition } = quiz;
        reviewList.innerHTML = '';
        
        definition.quizData.forEach((question, index) => {
            const userAnswer = progress.userAnswers[index];
            const type = question.type || 'multiple-choice';
            let contentHTML = '';

            if (userAnswer === null) {
                 contentHTML = `<div class="alert alert-warning p-2 mb-2">Skipped</div>`;
            } else {
                if (type === 'multiple-choice') {
                    contentHTML = '<ul class="list-group">';
                    question.options.forEach((option, optIndex) => {
                        let listClass = 'list-group-item bg-dark text-light border-secondary';
                        let indicator = '';
                        
                        const isCorrect = (optIndex === question.correctAnswerIndex);
                        const isSelected = (optIndex === userAnswer);

                        if (isCorrect) {
                            listClass = 'list-group-item list-group-item-success';
                            indicator = ' (Correct)';
                        }
                        if (isSelected && !isCorrect) {
                            listClass = 'list-group-item list-group-item-danger';
                            indicator = ' (Your Answer)';
                        } else if (isSelected && isCorrect) {
                            indicator = ' (Your Answer)';
                        }
                        contentHTML += `<li class="${listClass}">${option}<span class="fw-bold small">${indicator}</span></li>`;
                    });
                    contentHTML += '</ul>';
                
                } else if (type === 'identification') {
                    const validAnswers = question.correctAnswers || [question.correctAnswer];
                    const normalizedUserAnswer = (userAnswer || '').toLowerCase().trim();
                    const isCorrect = validAnswers.some(ans => ans.toLowerCase().trim() === normalizedUserAnswer);
                    const correctAnswerText = validAnswers.join(' OR ');
                    contentHTML = `
                        <div class="small">
                            <div class="${isCorrect ? 'text-success' : 'text-danger'} fw-bold">
                                Your Answer: ${userAnswer}
                            </div>
                            ${!isCorrect ? `<div class="text-success">Correct Answer: ${correctAnswerText}</div>` : ''}
                        </div>
                    `;
                } else if (type === 'enumeration') {
                    const normCorrect = question.correctAnswers.map(a => a.toLowerCase());
                    let itemsHTML = '';
                    
                    userAnswer.forEach(ans => {
                        const isItemCorrect = normCorrect.includes(ans.toLowerCase());
                         itemsHTML += `<span class="badge ${isItemCorrect ? 'text-bg-success' : 'text-bg-danger'} me-1 mb-1">${ans}</span>`;
                    });

                    contentHTML = `
                        <div class="small">
                            <div class="mb-1">You listed:</div>
                            <div class="mb-2">${itemsHTML}</div>
                            <div class="text-muted fst-italic">Required: ${question.correctAnswers.join(', ')}</div>
                        </div>
                    `;
                }
            }

            const reviewItem = document.createElement('div');
            reviewItem.className = 'card bg-dark border-secondary mb-3';
            reviewItem.innerHTML = `
                <div class="card-body">
                    <h5 class="card-title mb-3 text-light">
                        ${index + 1}. ${question.questionText} <span class="badge bg-secondary ms-2">${type}</span>
                    </h5>
                    ${contentHTML}
                </div>
            `;
            reviewList.appendChild(reviewItem);
        });
        showScreen('review');
    }

    // --- TOC MODAL LOGIC ---

    function renderTocModal() {
        const quiz = getCurrentQuiz();
        if (!quiz) return;
        
        const { progress, definition } = quiz;
        tocGrid.innerHTML = '';
        
        definition.quizData.forEach((question, index) => {
            const button = document.createElement('button');
            button.textContent = index + 1;
            button.dataset.index = index;
            button.className = 'btn btn-sm fw-bold';
            
            const userAnswer = progress.userAnswers[index];
            const isVisited = progress.visited[index];
            const type = question.type || 'multiple-choice';

            if (userAnswer !== null) {
                let isCorrect = false;
                
                if (type === 'multiple-choice') {
                    isCorrect = (userAnswer === question.correctAnswerIndex);
                } else if (type === 'identification') {
                    const validAnswers = question.correctAnswers || [question.correctAnswer];
                    const normalizedUserAnswer = (userAnswer || '').toLowerCase().trim();
                    isCorrect = validAnswers.some(ans => ans.toLowerCase().trim() === normalizedUserAnswer);
                } else if (type === 'enumeration') {
                    const normCorrect = question.correctAnswers.map(a => a.toLowerCase());
                    const normUser = userAnswer.map(a => a.toLowerCase());
                    let correctCount = 0;
                    normCorrect.forEach(ca => {
                        if(normUser.includes(ca)) correctCount++;
                    });
                    isCorrect = (correctCount === question.correctAnswers.length);
                }

                if (isCorrect) {
                    button.classList.add('btn-success');
                } else {
                    button.classList.add('btn-danger');
                }
            } else if (isVisited) {
                button.classList.add('btn-warning');
            } else {
                button.classList.add('btn-secondary');
            }
            if (index === progress.currentQuestionIndex) {
                button.classList.remove('btn-secondary', 'btn-success', 'btn-danger', 'btn-warning');
                button.classList.add('btn-outline-info', 'border-2');
            }
            button.addEventListener('click', () => jumpToQuestion(index));
            tocGrid.appendChild(button);
        });
        tocModalContainer.classList.remove('d-none');
    }

    function hideTocModal() {
        tocModalContainer.classList.add('d-none');
    }

    function jumpToQuestion(index) {
        const quiz = getCurrentQuiz();
        if (!quiz) return;
        
        quiz.progress.currentQuestionIndex = index;
        updateQuizProgress();
        displayQuestion();
        hideTocModal();
    }

    // --- EXTRACT MODAL LOGIC ---

    function switchExtractTab(tab) {
        currentExtractTab = tab;
        if (tab === 'json') {
            extractTabBtnJson.classList.add('active');
            extractTabBtnText.classList.remove('active');
            extractTabContentJson.classList.remove('d-none');
            extractTabContentText.classList.add('d-none');
        } else {
            extractTabBtnText.classList.add('active');
            extractTabBtnJson.classList.remove('active');
            extractTabContentText.classList.remove('d-none');
            extractTabContentJson.classList.add('d-none');
        }
    }

    function convertQuizDataToSimpleText(quizData) {
        const textBlocks = quizData.map(question => {
            const type = question.type || 'multiple-choice';
            
            if (type === 'multiple-choice') {
                const qText = question.questionText;
                const optionsText = question.options.map((option, index) => {
                    if (index === question.correctAnswerIndex) {
                        return `*${option}`;
                    }
                    return option;
                }).join('\n');
                return `${qText}\n${optionsText}`;
            } else {
                return `${question.questionText}\n(This question type [${type}] cannot be fully represented in Simple Text format)`;
            }
        });
        return textBlocks.join('\n\n');
    }

    function showExtractModal(quizId) {
        let quizDefinition = null;

        if (quizId.startsWith('local_')) {
            quizDefinition = appState.localQuizzes.find(q => q.id === quizId);
        } else {
            quizDefinition = publicQuizMap.get(quizId);
        }

        if (!quizDefinition) {
            return;
        }

        switchExtractTab('json');
        extractQuizName.textContent = quizDefinition.name;
        const jsonString = JSON.stringify(quizDefinition.quizData, null, 2);
        extractJsonTextarea.value = jsonString;
        const textString = convertQuizDataToSimpleText(quizDefinition.quizData);
        extractTextTextarea.value = textString;
        copyJsonBtn.textContent = 'Copy JSON to Clipboard';
        copyTextBtn.textContent = 'Copy Text to Clipboard';
        extractModalContainer.classList.remove('d-none');
    }

    function hideExtractModal() {
        extractModalContainer.classList.add('d-none');
    }

    function copyToClipboard(textarea, button) {
        navigator.clipboard.writeText(textarea.value).then(() => {
            const originalText = button.textContent;
            button.textContent = 'Copied!';
            setTimeout(() => {
                button.textContent = originalText;
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy: ', err);
            button.textContent = 'Failed to copy';
        });
    }

    extractTabBtnJson.addEventListener('click', () => switchExtractTab('json'));
    extractTabBtnText.addEventListener('click', () => switchExtractTab('text'));
    closeExtractBtn.addEventListener('click', hideExtractModal);
    extractModalContainer.addEventListener('click', (e) => {
        if (e.target === extractModalContainer) {
            hideExtractModal();
        }
    });
    copyJsonBtn.addEventListener('click', () => copyToClipboard(extractJsonTextarea, copyJsonBtn));
    copyTextBtn.addEventListener('click', () => copyToClipboard(extractTextTextarea, copyTextBtn));


    // --- INITIALIZATION & NAVIGATION LISTENERS ---

    function refreshAllLists() {
        renderLocalQuizzes();
        fetchAndRenderPublicQuizzes();
        showScreen('list');
    }

    loadNewQuizBtn.addEventListener('click', () => {
        resetSetupForm();
        showScreen('setup');
    });
    
    // NEW: Sort Listener
    sortSelect.addEventListener('change', (e) => {
        currentSort = e.target.value;
        refreshAllLists();
    });

    // NEW: Search Listener
    searchInput.addEventListener('input', (e) => {
        currentSearchTerm = e.target.value.trim();
        refreshAllLists();
    });

    backToListBtn.addEventListener('click', () => {
        // Reset form to avoid "stuck" editing state when navigating back manually
        resetSetupForm(); 
        showScreen('list');
    });
    
    quizBackToListBtn.addEventListener('click', () => {
        updateQuizProgress(); 
        refreshAllLists();
    });
    
    resultsBackToListBtn.addEventListener('click', () => {
        currentQuizId = null;
        refreshAllLists();
    });
    
    reviewAnswersBtn.addEventListener('click', renderReviewList);
    reviewBackToResultsBtn.addEventListener('click', () => showScreen('results'));

    showTocBtn.addEventListener('click', renderTocModal);
    closeTocBtn.addEventListener('click', hideTocModal);
    tocModalContainer.addEventListener('click', (e) => {
        if (e.target === tocModalContainer) {
            hideTocModal();
        }
    });

    // --- KEYBOARD SHORTCUTS ---
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return; 
        }

        if (!tocModalContainer.classList.contains('d-none')) {
            if (e.key === 'Escape') {
                e.preventDefault();
                hideTocModal();
            }
            return;
        }

        if (!extractModalContainer.classList.contains('d-none')) {
            if (e.key === 'Escape') {
                e.preventDefault();
                hideExtractModal();
            }
            return;
        }

        if (!screenContainers.quiz.classList.contains('d-none')) {
            switch (e.key) {
                case 'Enter':
                    if (!nextQuestionBtn.classList.contains('d-none') && !nextQuestionBtn.disabled) {
                        e.preventDefault();
                        goToNextQuestion();
                    } else if (!skipQuestionBtn.classList.contains('d-none') && !skipQuestionBtn.disabled) {
                        e.preventDefault();
                        goToNextQuestion();
                    }
                    break;
                case 'Backspace':
                    if (!prevQuestionBtn.disabled) {
                        e.preventDefault();
                        prevQuestionBtn.click();
                    }
                    break;
                case '1':
                case '2':
                case '3':
                case '4':
                case '5':
                case '6':
                case '7':
                case '8':
                case '9':
                    const optionIndex = parseInt(e.key) - 1;
                    const optionButtons = optionsContainer.querySelectorAll('button:not(.d-none)'); 
                    if (optionButtons.length > 0 && optionButtons[0].tagName === 'BUTTON' && !optionButtons[0].textContent.includes('Submit')) {
                        if (optionButtons.length > optionIndex && optionIndex >= 0) {
                            const targetButton = optionButtons[optionIndex];
                            if (targetButton && !targetButton.disabled) {
                                e.preventDefault();
                                targetButton.click();
                            }
                        }
                    }
                    break;
            }
        }
    });

    function initializeApp() {
        isAdmin = new URLSearchParams(window.location.search).get('admin') === 'true';
        if (isAdmin) {
            console.log("Admin mode enabled. Public delete buttons will be visible.");
        }
        
        loadStateFromStorage(); 
        refreshAllLists();
    }

    initializeApp();
});