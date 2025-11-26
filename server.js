const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);
const app = express();
const PORT = 3000;

// Configuratie
const CONFIG_DIR = path.join(__dirname, 'sites');
const APACHE_SITES_DIR = '/etc/apache2/sites-available';
const APACHE_ENABLED_DIR = '/etc/apache2/sites-enabled';

// Middleware
app.use(bodyParser.json());
app.use(express.static('public'));

// Zorg dat de config directory bestaat
async function ensureConfigDir() {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating config directory:', error);
  }
}

// Genereer Apache virtual host configuratie
function generateVhostConfig(site) {
  const { 
    domain, 
    documentRoot, 
    port = 80, 
    serverAlias = '', 
    enableSSL = false,
    isProxy = false,
    proxyTarget = '',
    proxyPort = 5000
  } = site;
  
  let config = `<VirtualHost *:${port}>
    ServerName ${domain}`;

  if (serverAlias) {
    config += `\n    ServerAlias ${serverAlias}`;
  }

  // Proxy configuratie voor backend servers (Flask, Node.js, etc.)
  if (isProxy && proxyTarget) {
    config += `
    
    # Proxy naar backend server
    ProxyPreserveHost On
    ProxyPass / ${proxyTarget}
    ProxyPassReverse / ${proxyTarget}
    
    # Voor WebSocket support (optioneel)
    RewriteEngine On
    RewriteCond %{HTTP:Upgrade} websocket [NC]
    RewriteCond %{HTTP:Connection} upgrade [NC]
    RewriteRule ^/?(.*) "ws://${proxyTarget.replace('http://', '')}/$1" [P,L]`;
  } else {
    // Normale static file configuratie
    config += `
    DocumentRoot ${documentRoot}
    
    <Directory ${documentRoot}>
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>`;
  }

  config += `

    ErrorLog \${APACHE_LOG_DIR}/${domain}-error.log
    CustomLog \${APACHE_LOG_DIR}/${domain}-access.log combined
</VirtualHost>`;

  if (enableSSL) {
    config += `\n
<VirtualHost *:443>
    ServerName ${domain}`;
    
    if (serverAlias) {
      config += `\n    ServerAlias ${serverAlias}`;
    }
    
    config += `
    
    SSLEngine on
    SSLCertificateFile /etc/ssl/certs/${domain}.crt
    SSLCertificateKeyFile /etc/ssl/private/${domain}.key`;
    
    // Proxy configuratie voor SSL
    if (isProxy && proxyTarget) {
      config += `
    
    # Proxy naar backend server
    ProxyPreserveHost On
    ProxyPass / ${proxyTarget}
    ProxyPassReverse / ${proxyTarget}
    
    # Voor WebSocket support (optioneel)
    RewriteEngine On
    RewriteCond %{HTTP:Upgrade} websocket [NC]
    RewriteCond %{HTTP:Connection} upgrade [NC]
    RewriteRule ^/?(.*) "wss://${proxyTarget.replace('https://', '').replace('http://', '')}/$1" [P,L]`;
    } else {
      config += `
    DocumentRoot ${documentRoot}
    
    <Directory ${documentRoot}>
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>`;
    }

    config += `

    ErrorLog \${APACHE_LOG_DIR}/${domain}-ssl-error.log
    CustomLog \${APACHE_LOG_DIR}/${domain}-ssl-access.log combined
</VirtualHost>`;
  }

  return config;
}

// API Endpoints

