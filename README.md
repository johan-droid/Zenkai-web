# Zenkai Web

An anime and manga browser application. Browse titles, read chapters, and watch episodes with a decoupled provider backend architecture.

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 14+
- Redis 7+ (optional, for caching)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd zenkai-web

# Copy environment files
cp .env.example .env
cp backend/.env.example backend/.env

# Edit .env and backend/.env with your credentials

# Install dependencies
npm install           # Root (if any workspace deps)
cd frontend && npm install
cd backend && npm install

# Setup database
cd backend
npx drizzle-kit generate
npx drizzle-kit migrate
# Or use the migration script:
npm run db:migrate

# Optional: seed the database
npm run db:seed
```

### Running the Project

```bash
# Terminal 1: Start backend (port 4000)
cd backend
npm run dev

# Terminal 2: Start frontend (port 3000)
cd frontend
npm run dev
```

**Single command to start both (kills any existing Zenkai servers first):**
```bash
# Start backend - automatically kills frontend if running
cd backend && npm run dev

# Or start frontend - automatically kills backend if running
cd frontend && npm run dev
```

Open http://localhost:3000 in your browser.

## Project Structure

```
zenkai-web/
├── backend/                 # Node.js + Fastify API server
│   ├── src/
│   │   ├── app.ts          # Fastify application setup
│   │   ├── cache/          # Caching layer (Redis + in-memory)
│   │   ├── db/             # Drizzle ORM schemas and migrations
│   │   ├── http/           # Error handling and utilities
│   │   ├── modules/        # Feature modules
│   │   │   ├── manga/      # Manga catalog and chapters
│   │   │   ├── novel/      # Novel content
│   │   │   └── playback/   # Video playback and streaming
│   │   └── providers/      # External API integrations
│   │       ├── metadata/   # AniList, Jikan, etc.
│   │       └── streaming/  # Video source providers
│   ├── drizzle.config.ts   # Drizzle ORM config
│   ├── migrations/         # Database migrations
│   └── test/               # Backend tests
│
├── frontend/                # Next.js 16 + React 19 app
│   ├── src/
│   │   ├── app/            # App Router pages
│   │   │   ├── (main)/     # Main routes (anime, manga, library, etc.)
│   │   │   └── read/       # Manga reader
│   │   ├── components/     # React components
│   │   │   ├── browse/     # Catalog browsing views
│   │   │   ├── detail/     # Title detail views
│   │   │   ├── reader/     # Manga reader component
│   │   │   ├── schedule/   # Schedule/calendar views
│   │   │   └── settings/   # User settings
│   │   ├── lib/
│   │   │   ├── api/        # API clients (AniList, MangaDex, etc.)
│   │   │   ├── db/         # IndexedDB (Dexie) schemas
│   │   │   └── sources/    # Video source registry
│   │   └── hooks/          # Custom React hooks
│   └── public/             # Static assets
│
├── scripts/                 # Development utility scripts
│   └── free-port.js        # Kills conflicting dev servers
├── logs/                    # Development logs (gitignored)
├── .env.example            # Environment template (root)
└── README.md               # This file
```

## Architecture

### Backend (`backend/`)

**Stack:** Node.js, Fastify, Drizzle ORM, PostgreSQL, Redis (optional)

The backend acts as a gateway/proxy for external anime/manga APIs. It:

- Resolves metadata from AniList, Jikan, and other sources
- Provides manga chapters and episode sources
- Handles playback streaming via provider gateway
- Caches responses in Redis or in-memory
- Persists user progress (reading/watch history)

**Key Modules:**

| Module | Purpose |
|--------|---------|
| `manga/` | Manga catalog, chapters, sources |
| `playback/` | Video playback, streaming proxy, transport |
| `providers/metadata/` | AniList GraphQL, Jikan REST |
| `providers/streaming/` | Video source resolution |

### Frontend (`frontend/`)

**Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS, Zustand, React Query, Dexie (IndexedDB)

The frontend provides the UI for browsing and consuming content. It:

- Uses Next.js App Router for routing
- Stores reading/watch progress in IndexedDB (local only)
- Uses React Query for server state management
- Uses Zustand for client state
- Has a custom manga reader component
- Supports video playback via @vidstack/react + HLS.js

**Note:** The frontend currently talks to AniList and MangaDex directly from the browser. Backend integration is tracked in `backend/TODO-frontend-migration.md`.

## API

### Backend API (`http://localhost:4000/api/v1`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/episodes/:id/sources` | GET | Get video sources for an episode |
| `/api/v1/manga/...` | Various | Manga catalog and chapter endpoints |
| `/api/v1/playback/...` | Various | Playback and streaming endpoints |

See `backend/docs/` for detailed API documentation.

### Environment Variables

#### Root `.env`
| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment mode |
| `PORT` | `3000` | Frontend dev server port |

#### Backend `backend/.env`
| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | Backend server port |
| `HOST` | `0.0.0.0` | Bind address |
| `DATABASE_URL` | - | PostgreSQL connection string |
| `DATABASE_POOL_MAX` | `10` | Connection pool size |
| `REDIS_URL` | - | Redis connection (optional) |
| `ANILIST_ENDPOINT` | `https://graphql.anilist.co` | AniList API endpoint |
| `JIKAN_ENDPOINT` | `https://api.jikan.moe/v4` | Jikan API endpoint |
| `ENABLE_DEMO_STREAMS` | `false` | Serve demo HLS streams |
| `PROVIDER_HTTP_TIMEOUT_MS` | `5000` | Provider request timeout |

## Development

### Scripts

| Command | Description |
|---------|-------------|
| `cd backend && npm run dev` | Start backend with hot reload |
| `cd frontend && npm run dev` | Start frontend with hot reload |
| `cd backend && npm run build` | Build backend for production |
| `cd frontend && npm run build` | Build frontend for production |
| `cd backend && npm run db:generate` | Generate Drizzle migrations |
| `cd backend && npm run db:migrate` | Run database migrations |
| `cd backend && npm run db:seed` | Seed database with sample data |
| `cd backend && npm test` | Run backend tests |
| `cd frontend && npm test` | Run frontend tests |
| `cd frontend && npm run lint` | Lint frontend code |

### Port Conflicts

The project includes `scripts/free-port.js` which automatically kills any existing Zenkai dev servers on ports 3000 (frontend) and 4000 (backend) when you start a server. This prevents "port already in use" errors.

Logs are written to `logs/dev-server.log`.

### Database Schema

The database uses Drizzle ORM. Key tables:

- **episodes** - Video episodes with sources
- **manga** - Manga titles and metadata
- **chapters** - Manga chapters
- **user_progress** - Reading/watch progress (local-only in current version)

See `backend/src/db/schema/` for table definitions.

## Testing

```bash
# Backend tests
cd backend && npm test

# Frontend tests
cd frontend && npm test
```

## License

[Add your license here]

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `cd backend && npm test && cd frontend && npm test`
5. Submit a pull request

## Troubleshooting

### Port already in use
The `free-port.js` script should handle this automatically. If it fails, manually kill the process:
```bash
# Find process on port 3000
lsof -i :3000
# Kill it
kill -9 <PID>
```

### Database connection errors
1. Ensure PostgreSQL is running
2. Check `backend/.env` has correct `DATABASE_URL`
3. Run migrations: `cd backend && npm run db:migrate`

### Frontend can't reach backend
1. Ensure backend is running on port 4000
2. Check CORS settings in `backend/src/app.ts`
3. Verify `ANILIST_ENDPOINT` in `backend/.env` is reachable
