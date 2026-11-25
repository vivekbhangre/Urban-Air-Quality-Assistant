# ClearWinter — Family & Community Winter Smog Assistant

ClearWinter is a GenAI-powered web application that helps families and communities navigate severe winter smog and thermal inversions. It pairs deterministic atmospheric and exposure models with server-side Gemini AI guidance to recommend low-emission daily routines, practical indoor air quality hacks, and sustainable alternatives—while transparently explaining the direct health and emission impact of every choice.

## Core Capabilities

- **Low-Emission Daily Routine & Thermal Inversion Curve**: Visualizes 24-hour winter PM2.5 buildup, pinpoints the safest daytime cross-ventilation window, and delivers chronological low-emission actions with direct lung-exposure and emission explanations. Supports one-click AI tailoring to the household's location, heating, commute, cooking appliance, and health sensitivities.
- **Indoor Air Quality Lab**: Models outdoor-to-indoor PM2.5 infiltration based on building tightness and cooking spikes, lets households toggle low-cost filtration/sealing protocols (including DIY Corsi-Rosenthal MERV-13 boxes), and generates custom AI indoor protocols for specific home constraints.
- **Sustainable Alternatives & Community Impact Calculator**: Recommends tailored heating, mobility, cooking, and community swaps, quantifying weekly CO₂e avoided, 90-day winter local PM2.5 prevented, and neighborhood-scale multiplier impact (1 to 500+ homes).
- **Winter Air Quality Advisor**: Contextual GenAI chat assistant answering family and neighborhood air-quality questions with structured direct-impact takeaways.
- **Household & Airshed Profile**: Ships with 6 real-world winter inversion basin presets (Kraków, Salt Lake City, Lahore, New Delhi, Milan, Fairbanks) plus full custom city and AQI configuration with strict validation and local persistence.

## Architecture & Project Structure

```text
├── server.ts                  # Express + Vite full-stack entry point
├── server/
│   ├── gemini.ts              # Singleton Gemini SDK client, model fallback, retry logic, bounded TTL cache, JSON schemas
│   ├── security.ts            # Input validation/sanitization, security headers, sliding-window rate limiter
│   └── security.test.ts       # Unit tests for server validation, rate limiting, and caching
├── src/
│   ├── App.tsx                # Application shell, accessible navigation, persisted state
│   ├── components/            # Modular, accessible UI views + ErrorBoundary
│   ├── data/airData.ts        # Winter inversion basin presets, indoor protocols, sustainable swaps
│   ├── services/api.ts        # Client API helpers with response normalization
│   ├── types/air.ts           # Strict TypeScript domain models
│   └── utils/
│       ├── airImpact.ts       # Pure air-quality math, infiltration & community scaling models
│       ├── airImpact.test.ts  # Unit tests for core environmental math & validation
│       ├── normalizeAi.ts     # Defensive schema normalization for GenAI JSON responses
│       └── normalizeAi.test.ts# Unit tests for AI response normalization
```

## Security & Efficiency Safeguards

- **Server-Side AI Boundary**: `GEMINI_API_KEY` is accessed strictly on the server (`process.env.GEMINI_API_KEY`) and never bundled into client code.
- **Input Validation & Rate Limiting**: All `/api/*` endpoints sanitize control characters, enforce strict payload/length bounds, and apply a memory-bounded sliding-window rate limiter with standard security response headers.
- **Resource Efficiency**: Reuses a singleton `@google/genai` client, caches identical tailored-plan queries with a bounded TTL cache, and memoizes expensive chart and calculation paths on the client.
- **Accessibility**: Semantic landmarks, skip-to-content navigation, keyboard-accessible SVG inversion chart, ARIA live status updates, visible focus rings, and `prefers-reduced-motion` support.

## Getting Started

1. **Install dependencies**:
   ```bash
   npm install
   ```
2. **Configure environment variables**:
   Copy `.env.example` to `.env` and set `GEMINI_API_KEY`.
3. **Run in development**:
   ```bash
   npm run dev
   ```
4. **Run unit tests, type-check, and production build**:
   ```bash
   npm test
   npm run lint
   npm run build
   ```
