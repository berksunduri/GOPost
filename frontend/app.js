// API Configuration
const API_BASE = 'http://localhost:';
let API_URL = '';

// State
let state = {
    collections: [],
    currentCollection: null,
    currentRequest: null,
    environments: [],
    currentEnvironment: null,
    headers: {},
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    // Find the port dynamically
    await initializeAPI();

    // Load collections and environments
    await loadCollections();
    await loadEnvironments();

    // Setup event listeners
    setupEventListeners();
});

// Initialize API URL by detecting the port
async function initializeAPI() {
    const currentUrl = window.location.href;
    const match = currentUrl.match(/:(\d+)/);
    if (match) {
        API_URL = API_BASE + match[1];
    } else {
        API_URL = API_BASE + '8080';
    }
}

// Setup event listeners
function setupEventListeners() {
    // Collection buttons
    document.getElementById('newCollectionBtn').addEventListener('click', () => {
        openModal('newCollectionModal');
    });
    document.getElementById('createCollectionBtn').addEventListener('click', createCollection);

    // Environment buttons
    document.getElementById('newEnvironmentBtn').addEventListener('click', () => {
        openModal('newEnvironmentModal');
    });
    document.getElementById('createEnvironmentBtn').addEventListener('click', createEnvironment);

    // Request buttons
    document.getElementById('sendBtn').addEventListener('click', sendRequest);
    document.getElementById('saveRequestBtn').addEventListener('click', () => {
        if (!state.currentCollection) {
            alert('Please select a collection first');
            return;
        }
        openModal('saveRequestModal');
    });
    document.getElementById('confirmSaveRequestBtn').addEventListener('click', saveRequest);

    // Header buttons
    document.getElementById('addHeaderBtn').addEventListener('click', addHeaderRow);

    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', switchTab);
    });

    // Method selector styling
    document.getElementById('methodSelect').addEventListener('change', updateMethodStyle);
    updateMethodStyle();
}

// Tab switching
function switchTab(e) {
    const tabName = e.target.dataset.tab;

    // Remove active class from all tabs and contents
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    // Add active class to clicked tab and corresponding content
    e.target.classList.add('active');
    document.getElementById(`${tabName}-tab`).classList.add('active');
}

// Update method style
function updateMethodStyle() {
    const method = document.getElementById('methodSelect').value;
    const select = document.getElementById('methodSelect');

    select.className = 'request-method';
    if (method === 'POST') select.classList.add('post');
    else if (method === 'PUT') select.classList.add('put');
    else if (method === 'DELETE') select.classList.add('delete');
    else if (method === 'PATCH') select.classList.add('patch');
}

// Add header row
function addHeaderRow() {
    const headersList = document.getElementById('headersList');
    const id = 'header-' + Date.now();

    const row = document.createElement('div');
    row.className = 'pair-row';
    row.id = id;
    row.innerHTML = `
        <input type="text" placeholder="Header key" class="header-key">
        <input type="text" placeholder="Header value" class="header-value">
        <button onclick="removeHeaderRow('${id}')">Remove</button>
    `;

    // Add event listeners to update state
    row.querySelector('.header-key').addEventListener('change', updateHeaders);
    row.querySelector('.header-value').addEventListener('change', updateHeaders);

    headersList.appendChild(row);
}

// Remove header row
function removeHeaderRow(id) {
    document.getElementById(id).remove();
    updateHeaders();
}

// Update headers state
function updateHeaders() {
    const headers = {};
    document.querySelectorAll('.pair-row').forEach(row => {
        const key = row.querySelector('.header-key')?.value;
        const value = row.querySelector('.header-value')?.value;
        if (key && value) {
            headers[key] = value;
        }
    });
    state.headers = headers;
}

// Collections
async function loadCollections() {
    try {
        const response = await fetch(`${API_URL}/api/collections`);
        const collections = await response.json() || [];
        state.collections = collections;
        renderCollections();
    } catch (error) {
        console.error('Error loading collections:', error);
    }
}

