# Apache VHost Manager 🌐

Een moderne web-interface voor het beheren van Apache virtual hosts op macOS.

## Features

✨ **Gebruiksvriendelijke interface** - Beheer je virtual hosts via een mooie web UI  
📝 **Auto-configuratie** - Genereert automatisch Apache vhost configuraties  
🔒 **SSL support** - Eenvoudig HTTPS configureren  
🔄 **Live reloading** - Apache wordt automatisch gereload na wijzigingen  
✅ **Config testing** - Test je Apache configuratie voordat je reloadt  
🔗 **Proxy support** - Host backend servers (Flask, Node.js, Express, etc.) via reverse proxy  
🌐 **Static files** - Traditionele websites met HTML/CSS/JS  

## Installatie

1. **Installeer dependencies:**
   ```bash
   npm install
   ```

2. **Zorg dat Apache draait:**
   ```bash
   brew services start httpd
   ```

3. **Geef sudo rechten voor Apache beheer:**
   
   De applicatie heeft sudo rechten nodig om Apache te beheren. Voeg het volgende toe aan `/etc/sudoers` (gebruik `sudo visudo`):
   
   ```
   # Vervang 'yourusername' met je daadwerkelijke gebruikersnaam
   yourusername ALL=(ALL) NOPASSWD: /usr/sbin/apachectl
   yourusername ALL=(ALL) NOPASSWD: /usr/local/bin/apachectl
   yourusername ALL=(ALL) NOPASSWD: /bin/launchctl
   ```

## Gebruik

1. **Start de applicatie:**
   ```bash
   npm start
   ```

2. **Open in browser:**
   ```
   http://localhost:3000
   ```

### Desktop App (zonder terminal)

Je kunt Serverbeheer als een gewone app openen via Electron:

1. Installeer dependencies voor de app:
   ```bash
   npm install
   ```

2. Start de desktop app:
   ```bash
   npm run app
   ```

Dit opent een eigen venster met de interface en start de server automatisch op de achtergrond.

3. **Voeg een nieuwe site toe:**
   
   **Voor static websites (HTML/CSS/JS):**
   - Klik op "➕ Nieuwe Site"
   - Vul de gegevens in:
     - **Domain**: bijv. `mysite.local`
     - **Document Root**: bijv. `/Users/username/Sites/mysite`
     - **Port**: standaard 80
     - **Server Alias**: optioneel, bijv. `www.mysite.local`
     - **SSL**: vink aan voor HTTPS (port 443)
   - Klik op "Opslaan"
   
   **Voor backend servers (Flask, Node.js, etc.):**
   - Klik op "➕ Nieuwe Site"
   - Vink "Backend/Proxy Server" aan
   - Vul de gegevens in:
     - **Domain**: bijv. `api.mysite.local` of `secretairy.local`
     - **Backend URL**: bijv. `http://localhost:5000` (Flask), `http://localhost:3001` (Node.js)
     - **Port**: standaard 80 (Apache luistert hierop, proxied naar backend)
     - **Server Alias**: optioneel
     - **SSL**: vink aan voor HTTPS
   - Klik op "Opslaan"

4. **Update je hosts file:**
   
   Voeg je domains toe aan `/etc/hosts`:
   ```bash
   sudo nano /etc/hosts
   ```
   
   Voeg toe:
   ```
   127.0.0.1 mysite.local
   127.0.0.1 www.mysite.local
   ```

## Apache Configuratie Locaties

### macOS (Homebrew Apache)
- **Sites available**: `/usr/local/etc/httpd/sites-available/`
- **Sites enabled**: `/usr/local/etc/httpd/sites-enabled/`
- **Config**: `/usr/local/etc/httpd/httpd.conf`

### macOS (Native Apache)
- **Sites available**: `/etc/apache2/sites-available/`
- **Sites enabled**: `/etc/apache2/sites-enabled/`
- **Config**: `/etc/apache2/httpd.conf`

**Let op:** Pas eventueel de paths in `server.js` aan naar jouw Apache locaties.

## Apache Setup voor Virtual Hosts

Zorg dat deze instellingen in je `httpd.conf` staan:

```apache
# Uncomment deze regels:
LoadModule vhost_alias_module lib/httpd/modules/mod_vhost_alias.so
LoadModule proxy_module lib/httpd/modules/mod_proxy.so
LoadModule proxy_http_module lib/httpd/modules/mod_proxy_http.so
LoadModule proxy_wstunnel_module lib/httpd/modules/mod_proxy_wstunnel.so
LoadModule rewrite_module lib/httpd/modules/mod_rewrite.so

# Voeg onderaan toe:
Include /usr/local/etc/httpd/sites-enabled/*.conf
```

**Belangrijk voor proxy support:** De proxy modules zijn essentieel voor het doorsturen van requests naar je backend servers.

## Development Mode

Voor development met auto-reload:

```bash
npm run dev
```

## Voorbeelden

### Flask Backend (bijv. je Secretairy Whisper transcriptie)

1. **Start je Flask server:**
   ```bash
   cd /path/to/secretairy
   python app.py  # draait op http://localhost:5000
   ```

2. **Voeg proxy toe in VHost Manager:**
   - Domain: `secretairy.local`
   - Backend/Proxy Server: ✓
   - Backend URL: `http://localhost:5000`
   - Port: 80

3. **Update `/etc/hosts`:**
   ```
   127.0.0.1 secretairy.local
   ```

4. **Bezoek:** `http://secretairy.local` → proxied naar Flask op port 5000

### Node.js/Express Backend

1. **Start je Node server:**
   ```bash
   node server.js  # draait op http://localhost:3001
   ```

2. **Voeg proxy toe:**
   - Domain: `api.mysite.local`
   - Backend/Proxy Server: ✓
   - Backend URL: `http://localhost:3001`

### Static Website

1. **Maak je website directory:**
   ```bash
   mkdir -p /Users/username/Sites/mysite
   echo "<h1>Hello World</h1>" > /Users/username/Sites/mysite/index.html
   ```

2. **Voeg site toe:**
   - Domain: `mysite.local`
   - Document Root: `/Users/username/Sites/mysite`
   - Backend/Proxy Server: ✗ (uitgevinkt)

## API Endpoints

- `GET /api/sites` - Alle sites ophalen
- `GET /api/sites/:domain` - Specifieke site ophalen
- `POST /api/sites` - Nieuwe site aanmaken
- `PUT /api/sites/:domain` - Site bijwerken
- `DELETE /api/sites/:domain` - Site verwijderen
- `GET /api/apache/test` - Test Apache configuratie
- `POST /api/apache/reload` - Reload Apache

## Troubleshooting

**Apache commando's falen:**
- Controleer of sudo rechten correct zijn ingesteld
- Controleer of Apache paths kloppen in `server.js`

**Sites werken niet:**
- Controleer `/etc/hosts` file
- Test Apache configuratie: `sudo apachectl configtest`
- Check Apache logs: `tail -f /usr/local/var/log/httpd/error_log`

**Port 80 in gebruik:**
- Verander de port in de site configuratie
- Of stop andere services op port 80

## Structuur

```
server/
├── package.json          # Dependencies
├── server.js            # Express backend
├── sites/               # Site configuraties (JSON)
└── public/
    ├── index.html       # Frontend HTML
    ├── style.css        # Styling
    └── app.js           # Frontend JavaScript
```

## Licentie

MIT
