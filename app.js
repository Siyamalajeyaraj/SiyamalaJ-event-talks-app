// -------------------------------------------------------------
// BQ Release Radar - Client Application Logic
// -------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    // State management
    let releaseNotes = [];
    let selectedNoteId = null;
    let activeFilter = 'all';
    let searchQuery = '';

    // DOM Elements
    const refreshBtn = document.getElementById('refreshBtn');
    const retryBtn = document.getElementById('retryBtn');
    const refreshIcon = refreshBtn.querySelector('.icon-refresh');
    const searchInput = document.getElementById('searchInput');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    const filterChips = document.querySelectorAll('.filter-chip');
    const feedGrid = document.getElementById('feedGrid');
    const tweetPanel = document.getElementById('tweetPanel');
    const closePanelBtn = document.getElementById('closePanelBtn');
    const tweetTextarea = document.getElementById('tweetTextarea');
    const charRing = document.getElementById('charRing');
    const charCountLabel = document.getElementById('charCountLabel');
    const publishTweetBtn = document.getElementById('publishTweetBtn');
    const syncStatus = document.getElementById('syncStatus');
    const syncStatusText = syncStatus.querySelector('.status-text');
    const syncStatusDot = syncStatus.querySelector('.status-indicator-dot');

    // Link Preview Elements
    const previewTag = document.getElementById('previewTag');
    const previewDate = document.getElementById('previewDate');
    const previewTextSnippet = document.getElementById('previewTextSnippet');
    const previewUrl = document.getElementById('previewUrl');

    // State Display Elements
    const loadingState = document.getElementById('loadingState');
    const errorState = document.getElementById('errorState');
    const emptyState = document.getElementById('emptyState');
    const errorMessageEl = document.getElementById('errorMessage');

    // SVG Ring Constant: 2 * PI * r (r=10)
    const RING_CIRCUMFERENCE = 62.83;

    // Initialize application
    init();

    function init() {
        fetchReleaseNotes();
        setupEventListeners();
        updateCharCounter();
    }

    // Set up UI event handlers
    function setupEventListeners() {
        // Refresh Actions
        refreshBtn.addEventListener('click', () => fetchReleaseNotes(true));
        retryBtn.addEventListener('click', () => fetchReleaseNotes(true));

        // Search Action
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.toLowerCase().trim();
            clearSearchBtn.style.display = searchQuery ? 'block' : 'none';
            applyFiltersAndRender();
        });

        clearSearchBtn.addEventListener('click', () => {
            searchInput.value = '';
            searchQuery = '';
            clearSearchBtn.style.display = 'none';
            searchInput.focus();
            applyFiltersAndRender();
        });

        // Filter Chip Actions
        filterChips.forEach(chip => {
            chip.addEventListener('click', () => {
                filterChips.forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                activeFilter = chip.getAttribute('data-type');
                applyFiltersAndRender();
            });
        });

        // Close Panel Action
        closePanelBtn.addEventListener('click', deselectNote);

        // Character counter update on edit
        tweetTextarea.addEventListener('input', updateCharCounter);

        // Tweet Publish Action
        publishTweetBtn.addEventListener('click', () => {
            const tweetText = tweetTextarea.value;
            const twitterIntentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
            window.open(twitterIntentUrl, '_blank', 'noopener,noreferrer');
        });

        // Close panel if clicked outside on wide layouts
        document.addEventListener('click', (e) => {
            const isClickInsideCard = e.target.closest('.release-card');
            const isClickInsidePanel = e.target.closest('#tweetPanel');
            const isClickInsideControls = e.target.closest('.feed-controls') || e.target.closest('.app-header');
            
            if (!isClickInsideCard && !isClickInsidePanel && !isClickInsideControls && selectedNoteId !== null) {
                deselectNote();
            }
        });
    }

    // Fetch feed data from Flask backend
    async function fetchReleaseNotes(forceRefresh = false) {
        setLoadingState(true);
        refreshIcon.classList.add('spinning');
        refreshBtn.disabled = true;

        try {
            const response = await fetch('/api/release-notes');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const result = await response.json();
            
            if (result.status === 'success') {
                releaseNotes = result.data;
                setLoadingState(false);
                setErrorState(false);
                
                // Update online status
                syncStatusDot.className = 'status-indicator-dot online';
                syncStatusText.textContent = result.is_cached ? 'Synced (Cached)' : 'Live Connected';
                
                applyFiltersAndRender();
            } else {
                throw new Error(result.message || 'Unknown backend parsing error');
            }
        } catch (error) {
            console.error('Fetch error:', error);
            setErrorState(true, error.message);
            setLoadingState(false);
            
            syncStatusDot.className = 'status-indicator-dot offline';
            syncStatusText.textContent = 'Offline Connection';
        } finally {
            refreshIcon.classList.remove('spinning');
            refreshBtn.disabled = false;
        }
    }

    // Filter rules
    function applyFiltersAndRender() {
        let filtered = releaseNotes;

        // Apply search query
        if (searchQuery) {
            filtered = filtered.filter(note => {
                const titleMatch = note.date.toLowerCase().includes(searchQuery);
                const typeMatch = note.type.toLowerCase().includes(searchQuery);
                const descMatch = note.text_content.toLowerCase().includes(searchQuery);
                return titleMatch || typeMatch || descMatch;
            });
        }

        // Apply category chip filter
        if (activeFilter !== 'all') {
            filtered = filtered.filter(note => {
                const noteType = note.type.toLowerCase();
                if (activeFilter === 'other') {
                    return !['feature', 'change', 'deprecation'].includes(noteType);
                }
                return noteType === activeFilter;
            });
        }

        renderGrid(filtered);
    }

    // Draw release note list to DOM
    function renderGrid(notes) {
        feedGrid.innerHTML = '';
        
        if (notes.length === 0) {
            emptyState.style.display = 'flex';
            return;
        }
        
        emptyState.style.display = 'none';

        notes.forEach(note => {
            const isSelected = note.id === selectedNoteId;
            const cardTypeClass = note.type.toLowerCase();
            const safeType = ['feature', 'change', 'deprecation'].includes(cardTypeClass) ? cardTypeClass : 'other';

            const card = document.createElement('article');
            card.className = `release-card ${isSelected ? 'selected' : ''}`;
            card.setAttribute('data-id', note.id);
            card.setAttribute('data-type', safeType);

            card.innerHTML = `
                <div class="card-header">
                    <div class="card-meta">
                        <span class="badge badge-${safeType}">${note.type}</span>
                        <time class="card-date" datetime="${note.updated}">${note.date}</time>
                    </div>
                    <div class="card-actions">
                        <a href="${note.link}" class="card-action-btn" target="_blank" rel="noopener noreferrer" title="View official release notes source" onclick="event.stopPropagation();">
                            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                <polyline points="15 3 21 3 21 9"></polyline>
                                <line x1="10" y1="14" x2="21" y2="3"></line>
                            </svg>
                        </a>
                        <div class="select-indicator" title="Select to Tweet">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                        </div>
                    </div>
                </div>
                <div class="card-body">
                    ${note.description_html}
                </div>
            `;

            // Card click behavior (select/deselect)
            card.addEventListener('click', () => {
                if (selectedNoteId === note.id) {
                    deselectNote();
                } else {
                    selectNote(note);
                }
            });

            feedGrid.appendChild(card);
        });
    }

    // Handle card selection
    function selectNote(note) {
        selectedNoteId = note.id;
        
        // Visual updates on card selection
        document.querySelectorAll('.release-card').forEach(card => {
            if (card.getAttribute('data-id') === note.id) {
                card.classList.add('selected');
            } else {
                card.classList.remove('selected');
            }
        });

        // Compute prefilled Tweet composition inside Twitter limit
        const tweetText = generateDefaultTweet(note);
        tweetTextarea.value = tweetText;
        updateCharCounter();

        // Update Tweet drawer preview card
        const cardTypeClass = note.type.toLowerCase();
        const safeType = ['feature', 'change', 'deprecation'].includes(cardTypeClass) ? cardTypeClass : 'other';
        previewTag.className = `preview-tag badge-${safeType}`;
        previewTag.textContent = note.type;
        previewDate.textContent = note.date;
        previewTextSnippet.textContent = note.text_content;
        
        // Truncate display link nicely
        const cleanUrl = note.link.replace(/^https?:\/\//i, '');
        previewUrl.textContent = cleanUrl.length > 40 ? cleanUrl.substring(0, 37) + '...' : cleanUrl;

        // Slide panel in
        tweetPanel.classList.add('active');
    }

    // Deselect selected card
    function deselectNote() {
        selectedNoteId = null;
        document.querySelectorAll('.release-card').forEach(card => card.classList.remove('selected'));
        tweetPanel.classList.remove('active');
    }

    // Formulate a clean, custom character-checked tweet payload
    function generateDefaultTweet(note) {
        const prefix = `📢 BigQuery Update (${note.date}):\n"`;
        const suffix = `"\n\nDetails: ${note.link} #BigQuery #GoogleCloud`;
        
        const maxSnippetLength = 280 - prefix.length - suffix.length;
        let snippetText = note.text_content || "";
        
        if (snippetText.length > maxSnippetLength) {
            snippetText = snippetText.substring(0, maxSnippetLength - 3) + "...";
        }
        
        return `${prefix}${snippetText}${suffix}`;
    }

    // Manage circle animations and numbers for Twitter's 280 character limit
    function updateCharCounter() {
        const length = tweetTextarea.value.length;
        const remaining = 280 - length;
        
        charCountLabel.textContent = remaining;

        // Adjust SVG ring offset
        const percentage = Math.min(length / 280, 1);
        const offset = RING_CIRCUMFERENCE - (percentage * RING_CIRCUMFERENCE);
        charRing.style.strokeDashoffset = offset;

        // Color transitions depending on remaining allowance
        if (remaining < 0) {
            charRing.style.stroke = '#ef4444'; // Red
            charCountLabel.style.color = '#ef4444';
            publishTweetBtn.disabled = true;
        } else if (remaining <= 20) {
            charRing.style.stroke = '#f59e0b'; // Amber warning
            charCountLabel.style.color = '#f59e0b';
            publishTweetBtn.disabled = false;
        } else {
            charRing.style.stroke = 'var(--primary)';
            charCountLabel.style.color = 'var(--text-secondary)';
            publishTweetBtn.disabled = false;
        }
    }

    // Helper functions for displaying statuses
    function setLoadingState(show) {
        loadingState.style.display = show ? 'flex' : 'none';
        if (show) {
            feedGrid.innerHTML = '';
            errorState.style.display = 'none';
            emptyState.style.display = 'none';
        }
    }

    function setErrorState(show, message = '') {
        errorState.style.display = show ? 'flex' : 'none';
        if (show) {
            feedGrid.innerHTML = '';
            errorMessageEl.textContent = message || 'Unable to fetch feed data. Please try again.';
            loadingState.style.display = 'none';
            emptyState.style.display = 'none';
        }
    }
});
