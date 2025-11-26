// DOM elementen
const sitesList = document.getElementById('sitesList');
const addSiteBtn = document.getElementById('addSiteBtn');
const reloadApacheBtn = document.getElementById('reloadApacheBtn');
const testConfigBtn = document.getElementById('testConfigBtn');
const siteModal = document.getElementById('siteModal');
const siteForm = document.getElementById('siteForm');
const modalTitle = document.getElementById('modalTitle');
const closeModal = document.querySelector('.close');
const cancelBtn = document.getElementById('cancelBtn');

let editingDomain = null;

// Initialisatie
document.addEventListener('DOMContentLoaded', () => {
    loadSites();
    setupEventListeners();
});

// Event listeners
function setupEventListeners() {
    addSiteBtn.addEventListener('click', () => openModal());
    reloadApacheBtn.addEventListener('click', reloadApache);
    testConfigBtn.addEventListener('click', testConfig);
    closeModal.addEventListener('click', closeModalHandler);
    cancelBtn.addEventListener('click', closeModalHandler);
    siteForm.addEventListener('submit', handleSubmit);
    
    // Toggle tussen proxy en static file configuratie
    document.getElementById('isProxy').addEventListener('change', (e) => {
        toggleProxyFields(e.target.checked);
    });
    
    window.addEventListener('click', (e) => {
        if (e.target === siteModal) {
            closeModalHandler();
        }
    });
}

// Toggle zichtbaarheid van proxy/static velden
function toggleProxyFields(isProxy) {
    const proxyFields = document.getElementById('proxyFields');
    const staticFields = document.getElementById('staticFields');
    const documentRootInput = document.getElementById('documentRoot');
    const proxyTargetInput = document.getElementById('proxyTarget');
    
    if (isProxy) {
        proxyFields.style.display = 'block';
        staticFields.style.display = 'none';
        documentRootInput.required = false;
        proxyTargetInput.required = true;
    } else {
        proxyFields.style.display = 'none';
        staticFields.style.display = 'block';
        documentRootInput.required = true;
        proxyTargetInput.required = false;
    }
}

// Laad alle sites
async function loadSites() {
    try {
        const response = await fetch('/api/sites');
        const sites = await response.json();

        if (sites.length === 0) {
            sitesList.innerHTML = `
                <div class="empty-state">
                    <h2>Nog geen sites</h2>
                    <p>Klik op "Nieuwe Site" om je eerste virtual host toe te voegen</p>
                </div>
            `;
            return;
        }

        sitesList.innerHTML = sites.map(site => createSiteCard(site)).join('');
        
        // Voeg event listeners toe aan edit en delete buttons
        document.querySelectorAll('.edit-site').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const domain = e.target.dataset.domain;
                editSite(domain);
            });
        });

        document.querySelectorAll('.delete-site').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const domain = e.target.dataset.domain;
                deleteSite(domain);
            });
        });
    } catch (error) {
        showNotification('Fout bij het laden van sites: ' + error.message, 'error');
    }
}

// Maak site card HTML
function createSiteCard(site) {
    const sslBadge = site.enableSSL ? '<span class="ssl-badge">SSL</span>' : '';
    const proxyBadge = site.isProxy ? '<span class="ssl-badge" style="background-color: #2196F3;">PROXY</span>' : '';
    
    let infoHTML = '';
    
    if (site.isProxy) {
        infoHTML = `
            <p><strong>Type:</strong> Backend Proxy</p>
            <p><strong>Target:</strong> <code>${site.proxyTarget}</code></p>
            <p><strong>Port:</strong> ${site.port || 80}</p>
            ${site.serverAlias ? `<p><strong>Alias:</strong> ${site.serverAlias}</p>` : ''}
        `;
    } else {
        infoHTML = `
            <p><strong>Type:</strong> Static Files</p>
            <p><strong>Root:</strong> <code>${site.documentRoot}</code></p>
            <p><strong>Port:</strong> ${site.port || 80}</p>
            ${site.serverAlias ? `<p><strong>Alias:</strong> ${site.serverAlias}</p>` : ''}
        `;
    }
    
    return `
        <div class="site-card">
            <h3>
                ${site.isProxy ? '🔗' : '🌐'} ${site.domain}
                ${sslBadge}
                ${proxyBadge}
            </h3>
            <div class="site-info">
                ${infoHTML}
            </div>
            <div class="site-actions">
                <button class="btn btn-edit edit-site" data-domain="${site.domain}">✏️ Bewerken</button>
                <button class="btn btn-danger delete-site" data-domain="${site.domain}">🗑️ Verwijderen</button>
            </div>
        </div>
    `;
}