function renderCollections() {
    const list = document.getElementById('collectionsList');
    list.innerHTML = '';

    if (state.collections.length === 0) {
        list.innerHTML = '<div style="color: #858585; font-size: 12px; margin: 8px 0;">No collections yet</div>';
        return;
    }

    state.collections.forEach(collection => {
        const item = document.createElement('div');
        item.className = 'collection-item' + (state.currentCollection?.id === collection.id ? ' active' : '');
        item.innerHTML = `<span>${collection.name}</span>`;
        item.addEventListener('click', () => selectCollection(collection));
        list.appendChild(item);
    });
}

async function selectCollection(collection) {
    state.currentCollection = collection;
    renderCollections();

    // Load requests for this collection (not implemented yet)
    // You can extend this to show requests for the selected collection
}

async function createCollection() {
    const name = document.getElementById('collectionNameInput').value;

    if (!name.trim()) {
        alert('Please enter a collection name');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/api/collections/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
        });

        if (response.ok) {
            document.getElementById('collectionNameInput').value = '';
            closeModal('newCollectionModal');
            await loadCollections();
        }
    } catch (error) {
        console.error('Error creating collection:', error);
        alert('Error creating collection');
    }
}

// Environments
async function loadEnvironments() {
    try {
        const response = await fetch(`${API_URL}/api/environments`);
        const environments = await response.json() || [];
        state.environments = environments;
        renderEnvironments();
    } catch (error) {
        console.error('Error loading environments:', error);
    }
}

function renderEnvironments() {
    const list = document.getElementById('environmentsList');
    list.innerHTML = '';

    if (state.environments.length === 0) {
        list.innerHTML = '<div style="color: #858585; font-size: 12px; margin: 8px 0;">No environments yet</div>';
        return;
    }

    state.environments.forEach(env => {
        const item = document.createElement('div');
        item.className = 'collection-item' + (state.currentEnvironment?.id === env.id ? ' active' : '');
        item.innerHTML = `<span>${env.name}</span>`;
        item.addEventListener('click', () => {
            state.currentEnvironment = env;
            renderEnvironments();
        });
        list.appendChild(item);
    });
}

async function createEnvironment() {
    const name = document.getElementById('environmentNameInput').value;

    if (!name.trim()) {
        alert('Please enter an environment name');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/api/environments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, variables: {} }),
        });

        if (response.ok) {
            document.getElementById('environmentNameInput').value = '';
            closeModal('newEnvironmentModal');
            await loadEnvironments();
        }
    } catch (error) {
        console.error('Error creating environment:', error);
        alert('Error creating environment');
    }
}

