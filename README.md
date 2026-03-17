# WhatsApp Auto-Reply Bot

A small Node.js + Express bot that connects to WhatsApp Web and sends **automatic short replies** based on your current status (modes like `GYM`, `WORK`, `AWAY`, `SLEEP`, `CUSTOM`).  
The bot exposes a simple HTTP API you can use (or a dashboard in `wa-dashboard`) to manage allowed contacts and modes.

---

## Prerequisites

- **Node.js** 18+ (recommended)
- **npm** (comes with Node)
- A phone with **WhatsApp** installed and logged in
- A **Google Gemini API key** (used for generating smart replies)

---

## 1. Clone and install

```bash
git clone <your-repo-url> whatsapp_bot
cd whatsapp_bot
npm install
```

---

## 2. Environment variables

Create a `.env` file in the project root (same folder as `index.js`):

```bash
touch .env
```

Add at least:

```bash
GEMINI_API_KEY=your_gemini_api_key_here
# Optional: change port if you don't want 3000
PORT=3000
```

- `GEMINI_API_KEY` is required by `ai.js` to call the Gemini model.
- `PORT` defaults to `3000` if not set.

**Do not commit `.env`** – it is already ignored via `.gitignore`.

---

## 3. First-time database setup

The bot uses a local **SQLite** database file called `bot.db` (created in the project root).

You don’t need to do anything manually:

- On first start, `db.js` will create the `bot.db` file.
- It will also create required tables (`allowed_users`, `config`) and insert defaults like:
  - `mode = OFF`
  - `custom_activity = ""`

The `bot.db` file is **local-only** and is also ignored by Git.

---

## 4. Run the bot locally

```bash
npm start
```

You should see logs similar to:

- `Database initialized`
- `API server running on http://localhost:3000`
- `Starting WhatsApp client...`
- A QR code printed in the terminal

Scan the QR code with WhatsApp on your phone:

1. Open WhatsApp on your phone.
2. Go to **Linked devices**.
3. Tap **Link a device**, then point the camera to the QR code in your terminal.

Once linked, the client will log `Bot Ready` and auto-replies will start working for allowed users.

---

## 5. HTTP API overview

The Express server exposes the following endpoints (all accept/return JSON):

- **POST `/add-user`**
  - Body: `{ "phone": "919876543210", "description": "Close friend" }`
  - Adds (or reactivates) a contact to the allow-list.

- **POST `/remove-user`**
  - Body: `{ "phone": "919876543210" }`
  - Deactivates a contact.

- **POST `/set-mode`**
  - Body: `{ "mode": "WORK" }`
  - Valid modes: `OFF`, `AWAY`, `GYM`, `WORK`, `SLEEP`, `CUSTOM`.

- **PUT `/set-custom-activity`**
  - Body: `{ "activity": "Gym ja raha hoon" }`
  - Only used when `mode` is `CUSTOM`.

- **PUT `/update-user-description`**
  - Body: `{ "phone": "919876543210", "description": "College friend" }`

- **PUT `/update-prompt`**
  - Body: `{ "base_prompt": "Optional extra instructions for the AI" }`

- **GET `/status`**
  - Returns current mode, custom activity, and allowed users.

---

## 6. Frontend dashboard (optional)

`index.js` is configured to serve a built dashboard from `../wa-dashboard/dist`:

- Static files: from `../wa-dashboard/dist`
- SPA fallback: `../wa-dashboard/dist/index.html`

If you have the `wa-dashboard` app:

1. Build it (e.g. `npm run build` in that project).
2. Ensure the build output directory is `dist` and lives at `../wa-dashboard/dist` relative to this backend.

If you don’t have or don’t use the dashboard, the API still works fine without it.

---

## 7. Production tips

- Use a process manager like **pm2** (already in `dependencies`) to keep the bot running:

  ```bash
  npx pm2 start index.js --name whatsapp-bot
  ```

- Keep the `.wwebjs_auth` folder persistent on the server so you don’t need to rescan the QR code after every restart. (It is intentionally **not** tracked by Git.)

---

## 8. What is ignored by Git?

See `.gitignore` for details. Important entries:

- `node_modules/`
- `.env`
- `bot.db`
- `.wwebjs_auth/`
- `.wwebjs_cache/`

This keeps your repo clean and free from secrets and machine-specific data.