// Haal alle sites op
app.get('/api/sites', async (req, res) => {
  try {
    const files = await fs.readdir(CONFIG_DIR);
    const sites = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const data = await fs.readFile(path.join(CONFIG_DIR, file), 'utf8');
        sites.push(JSON.parse(data));
      }
    }

    res.json(sites);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Haal een specifieke site op
app.get('/api/sites/:domain', async (req, res) => {
  try {
    const filename = `${req.params.domain}.json`;
    const data = await fs.readFile(path.join(CONFIG_DIR, filename), 'utf8');
    res.json(JSON.parse(data));
  } catch (error) {
    res.status(404).json({ error: 'Site niet gevonden' });
  }
});

// Maak een nieuwe site aan
app.post('/api/sites', async (req, res) => {
  try {
    const site = req.body;
    
    // Validatie
    if (!site.domain) {
      return res.status(400).json({ error: 'Domain is verplicht' });
    }
    
    if (!site.isProxy && !site.documentRoot) {
      return res.status(400).json({ error: 'DocumentRoot is verplicht voor non-proxy sites' });
    }
    
    if (site.isProxy && !site.proxyTarget) {
      return res.status(400).json({ error: 'Proxy target is verplicht voor proxy sites' });
    }

    // Sla configuratie op
    const filename = `${site.domain}.json`;
    await fs.writeFile(
      path.join(CONFIG_DIR, filename),
      JSON.stringify(site, null, 2)
    );

    // Genereer Apache configuratie
    const vhostConfig = generateVhostConfig(site);
    const confFilename = `${site.domain}.conf`;
    
    try {
      // Schrijf naar Apache sites-available (vereist sudo)
      await fs.writeFile(
        path.join(APACHE_SITES_DIR, confFilename),
        vhostConfig
      );

      // Enable de site
      await execPromise(`sudo a2ensite ${confFilename}`);
      
      // Reload Apache
      await execPromise('sudo systemctl reload apache2');

      res.json({ 
        success: true, 
        message: 'Site succesvol aangemaakt en Apache gereload',
        site 
      });
    } catch (apacheError) {
      // Als Apache commando's falen, sla in ieder geval de configuratie op
      res.json({ 
        success: true, 
        message: 'Site configuratie opgeslagen. Apache update vereist handmatige actie.',
        warning: apacheError.message,
        site 
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update een site
app.put('/api/sites/:domain', async (req, res) => {
  try {
    const oldDomain = req.params.domain;
    const site = req.body;

    // Verwijder oude configuratie
    const oldFilename = `${oldDomain}.json`;
    await fs.unlink(path.join(CONFIG_DIR, oldFilename));

    // Sla nieuwe configuratie op
    const newFilename = `${site.domain}.json`;
    await fs.writeFile(
      path.join(CONFIG_DIR, newFilename),
      JSON.stringify(site, null, 2)
    );

    // Update Apache configuratie
    const vhostConfig = generateVhostConfig(site);
    const oldConfFilename = `${oldDomain}.conf`;
    const newConfFilename = `${site.domain}.conf`;

    try {
      // Disable oude site als domain veranderd is
      if (oldDomain !== site.domain) {
        await execPromise(`sudo a2dissite ${oldConfFilename}`);
        await fs.unlink(path.join(APACHE_SITES_DIR, oldConfFilename));
      }

      // Schrijf nieuwe configuratie
      await fs.writeFile(
        path.join(APACHE_SITES_DIR, newConfFilename),
        vhostConfig
      );

      // Enable de site
      await execPromise(`sudo a2ensite ${newConfFilename}`);
      
      // Reload Apache
      await execPromise('sudo systemctl reload apache2');

      res.json({ 
        success: true, 
        message: 'Site succesvol bijgewerkt',
        site 
      });
    } catch (apacheError) {
      res.json({ 
        success: true, 
        message: 'Site configuratie bijgewerkt. Apache update vereist handmatige actie.',
        warning: apacheError.message,
        site 
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Verwijder een site
app.delete('/api/sites/:domain', async (req, res) => {
  try {
    const domain = req.params.domain;
    const filename = `${domain}.json`;
    const confFilename = `${domain}.conf`;

    // Verwijder configuratie
    await fs.unlink(path.join(CONFIG_DIR, filename));

    try {
      // Disable de site
      await execPromise(`sudo a2dissite ${confFilename}`);
      
      // Verwijder Apache configuratie
      await fs.unlink(path.join(APACHE_SITES_DIR, confFilename));
      
      // Reload Apache
      await execPromise('sudo systemctl reload apache2');

      res.json({ 
        success: true, 
        message: 'Site succesvol verwijderd' 
      });
    } catch (apacheError) {
      res.json({ 
        success: true, 
        message: 'Site configuratie verwijderd. Apache update vereist handmatige actie.',
        warning: apacheError.message
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test Apache configuratie
app.get('/api/apache/test', async (req, res) => {
  try {
    const { stdout, stderr } = await execPromise('sudo apachectl configtest');
    res.json({ 
      success: true, 
      output: stdout || stderr 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Reload Apache
app.post('/api/apache/reload', async (req, res) => {
  try {
    await execPromise('sudo systemctl reload apache2');
    res.json({ 
      success: true, 
      message: 'Apache successvol gereload' 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Start server
ensureConfigDir().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Apache VHost Manager draait op http://localhost:${PORT}`);
  });
});
