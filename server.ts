import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import type { TailoredPlanResponse } from './src/types/air';
import {
  normalizeAdvisorReply,
  normalizeCustomHack,
  normalizeTailoredPlan,
} from './src/utils/normalizeAi';
import {
  ADVISOR_CHAT_SCHEMA,
  BoundedTtlCache,
  CUSTOM_HACK_SCHEMA,
  formatProfileContext,
  GEMINI_FALLBACK_MODEL,
  GEMINI_MODEL,
  generateWithModelFallback,
  getGeminiClient,
  isAiConfigured,
  mapGeminiError,
  parseModelJson,
  profileCacheKey,
  TAILORED_PLAN_SCHEMA,
  thinkingConfigForModel,
} from './server/gemini';
import {
  createRateLimitMiddleware,
  securityHeadersMiddleware,
  SlidingWindowRateLimiter,
  validateChatRequest,
  validateHackRequest,
  validateProfilePayload,
} from './server/security';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const planCache = new BoundedTtlCache<TailoredPlanResponse>(10 * 60 * 1000, 50);
const aiRateLimiter = new SlidingWindowRateLimiter(20, 60 * 1000, 1000);
const modelCooldowns = new Map<string, number>();
const MODEL_CANDIDATES = [GEMINI_MODEL, GEMINI_FALLBACK_MODEL] as const;

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeadersMiddleware);
  app.use(express.json({ limit: '64kb' }));

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

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          'Gemini API key is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets to enable live AI tailoring.',
      });
      return;
    }

    try {
      const context = formatProfileContext(validated.data);
      const response = await generateWithModelFallback(
        (model) =>
          ai.models.generateContent({
            model,
            contents: `Generate a tailored winter smog protection and low-emission daily plan for this household:\n\n${context}`,
            config: {
              thinkingConfig: thinkingConfigForModel(model),
              systemInstruction:
                'You are ClearWinter, an environmental health and urban air-quality specialist helping families and communities navigate severe winter smog and thermal inversions. ' +
                'Provide practical, empathetic, evidence-based advice tailored strictly to the given city, heating system, commute, cooking appliance, building type, and household sensitivities. ' +
                'Always explain the concrete physical mechanism and direct measurable impact (PM2.5 exposure or emissions avoided) of each choice. Keep every field concise and scannable.',
              responseMimeType: 'application/json',
              responseSchema: TAILORED_PLAN_SCHEMA,
            },
          }),
        MODEL_CANDIDATES,
        modelCooldowns
      );

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({ error: 'Received an empty response from the AI model. Please retry.' });
        return;
      }

      const normalized = normalizeTailoredPlan(parseModelJson(rawText));
      planCache.set(cacheKey, normalized);
      res.json(normalized);
    } catch (error) {
      const mapped = mapGeminiError(error);
      if (mapped.status >= 500) {
        console.error('[ClearWinter] /api/plan/tailor error:', error instanceof Error ? error.message : error);
      } else {
        console.warn(`[ClearWinter] /api/plan/tailor returned ${mapped.status}: ${mapped.message}`);
      }
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  app.post('/api/hacks/custom', rateLimitAi, async (req, res) => {
    const validated = validateHackRequest(req.body);
    if (!validated.ok) {
      res.status(400).json({ error: validated.error });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          'Gemini API key is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets to generate custom AI indoor hacks.',
      });
      return;
    }

    try {
      const context = formatProfileContext(validated.profile);
      const response = await generateWithModelFallback(
        (model) =>
          ai.models.generateContent({
            model,
            contents: `Household context:\n${context}\n\nSpecific indoor air challenge described by the family:\n"${validated.challenge}"\n\nDesign one practical, affordable, science-backed indoor air quality hack tailored specifically to this challenge.`,
            config: {
              thinkingConfig: thinkingConfigForModel(model),
              systemInstruction:
                'You are an indoor air quality engineer advising families during severe winter smog. ' +
                'Return a practical, safe, DIY or low-cost indoor air quality hack with realistic PM2.5 reduction estimates (between 0.08 and 0.45) and concrete step-by-step instructions. Never recommend ozone generators or unsafe combustion workarounds.',
              responseMimeType: 'application/json',
              responseSchema: CUSTOM_HACK_SCHEMA,
            },
          }),
        MODEL_CANDIDATES,
        modelCooldowns
      );

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({ error: 'Received an empty response from the AI model. Please retry.' });
        return;
      }

      const normalized = normalizeCustomHack(parseModelJson(rawText));
      res.json(normalized);
    } catch (error) {
      const mapped = mapGeminiError(error);
      if (mapped.status >= 500) {
        console.error('[ClearWinter] /api/hacks/custom error:', error instanceof Error ? error.message : error);
      } else {
        console.warn(`[ClearWinter] /api/hacks/custom returned ${mapped.status}: ${mapped.message}`);
      }
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  app.post('/api/advisor/chat', rateLimitAi, async (req, res) => {
    const validated = validateChatRequest(req.body);
    if (!validated.ok) {
      res.status(400).json({ error: validated.error });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          'Gemini API key is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets to chat with the live Air Advisor.',
      });
      return;
    }

    try {
      const context = formatProfileContext(validated.profile);
      const formattedHistory = validated.messages
        .slice(-8)
        .map((m) => `${m.role === 'assistant' ? 'Advisor' : 'Family'}: ${m.content}`)
        .join('\n\n');

      const response = await generateWithModelFallback(
        (model) =>
          ai.models.generateContent({
            model,
            contents: `Household Profile:\n${context}\n\nConversation:\n${formattedHistory}\n\nRespond to the Family's latest message with tailored, practical winter smog guidance and clear direct-impact explanations.`,
            config: {
              thinkingConfig: thinkingConfigForModel(model),
              systemInstruction:
                'You are ClearWinter Air Advisor, a calm, evidence-based environmental health and clean-air community specialist. ' +
                'Help families and neighborhood groups navigate severe winter smog, thermal inversions, indoor PM2.5, school runs, home heating choices, and community clean-air actions. ' +
                'Keep answers clear, structured, and concise (under 220 words). Return JSON with `reply` (clean readable prose with short paragraphs, no markdown tables or raw hashtags) and `impactSummary` (2-3 crisp bullet takeaways stating the direct health or emission impact of your advice).',
              responseMimeType: 'application/json',
              responseSchema: ADVISOR_CHAT_SCHEMA,
            },
          }),
        MODEL_CANDIDATES,
        modelCooldowns
      );

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({ error: 'Received an empty response from the AI advisor. Please retry.' });
        return;
      }

      const normalized = normalizeAdvisorReply(parseModelJson(rawText));
      res.json(normalized);
    } catch (error) {
      const mapped = mapGeminiError(error);
      if (mapped.status >= 500) {
        console.error('[ClearWinter] /api/advisor/chat error:', error instanceof Error ? error.message : error);
      } else {
        console.warn(`[ClearWinter] /api/advisor/chat returned ${mapped.status}: ${mapped.message}`);
      }
      res.status(mapped.status).json({ error: mapped.message });
    }
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ClearWinter server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start ClearWinter server:', err);
  process.exit(1);
});
