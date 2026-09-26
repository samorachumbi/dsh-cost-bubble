// Host half: serves the token-cost payload over a plain HTTP route.
// Third-party client plugins cannot call Typert remotes (the client only
// mounts compiled descriptor contributions), so use the same pattern as
// dsh-sentinel: register a host route and let the client fetch() it.

// DeepSeek V4 pricing (USD per 1M tokens), verified 2026-08-29.
// Peak = 2x, Mon-Fri 01:00-04:00 & 06:00-10:00 UTC.
const RATES = {
  "deepseek-v4-flash": { miss: 0.22, hit: 0.007, output: 0.66 },
  "deepseek-v4-pro": { miss: 0.66, hit: 0.022, output: 1.98 },
};

function isPeak(now) {
  const d = new Date(now);
  const day = d.getUTCDay();
  const hour = d.getUTCHours();
  if (day === 0 || day === 6) return false;
  return (hour >= 1 && hour < 4) || (hour >= 6 && hour < 10);
}

function ratesFor(model) {
  if (typeof model === "string" && model.includes("flash")) return RATES["deepseek-v4-flash"];
  return RATES["deepseek-v4-pro"];
}

function resolveModel(session) {
  const events = session && session.events;
  if (!Array.isArray(events)) return null;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e && e.type === "request/header") {
      const m = e.data && e.data.header && e.data.header.config && e.data.header.config.model;
      if (typeof m === "string" && m.length > 0) return m;
    }
  }
  return null;
}

function compute(sessionId, sessions, sessionProjections) {
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    return { ok: false, error: "missing-session-id" };
  }
  const session = sessions.get(sessionId);
  if (session === undefined) return { ok: false, error: "session-not-found" };

  const state = sessionProjections.stateOf(session, "tokenUsage");
  const totals = (state && state.totals) || {
    uncachedInputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  const miss = totals.uncachedInputTokens ?? 0;
  const hit = totals.cacheReadTokens ?? 0;
  const write = totals.cacheWriteTokens ?? 0;
  const out = totals.outputTokens ?? 0;

  const model = resolveModel(session);
  const r = ratesFor(model);
  const mult = isPeak(Date.now()) ? 2 : 1;
  const input = ((miss * r.miss + hit * r.hit + write * r.miss) / 1e6) * mult;
  const output = ((out * r.output) / 1e6) * mult;

  return {
    ok: true,
    model: model,
    peak: mult === 2,
    tokens: { inputMiss: miss, cacheHit: hit, cacheWrite: write, output: out },
    cost: { input: input, output: output, total: input + output },
  };
}

const LOOPBACK = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;

export default {
  inject: ["webServer", "sessions", "sessionProjections"],
  apply(ctx) {
    const { webServer, sessions, sessionProjections } = ctx;
    ctx.effect(() => webServer.register({
      kind: "prefix",
      path: "/cost-bubble",
      handler: async (req, res) => {
        try {
          // Minimal DNS-rebinding guard: only loopback authorities may read this.
          if (!LOOPBACK.test(String(req.headers.host ?? ""))) {
            res.writeHead(403);
            res.end("forbidden");
            return;
          }
          if (req.method !== "GET") {
            res.writeHead(405);
            res.end();
            return;
          }
          const url = new URL(req.url ?? "/", "http://localhost");
          const sessionId = url.searchParams.get("sessionId");
          const payload = JSON.stringify(compute(sessionId, sessions, sessionProjections));
          res.writeHead(200, {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-cache",
          });
          res.end(payload);
        } catch (error) {
          res.writeHead(500);
          res.end(String(error && error.message ? error.message : error));
        }
      },
    }), "cost-bubble: usage route");
  },
};