// Open modal voor nieuwe site of bewerken
function openModal(site = null) {
    editingDomain = site ? site.domain : null;
    modalTitle.textContent = site ? 'Site Bewerken' : 'Nieuwe Site';
    
    if (site) {
        document.getElementById('domain').value = site.domain;
        document.getElementById('documentRoot').value = site.documentRoot || '';
        document.getElementById('port').value = site.port || 80;
        document.getElementById('serverAlias').value = site.serverAlias || '';
        document.getElementById('enableSSL').checked = site.enableSSL || false;
        document.getElementById('isProxy').checked = site.isProxy || false;
        document.getElementById('proxyTarget').value = site.proxyTarget || '';
        
        // Toggle velden zichtbaarheid
        toggleProxyFields(site.isProxy);
    } else {
        siteForm.reset();
        toggleProxyFields(false);
    }
    
    siteModal.style.display = 'block';
}

// Sluit modal
function closeModalHandler() {
    siteModal.style.display = 'none';
    siteForm.reset();
    editingDomain = null;
}

// Handle form submit
async function handleSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(siteForm);
    const isProxy = document.getElementById('isProxy').checked;
    
    const site = {
        domain: formData.get('domain'),
        port: parseInt(formData.get('port')) || 80,
        serverAlias: formData.get('serverAlias') || '',
        enableSSL: document.getElementById('enableSSL').checked,
        isProxy: isProxy
    };
    
    if (isProxy) {
        site.proxyTarget = formData.get('proxyTarget');
        site.documentRoot = ''; // Niet nodig voor proxy
    } else {
        site.documentRoot = formData.get('documentRoot');
        site.proxyTarget = ''; // Niet nodig voor static
    }

    try {
        let response;
        
        if (editingDomain) {
            // Update bestaande site
            response = await fetch(`/api/sites/${editingDomain}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(site)
            });
        } else {
            // Nieuwe site
            response = await fetch('/api/sites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(site)
            });
        }

        const result = await response.json();
        
        if (result.success) {
            showNotification(result.message, result.warning ? 'warning' : 'success');
            closeModalHandler();
            loadSites();
        } else {
            showNotification('Fout: ' + result.error, 'error');
        }
    } catch (error) {
        showNotification('Fout bij opslaan: ' + error.message, 'error');
    }
}

// Bewerk site
async function editSite(domain) {
    try {
        const response = await fetch(`/api/sites/${domain}`);
        const site = await response.json();
        openModal(site);
    } catch (error) {
        showNotification('Fout bij het laden van site: ' + error.message, 'error');
    }
}

// Verwijder site
async function deleteSite(domain) {
    if (!confirm(`Weet je zeker dat je ${domain} wilt verwijderen?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/sites/${domain}`, {
            method: 'DELETE'
        });

        const result = await response.json();
        
        if (result.success) {
            showNotification(result.message, result.warning ? 'warning' : 'success');
            loadSites();
        } else {
            showNotification('Fout: ' + result.error, 'error');
        }
    } catch (error) {
        showNotification('Fout bij verwijderen: ' + error.message, 'error');
    }
}

// Reload Apache
async function reloadApache() {
    try {
        const response = await fetch('/api/apache/reload', {
            method: 'POST'
        });

        const result = await response.json();
        
        if (result.success) {
            showNotification(result.message, 'success');
        } else {
            showNotification('Fout: ' + result.error, 'error');
        }
    } catch (error) {
        showNotification('Fout bij reloaden: ' + error.message, 'error');
    }
}

// Test Apache configuratie
async function testConfig() {
    try {
        const response = await fetch('/api/apache/test');
        const result = await response.json();
        
        if (result.success) {
            showNotification('Configuratie OK: ' + result.output, 'success');
        } else {
            showNotification('Configuratie fout: ' + result.error, 'error');
        }
    } catch (error) {
        showNotification('Fout bij testen: ' + error.message, 'error');
    }
}

// Toon notificatie
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideInRight 0.3s ease reverse';
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}
