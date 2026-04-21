# DCP Downloader Quick Deploy (GitHub Pages + GAS API)

## 1) Deploy GAS backend API
1. Open your Apps Script project and paste the latest `code.gs`.
2. Click `Deploy` -> `Manage deployments` -> edit your Web App deployment.
3. Select `New version` and deploy.
4. Copy the **Web App exec URL** (format: `https://script.google.com/macros/s/.../exec`).
5. Test API in browser:
   - `https://script.google.com/macros/s/.../exec?action=ping&callback=testCb`
   - You should see something like: `testCb({"ok":true,...});`

## 2) Set frontend API URL
In `index.html`, set:

```js
const GAS_API_URL_DEFAULT = 'YOUR_EXEC_URL_HERE';
```

Alternative: keep placeholder, then open page with:

```text
?gasApi=https://script.google.com/macros/s/.../exec
```

## 3) Publish to GitHub Pages
1. Create a GitHub repo.
2. Upload `index.html` (and any other assets if needed).
3. In repo settings: `Pages` -> Source: `Deploy from a branch`.
4. Select `main` branch, folder `/ (root)`.
5. Save, wait 1-3 minutes.
6. Open your page URL:
   - `https://<your-user>.github.io/<repo>/`
   - or with query param:
     `https://<your-user>.github.io/<repo>/?gasApi=https://script.google.com/macros/s/.../exec`

## 4) First run checklist
1. Open with Chrome/Edge.
2. Scan folder.
3. Click `Select Folder` and grant local folder permission.
4. Start download.

## Note
- This app requests a Drive OAuth token from your GAS backend for download.
- Keep access controlled (domain/internal use), do not expose to untrusted users.
