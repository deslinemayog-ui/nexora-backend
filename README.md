# Nexora AI – Multi-Tenant WhatsApp AI Workforce Platform

Nexora AI is a modular, multi-tenant WhatsApp AI workforce platform built with **Node.js**, **TypeScript (strict mode)**, **@whiskeysockets/baileys**, **OpenClaw Gateway**, **Fastify**, **PostgreSQL + Prisma**, **BullMQ + Redis**, **S3 / AES-256-GCM Encrypted Document Storage**, **Zod**, and **Pino**.

Instead of acting as a simple single-turn chatbot, Nexora AI coordinates specialised AI agents through **OpenClaw** to plan, execute, track, and complete multi-step real-world projects over WhatsApp while enforcing strict tenant isolation and human-in-the-loop approvals.

---

## 1. Architecture Overview

```text
WhatsApp Customer
       │
       ▼
Baileys WhatsApp Gateway (src/channels/whatsapp)
  • QR Auth, Credential Persistence, Auto-Reconnect, Rate Limiting, Media Download, Deduplication
       │
       ▼
Customer Identity & Conversation Layer (src/core/customer, src/core/conversation)
  • Multi-Tenant Isolation, Consent & Profile Management, Context Assembly
       │
       ▼
Intent Detection & Central Orchestrator (src/core/orchestrator)
  • Intent Classification, Project Creation vs. Continuation, Approval Interception
       │
       ▼
OpenClaw Execution Engine (src/openclaw)
  • WebSocket Control-Plane RPC (`connect.challenge` -> `connect`, `agent`, `agent.wait`)
  • HTTP Gateway Fallback (`POST /v1/chat/completions`, `POST /tools/invoke`)
  • Tenant-Scoped Session Keys (`agent:<agentId>:tenant_<customerId>_<scopeType>_<scopeId>`)
       │
       ├──────────────┬──────────────┬──────────────┬──────────────┬──────────────┐
       ▼              ▼              ▼              ▼              ▼              ▼
   Job Agent     Visa Agent   Investor Agent  Business Agent Education Agent Research Agent
       │              │              │              │              │              │
       └──────────────┴──────────────┴──────────────┴──────────────┴──────────────┘
                                            │
                                            ▼
             Persistent Projects, Tasks, Approvals & Encrypted Documents
                                            │
                                            ▼
                                  WhatsApp Response
```

---

## 2. Specialist Agents (`src/agents/`)

1. **Job Search & Application Agent (`JOB_AGENT`)**: Analyses CVs, extracts qualifications/skills, evaluates job opportunities, detects recruitment scams (`assessVacancyScamRisk`), drafts tailored CVs/cover letters, and requests explicit customer approval before submitting applications. Never invents qualifications.
2. **Immigration & Visa Agent (`VISA_AGENT`)**: Researches official visa pathways, immigration requirements, government portals, and document checklists. Never guarantees visa approval or fabricates legal requirements.
3. **Investor Discovery Agent (`INVESTOR_AGENT`)**: Researches VCs, angel networks, and accelerators; matches investment criteria; prepares investor profiles and drafts outreach emails. Never contacts investors without explicit customer approval.
4. **Business Development Agent (`BUSINESS_AGENT`)**: Conducts market research, competitor analysis, business registration guidance, and cross-border expansion planning.
5. **Education & Scholarship Agent (`EDUCATION_AGENT`)**: Searches international universities and scholarships, compares study programmes, and drafts motivation letters.
6. **General Research & Personal Assistant (`RESEARCH_AGENT`)**: Handles general research, comparisons, reports, and personal project coordination.

---

## 3. Prerequisites & Connecting OpenClaw (`OpenClaw 2026.11+`)

1. **Node.js**: `>= 20.0.0` (verified on `v26.13.1`)
2. **Package Manager**: `pnpm` (`npx pnpm` or `pnpm`)
3. **PostgreSQL 16+** & **Redis 7+** (via Docker Compose or local services)
4. **OpenClaw Gateway**:
   - Inspect your installed OpenClaw version:
     ```bash
     openclaw --version
     # Example: OpenClaw 2026.11.3 (847611d)
     ```
   - Start the OpenClaw Gateway on its default loopback port (`18789`) with token authentication:
     ```bash
     export OPENCLAW_GATEWAY_TOKEN="your-secure-openclaw-gateway-token"
     openclaw gateway run --port 18789 --bind loopback --auth token --token "$OPENCLAW_GATEWAY_TOKEN"
     ```
   - Verify OpenClaw Gateway health:
     ```bash
     openclaw gateway status
     openclaw gateway call health
     ```
   - Set `OPENCLAW_GATEWAY_WS_URL=ws://127.0.0.1:18789`, `OPENCLAW_GATEWAY_HTTP_URL=http://127.0.0.1:18789`, and `OPENCLAW_GATEWAY_TOKEN` in your `.env` file.

---

## 4. Installation & Local Development

1. **Copy `.env.example` to `.env` and configure variables**:
   ```bash
   cp .env.example .env
   ```

2. **Install dependencies**:
   ```bash
   pnpm install
   ```

3. **Generate Prisma client and apply PostgreSQL migrations**:
   ```bash
   pnpm prisma:generate
   pnpm prisma:migrate
   ```

4. **Build and start Nexora AI**:
   ```bash
   pnpm build
   pnpm start
   # Or in development watch mode:
   pnpm dev
   ```

5. **Scan the WhatsApp QR Code**:
   - On first start, Baileys prints a QR code in your terminal (`WHATSAPP_PRINT_QR=true`).
   - Open WhatsApp on your dedicated **Nexora AI WhatsApp Business** device -> **Linked Devices** -> **Link a Device** and scan the QR code.
   - Credentials are persisted securely under `WHATSAPP_AUTH_DIR` (`./storage/whatsapp-auth` with `0700` permissions) for automatic reconnection across restarts.

---

## 5. Docker & PM2 Deployment

### Docker Compose (Nexora API + PostgreSQL + Redis)
```bash
cp .env.example .env
docker compose up -d --build
```
- Interactive OpenAPI / Swagger documentation is available at `http://localhost:3000/docs`.
- Health check endpoint: `GET http://localhost:3000/api/v1/health`.

### PM2 Process Management
```bash
pnpm build
pm2 start docker/ecosystem.config.cjs
```

---

## 6. Running Tests

The automated test suite includes mocked Baileys WhatsApp and OpenClaw Gateway harnesses and does not require a live WhatsApp account or live OpenClaw connection:

```bash
pnpm test
pnpm typecheck
```
# nexora-backend
