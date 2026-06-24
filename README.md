# AlgDevs-AI: Agent Evolution Platform

AlgDevs-AI is a production-ready, full-stack autonomous agent platform designed to evolve into a Manus-style system. Built with a "free-tier first" philosophy, it enables solo developers to deploy and run sophisticated AI agents using minimal resources and zero-cost infrastructure.

## 🚀 Vision

To provide a powerful, autonomous AI workspace that remains accessible to everyone. AlgDevs-AI bridges the gap between simple chat interfaces and fully autonomous agentic systems like Manus or OpenHands, optimized for resource-constrained environments (Android/Termux, free-tier cloud hosting).

## ✨ Key Features

- **Autonomous Agent Fleet**: Specialized agents including Supervisor, Planner, Researcher, Coder, and Reviewer.
- **PWA Support**: Fully mobile-optimized UI/UX with Progressive Web App capabilities for a native-like experience on Android and iOS.
- **Task Queue System**: Robust PostgreSQL-based task management using `SKIP LOCKED` for concurrent-safe, autonomous execution.
- **Multi-Provider AI**: Native support for Groq, Gemini, and OpenRouter with advanced fallback logic to ensure high availability on free tiers.
- **Isolated Sandbox**: Secure code execution using E2B's sandboxed environments.
- **Modular Architecture**: A clean, typed monorepo structure using pnpm workspaces and TypeScript.

## 🛠 Tech Stack

| Component | Technology |
| :--- | :--- |
| **Monorepo** | pnpm Workspaces |
| **Backend** | Node.js 24, Express 5 |
| **Frontend** | React, Vite, TypeScript, TailwindCSS, shadcn/ui |
| **Database** | PostgreSQL + Drizzle ORM |
| **AI Integration** | Groq (Primary), Gemini, OpenRouter |
| **Task Queue** | Custom PG-based (SKIP LOCKED) |
| **Sandbox** | E2B REST API |
| **Deployment** | Railway (Primary), Docker |

## 📂 Project Structure

```text
Agent-Evolution-Platform/
├── artifacts/
│   ├── algdevs-ai/      # React Frontend (Vite)
│   ├── api-server/      # Express Backend
│   └── mockup-sandbox/  # Preview components
├── lib/
│   ├── api-spec/        # OpenAPI Specification
│   ├── api-zod/         # Generated Zod schemas
│   ├── db/              # Drizzle Schema & Migrations
│   └── api-client-react/# Generated React Query hooks
├── scripts/             # Utility & Build scripts
├── Dockerfile           # Multi-stage production build
├── railway.json         # Railway deployment config
└── pnpm-workspace.yaml  # Workspace definition
```

## 🚀 Getting Started

### Prerequisites

- Node.js 24+
- pnpm 11+
- PostgreSQL database
- API Keys: `GROQ_API_KEY`, `GEMINI_API_KEY` (optional), `E2B_API_KEY` (optional)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/marwangpt237/Agent-Evolution-Platform.git
   cd Agent-Evolution-Platform
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Setup environment variables:
   Create a `.env` file in `artifacts/api-server/` with:
   ```env
   DATABASE_URL=your_postgres_url
   GROQ_API_KEY=your_key
   GEMINI_API_KEY=your_key
   ```

### Development

Run the API server and Frontend in development mode:

```bash
# Run API Server
pnpm --filter @workspace/api-server run dev

# Run Frontend
pnpm --filter @workspace/algdevs-ai run dev
```

## 🚢 Deployment

### Railway (Recommended)

This project is optimized for Railway. Simply connect your GitHub repository to Railway, and it will automatically use the `Dockerfile` and `railway.json` for deployment.

### Docker

Build and run locally using Docker:

```bash
docker build -t algdevs-ai .
docker run -p 8080:8080 -e DATABASE_URL=... algdevs-ai
```

## 📱 PWA Features

AlgDevs-AI is a Progressive Web App. You can "Add to Home Screen" on your mobile device to use it as a standalone application. It includes:
- **Offline Support**: Basic caching of static assets.
- **Standalone Mode**: Removes browser UI for an immersive experience.
- **Mobile Optimized**: Designed for touch interaction and portrait orientation.

## 🤝 Contributing

We welcome contributions! Please feel free to submit Pull Requests or open Issues for any bugs or feature requests.

## 📄 License

MIT License - Copyright (c) 2026 AlgDevs
