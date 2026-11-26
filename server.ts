import 'dotenv/config';
import express, { type Express } from 'express';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import type { TailoredPlanResponse } from './src/types/air.ts';
import {
  normalizeAdvisorReply,
  normalizeCustomHack,
  normalizeTailoredPlan,
} from './src/utils/normalizeAi.ts';
import {
  ADVISOR_CHAT_SCHEMA,
  BoundedTtlCache,
  CUSTOM_HACK_SCHEMA,
  formatProfileContext,
  isAiConfigured,
  profileCacheKey,
  runStructuredGeminiCall,
  TAILORED_PLAN_SCHEMA,
} from './server/gemini.ts';
import {
  createRateLimitMiddleware,
  jsonSyntaxErrorMiddleware,
  securityHeadersMiddleware,
  SlidingWindowRateLimiter,
  validateChatRequest,
  validateHackRequest,
  validateProfilePayload,
} from './server/security.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

export interface AppDependencies {
  rateLimiter?: SlidingWindowRateLimiter;
  planCache?: BoundedTtlCache<TailoredPlanResponse>;
  modelCooldowns?: Map<string, number>;
}

/**
 * Builds the Express application with security middleware, validated AI routes,
 * and static/SPA serving. Exported separately from server startup for testing.
 */
export async function createApp(deps: AppDependencies = {}): Promise<Express> {
  const app = express();
  const planCache = deps.planCache ?? new BoundedTtlCache<TailoredPlanResponse>(10 * 60 * 1000, 50);
  const aiRateLimiter = deps.rateLimiter ?? new SlidingWindowRateLimiter(20, 60 * 1000, 1000);
  const modelCooldowns = deps.modelCooldowns ?? new Map<string, number>();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(securityHeadersMiddleware);
  app.use(express.json({ limit: '64kb' }));
  app.use(jsonSyntaxErrorMiddleware);

  const rateLimitAi = createRateLimitMiddleware(aiRateLimiter);

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      aiConfigured: isAiConfigured(),
    });
  });

  app.post('/api/plan/tailor', rateLimitAi, async (req, res) => {
    const validated = validateProfilePayload(req.body?.profile);
    if (!validated.ok) {
      res.status(400).json({ error: validated.error });
      return;
    }

    const forceRefresh = req.body?.forceRefresh === true;
    const cacheKey = profileCacheKey(validated.data);
    if (!forceRefresh) {
      const cached = planCache.get(cacheKey);
      if (cached) {
        res.json(cached);
        return;
      }
    }

    const result = await runStructuredGeminiCall({
      endpoint: '/api/plan/tailor',
      contents: `Generate a tailored winter smog protection and low-emission daily plan for this household:\n\n${formatProfileContext(validated.data)}`,
      systemInstruction:
        'You are ClearWinter, an environmental health and urban air-quality specialist helping families and communities navigate severe winter smog and thermal inversions. ' +
        'Provide practical, empathetic, evidence-based advice tailored strictly to the given city, heating system, commute, cooking appliance, building type, and household sensitivities. ' +
        'Always explain the concrete physical mechanism and direct measurable impact (PM2.5 exposure or emissions avoided) of each choice. Keep every field concise and scannable.',
      responseSchema: TAILORED_PLAN_SCHEMA,
      missingKeyMessage:
        'Gemini API key is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets to enable live AI tailoring.',
      emptyResponseMessage: 'Received an empty response from the AI model. Please retry.',
      normalize: normalizeTailoredPlan,
      cooldowns: modelCooldowns,
    });

    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    planCache.set(cacheKey, result.data);
    res.json(result.data);
  });

  app.post('/api/hacks/custom', rateLimitAi, async (req, res) => {
    const validated = validateHackRequest(req.body);
    if (!validated.ok) {
      res.status(400).json({ error: validated.error });
      return;
    }

    const result = await runStructuredGeminiCall({
      endpoint: '/api/hacks/custom',
      contents: `Household context:\n${formatProfileContext(validated.profile)}\n\nSpecific indoor air challenge described by the family:\n"${validated.challenge}"\n\nDesign one practical, affordable, science-backed indoor air quality hack tailored specifically to this challenge.`,
      systemInstruction:
        'You are an indoor air quality engineer advising families during severe winter smog. ' +
        'Return a practical, safe, DIY or low-cost indoor air quality hack with realistic PM2.5 reduction estimates (between 0.08 and 0.45) and concrete step-by-step instructions. Never recommend ozone generators or unsafe combustion workarounds.',
      responseSchema: CUSTOM_HACK_SCHEMA,
      missingKeyMessage:
        'Gemini API key is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets to generate custom AI indoor hacks.',
      emptyResponseMessage: 'Received an empty response from the AI model. Please retry.',
      normalize: normalizeCustomHack,
      cooldowns: modelCooldowns,
    });

    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.json(result.data);
  });

  app.post('/api/advisor/chat', rateLimitAi, async (req, res) => {
    const validated = validateChatRequest(req.body);
    if (!validated.ok) {
      res.status(400).json({ error: validated.error });
      return;
    }

    const formattedHistory = validated.messages
      .slice(-8)
      .map((m) => `${m.role === 'assistant' ? 'Advisor' : 'Family'}: ${m.content}`)
      .join('\n\n');

    const result = await runStructuredGeminiCall({
      endpoint: '/api/advisor/chat',
      contents: `Household Profile:\n${formatProfileContext(validated.profile)}\n\nConversation:\n${formattedHistory}\n\nRespond to the Family's latest message with tailored, practical winter smog guidance and clear direct-impact explanations.`,
      systemInstruction:
        'You are ClearWinter Air Advisor, a calm, evidence-based environmental health and clean-air community specialist. ' +
        'Help families and neighborhood groups navigate severe winter smog, thermal inversions, indoor PM2.5, school runs, home heating choices, and community clean-air actions. ' +
        'Keep answers clear, structured, and concise (under 220 words). Return JSON with `reply` (clean readable prose with short paragraphs, no markdown tables or raw hashtags) and `impactSummary` (2-3 crisp bullet takeaways stating the direct health or emission impact of your advice).',
      responseSchema: ADVISOR_CHAT_SCHEMA,
      missingKeyMessage:
        'Gemini API key is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets to chat with the live Air Advisor.',
      emptyResponseMessage: 'Received an empty response from the AI advisor. Please retry.',
      normalize: normalizeAdvisorReply,
      cooldowns: modelCooldowns,
    });

    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.json(result.data);
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return app;
}

export async function startServer(): Promise<void> {
  const app = await createApp();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ClearWinter server listening on http://0.0.0.0:${PORT}`);
  });
}

const isEntryPoint =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isEntryPoint) {
  startServer().catch((err) => {
    console.error('Failed to start ClearWinter server:', err);
    process.exit(1);
  });
}