// Requests
async function sendRequest() {
    const method = document.getElementById('methodSelect').value;
    const url = document.getElementById('urlInput').value;
    const body = document.getElementById('bodyInput').value;

    if (!url.trim()) {
        alert('Please enter a URL');
        return;
    }

    if (!state.currentCollection) {
        alert('Please select a collection first');
        return;
    }

    try {
        // Create or update temporary request
        const tempRequest = {
            name: 'Temporary Request',
            method,
            url,
            headers: state.headers,
            body,
            description: '',
            folder_id: '',
        };

        // Save temporary request to get an ID
        const savedResponse = await fetch(`${API_URL}/api/collections/${state.currentCollection.id}/requests/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(tempRequest),
        });

        if (!savedResponse.ok) {
            if (savedResponse.status === 404) {
                // If endpoint not found, create request directly
                console.log('Using direct execution');
                executeRequestDirectly(method, url, state.headers, body);
                return;
            }
            throw new Error('Failed to save request');
        }

        const request = await savedResponse.json();
        state.currentRequest = request;

        // Execute the request
        const execResponse = await fetch(`${API_URL}/api/requests/${request.id}/execute`, {
            method: 'POST',
        });

        if (execResponse.ok) {
            const result = await execResponse.json();
            displayResponse(result);
        }
    } catch (error) {
        console.error('Error sending request:', error);
        // Fallback: attempt direct execution
        executeRequestDirectly(method, url, state.headers, body);
    }
}

function executeRequestDirectly(method, url, headers, body) {
    // For direct browser execution (CORS limitations may apply)
    const options = {
        method,
        headers: {
            ...headers,
            'Content-Type': 'application/json',
        },
    };

    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        options.body = body;
    }

    const startTime = performance.now();

    fetch(url, options)
        .then(response => {
            const endTime = performance.now();
            const time = Math.round(endTime - startTime);

            return response.text().then(text => {
                const result = {
                    status: `${response.status} ${response.statusText}`,
                    code: response.statusCode,
                    headers: Object.fromEntries(response.headers.entries()),
                    body: text,
                    time,
                };
                displayResponse(result);
            });
        })
        .catch(error => {
            console.error('Error executing request:', error);
            alert('Error: ' + error.message + '\n\nNote: Cross-origin requests may be blocked by CORS policy.');
        });
}

function displayResponse(result) {
    const statusEl = document.getElementById('responseStatus');
    const timeEl = document.getElementById('responseTime');
    const bodyEl = document.getElementById('responseBody');

    statusEl.textContent = result.status || result.code;
    timeEl.textContent = `${result.time}ms`;

    // Determine status color
    const statusCode = parseInt(result.code || String(result.status).split(' ')[0]);
    if (statusCode >= 200 && statusCode < 300) {
        statusEl.className = 'status-success';
    } else if (statusCode >= 400 && statusCode < 600) {
        statusEl.className = 'status-error';
    } else {
        statusEl.className = 'status-info';
    }

    // Format body for display
    let formattedBody = result.body || '';
    try {
        // Try to format as JSON
        const jsonBody = JSON.parse(formattedBody);
        formattedBody = JSON.stringify(jsonBody, null, 2);
    } catch (e) {
        // Not JSON, display as-is
    }

    bodyEl.innerHTML = `<pre>${escapeHtml(formattedBody)}</pre>`;

    // Switch to response tab
    document.querySelector('[data-tab="response"]').click();
}

function saveRequest() {
    const name = document.getElementById('requestNameInput').value;
    const collectionId = document.getElementById('requestCollectionSelect').value;
    const description = document.getElementById('requestDescriptionInput').value;

    if (!name.trim()) {
        alert('Please enter a request name');
        return;
    }

    const method = document.getElementById('methodSelect').value;
    const url = document.getElementById('urlInput').value;
    const body = document.getElementById('bodyInput').value;

    const request = {
        name,
        method,
        url,
        headers: state.headers,
        body,
        description,
        folder_id: '',
    };

    // Send to API
    fetch(`${API_URL}/api/collections/${collectionId}/requests/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
    })
        .then(response => {
            if (response.ok) {
                alert('Request saved successfully');
                document.getElementById('requestNameInput').value = '';
                document.getElementById('requestDescriptionInput').value = '';
                closeModal('saveRequestModal');
            }
        })
        .catch(error => {
            console.error('Error saving request:', error);
            alert('Error saving request');
        });
}

// Modal functions
function openModal(modalId) {
    const allModals = document.querySelectorAll('.modal');
    allModals.forEach(m => m.classList.remove('active'));

    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');

        // If save request modal, populate collections
        if (modalId === 'saveRequestModal') {
            const select = document.getElementById('requestCollectionSelect');
            select.innerHTML = '';
            state.collections.forEach(collection => {
                const option = document.createElement('option');
                option.value = collection.id;
                option.textContent = collection.name;
                select.appendChild(option);
            });

            if (state.currentCollection) {
                select.value = state.currentCollection.id;
            }
        }
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
    }
}

// Close modal when clicking outside
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
    }
});

// Utility function to escape HTML
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}
