# Nexora AI — Deploy & Restart Commands

## 1. Quick Deploy & Restart Live Server (One-Liner from Mac)

Run this from your Mac terminal after pushing to `main`:

```bash
ssh proxxy-server "cd ~/nexora-backend && git pull origin main && npm run build && pm2 restart nexora-backend --update-env && pm2 status"
```

---

## 2. Step-by-Step on Live Server (`proxxy-server`)

```bash
# 1. Connect to the live server
ssh proxxy-server

# 2. Go to the backend directory
cd ~/nexora-backend

# 3. Pull latest changes from GitHub
git pull origin main

# 4. (Only if package.json / dependencies changed)
pnpm install

# 5. Build the TypeScript backend
npm run build

# 6. Restart the backend with updated environment variables
pm2 restart nexora-backend --update-env

# 7. Check status & recent logs
pm2 status
pm2 logs nexora-backend --lines 30 --nostream
```

### Restart OpenClaw Gateway (if needed)
```bash
ssh proxxy-server "pm2 restart openclaw-gateway && pm2 status"
```

### Trigger Auto-Deploy Script Manually
```bash
ssh proxxy-server "~/auto-deploy.sh && tail -n 20 ~/auto-deploy.log"
```

---

## 3. Updating Live `.env` Keys

`.env` is gitignored, so whenever you add a new API key locally, also add it on the live server before restarting:

```bash
ssh proxxy-server "nano ~/nexora-backend/.env"
ssh proxxy-server "pm2 restart nexora-backend --update-env"
```

---

## 4. Local Development Restart (Mac)

```bash
# Backend (port 3000)
npm run dev

# Frontend (port 5173)
npm run web:dev

# Full production build check (backend + frontend)
npx tsc --noEmit && npm run build && cd web && npm run build
```
