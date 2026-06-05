<div align="center">

<img src="https://img.shields.io/badge/QuantShield-AI-00d4ff?style=for-the-badge&logo=shield&logoColor=white" alt="QuantShield AI" />

# QuantShield AI
### Institutional-Grade Monte Carlo Risk Intelligence Platform

[![Next.js](https://img.shields.io/badge/Next.js_16-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Python](https://img.shields.io/badge/Python_3.11-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white)](https://docker.com)
[![Groq](https://img.shields.io/badge/Groq_LLaMA_3.3-FF6B35?style=flat-square)](https://groq.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

**[Live Demo](#) · [Report Bug](https://github.com/kaiffarooqui970/QuantShield/issues) · [Request Feature](https://github.com/kaiffarooqui970/QuantShield/issues)**

</div>

---

## Overview

**QuantShield AI** is a full-stack quantitative finance platform that combines a Monte Carlo GBM simulation engine with a streaming AI advisor powered by LLaMA 3.3 (via Groq). It provides institutional-grade portfolio risk analytics in a premium, futuristic interface — with real-time voice conversation, animated charts, and deep risk metrics.

> Run 20,000 correlated Monte Carlo paths across any portfolio. Ask the AI anything about your risk in real time. Speak to it hands-free.

---

## Features

### Risk Engine
- **Monte Carlo GBM** — 100 to 20,000 correlated Geometric Brownian Motion paths
- **Cholesky Decomposition** — proper cross-asset correlation in simulated paths
- **Full risk suite** — Sharpe, Sortino, VaR 95%/99%, CVaR, Max Drawdown, Expected Return
- **Asset risk contribution** — marginal variance decomposition (sums to 100%)
- **Correlation matrix** — full pairwise return correlations
- **Live price data** — pulls historical OHLCV from Yahoo Finance

### AI Copilot
- **Streaming SSE chat** — LLaMA 3.3 70B responses stream token-by-token via Groq
- **Portfolio-aware context** — AI receives your simulation metrics automatically
- **Multi-turn memory** — server-side session store, 20-turn conversation history
- **Voice conversation mode** — click once to have a continuous hands-free dialogue
- **Wake word** — say *"Hey Shield"* to trigger hands-free from anywhere on the page
- **Browser TTS** — every AI response is spoken aloud using Web Speech API

### Visualisation
- **Futuristic Monte Carlo chart** — animated neon Canvas chart with P5 / Median / P95 paths
- **Confidence band** — gradient fill from bear to bull outcome zone
- **Interactive hover** — crosshair tooltip showing exact portfolio values at any trading day
- **Outcome distribution bar** — visual P5 → Median → P95 range indicator
- **8 metric cards** — animated, colour-coded, with icons

### Premium UI
- Deep black background with ambient cyan/purple glow orbs
- Glassmorphism cards with gradient borders
- Animated "Ask QUANT AI" hero banner
- Quick preset buttons (Mag 7, Tech Giants, Diversified, Growth)
- Fully responsive — desktop and mobile

### Security
- API keys live in `.env` only — never in source, never in browser
- CORS locked to `localhost:3000`
- Per-IP rate limiting (sliding window, in-memory)
- `/docs` and OpenAPI schema endpoints disabled in production
- Secrets scrubbed from all server logs (regex filter)
- Internal HMAC token for non-browser callers

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 16, React, Tailwind CSS, Canvas API, Web Speech API |
| **Backend** | FastAPI, Python 3.11, NumPy, Pandas, SciPy |
| **AI** | Groq · LLaMA 3.3 70B Versatile (streaming SSE) |
| **Simulation** | Custom GBM engine with Cholesky correlated paths |
| **Data** | Yahoo Finance (via yfinance / requests) |
| **Voice** | Web Speech API (STT) · SpeechSynthesis API (TTS) |
| **Infrastructure** | Docker, Docker Compose |

---

## Quick Start

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop) installed and running
- A free [Groq API key](https://console.groq.com) (takes 2 minutes)

### 1. Clone
```bash
git clone https://github.com/kaiffarooqui970/QuantShield.git
cd QuantShield
```

### 2. Configure secrets
Create a `.env` file in the project root:
```env
GROQ_API_KEY=gsk_your_groq_api_key_here
ELEVENLABS_API_KEY=your_elevenlabs_key_here   # optional — for premium voice
ELEVENLABS_VOICE_ID=JBFqnCBsd6RMkjVDRZzb     # optional
INTERNAL_API_SECRET=generate_a_random_64_char_string
```

> Get a free Groq key at [console.groq.com](https://console.groq.com) — 14,400 requests/day free, no credit card needed.

### 3. Run
```bash
docker compose up --build
```

Open **http://localhost:3000** in your browser.

---

## Usage

### Running a Simulation
1. Enter tickers (e.g. `AAPL, MSFT, NVDA`) or click a **Quick Preset**
2. Set trading days, Monte Carlo paths (up to 20,000), and initial capital
3. Click **Run Simulation**
4. The animated chart and all risk metrics appear in seconds

### Using the AI Copilot
- Click the **Ask QUANT AI** banner or the floating **Copilot** button
- Type your question — responses stream in real time
- After a simulation, the AI has full context of your portfolio metrics

### Voice Conversation
- Click **Voice Chat** in the copilot header
- Speak naturally — the AI responds with voice automatically
- It restarts listening after each response for continuous conversation
- Say *"Hey Shield ..."* anywhere to trigger hands-free

---

## Project Structure

```
QuantShield/
├── backend/
│   ├── main.py           # FastAPI app — simulation, SSE chat, TTS endpoints
│   ├── engine.py         # Monte Carlo GBM engine (NumPy/Pandas)
│   ├── test_engine.py    # 17 unit tests (pytest)
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── app/
│   │   └── page.tsx      # Main page — simulator UI, premium layout
│   ├── components/
│   │   ├── CopilotWidget.tsx   # AI chat, voice mode, streaming SSE
│   │   └── MonteCarloChart.tsx # Canvas chart with animation + hover
│   └── Dockerfile
├── docker-compose.yml
├── .env                  # ← create this (not committed)
└── .gitignore
```

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/simulate` | Run Monte Carlo simulation |
| `POST` | `/api/v1/chat` | Streaming SSE multi-turn chat (Groq) |
| `POST` | `/api/advisor` | Single-shot AI advisory |
| `POST` | `/api/tts` | ElevenLabs text-to-speech |
| `GET` | `/health` | Health check |

---

## Running Tests

```bash
docker exec quantshield-backend pytest test_engine.py -v
```

17 unit tests covering the simulation engine, risk metrics, and edge cases.

---

## Deployment

### Cloudflare Tunnel (instant public URL)
```bash
brew install cloudflared
cloudflared tunnel --url http://localhost:3000
```

### Railway (true 24/7 cloud)
1. Push to GitHub
2. Connect repo at [railway.app](https://railway.app)
3. Add environment variables in Railway dashboard
4. Railway auto-deploys from `docker-compose.yml`

---

## Security

| Control | Implementation |
|---|---|
| API key isolation | Keys in `.env` only, never in frontend or source |
| CORS restriction | Only `localhost:3000` (configurable for prod) |
| Rate limiting | Per-IP sliding window — 10 sim/min, 20 AI/min |
| Log scrubbing | Regex filter removes all secrets from server logs |
| Schema hiding | `/docs`, `/redoc`, `/openapi.json` return 404 |
| HMAC auth | `X-QuantShield-Token` header for non-browser callers |

---

## License

MIT © 2026 Kaif Ahmed Farooqui

---

<div align="center">

Built with precision · Powered by LLaMA 3.3 · Secured by design

</div>
