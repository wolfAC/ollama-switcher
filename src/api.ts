import { request } from "undici";

const BASE = "https://ollama.com";

export interface Account {
  email:     string;
  key:       string;
  password?: string;
}

export type AccountState =
  | "available"     // works, has quota
  | "rate_limited"  // transient concurrency/rate cap — still has quota, retry shortly
  | "exhausted"     // quota / credits genuinely used up
  | "unauthorized"  // bad or revoked API key
  | "error";        // network / unexpected failure

export interface AccountResult extends Account {
  state:        AccountState;
  models:       string[];
  remaining:    number | null;
  retryAfter:   number | null; // seconds, when rate_limited
  promptTokens: number;
  outputTokens: number;
  error:        string | null;
  pingMs:       number;
}

/** A usable account — has quota right now, even if momentarily rate-limited. */
export function isUsable(r: AccountResult): boolean {
  return r.state === "available" || r.state === "rate_limited";
}

function headers(apiKey: string) {
  return {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type":  "application/json",
    "Accept":        "application/json",
    "User-Agent":    "ollama-manager/2.0",
  };
}

interface Resp {
  statusCode: number;
  headers:    Record<string, string>;
  text:       string;
  json:       any;
}

async function call(path: string, init: Parameters<typeof request>[1]): Promise<Resp> {
  const { statusCode, body, headers: h } = await request(`${BASE}${path}`, init);
  const text = await body.text();
  let json: any;
  try { json = JSON.parse(text); } catch { /* non-JSON body */ }
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) flat[k.toLowerCase()] = String(v);
  return { statusCode, headers: flat, text, json };
}

function retryAfterSeconds(h: Record<string, string>): number | null {
  const ra = h["retry-after"];
  if (!ra) return null;
  const n = parseInt(ra, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Decide whether a 4xx limit response is a transient rate-limit or genuine
 * quota exhaustion. Rate-limits come with retry-after / x-ratelimit-* headers
 * and a "too many concurrent requests" style message; exhaustion talks about
 * quota / credits / usage limits (and may use 402).
 */
function classifyLimit(r: Resp): "rate_limited" | "exhausted" {
  const msg = `${r.json?.error ?? ""} ${r.text}`.toLowerCase();

  const quotaSignal =
    r.statusCode === 402 ||
    /quota|out of credits|insufficient|usage limit|daily limit|out of tokens|exceeded your/.test(msg);
  if (quotaSignal) return "exhausted";

  const rateSignal =
    retryAfterSeconds(r.headers) != null ||
    "x-ratelimit-max-concurrent" in r.headers ||
    /too many|concurrent|rate.?limit|slow down|try again/.test(msg);
  if (rateSignal) return "rate_limited";

  // Ambiguous: a 403 usually means the key/account is blocked (treat as
  // exhausted); a bare 429 with no quota wording is most likely transient.
  return r.statusCode === 403 ? "exhausted" : "rate_limited";
}

export async function getModels(apiKey: string): Promise<{ models: string[]; resp: Resp }> {
  const resp = await call(`/api/tags`, {
    headers: headers(apiKey),
    headersTimeout: 8_000,
    bodyTimeout:    8_000,
  });
  const models = (resp.json?.models ?? []).map(
    (m: any) => m.name ?? m.model ?? String(m),
  );
  return { models, resp };
}

export async function probeGenerate(apiKey: string, model: string): Promise<Resp> {
  return call(`/api/generate`, {
    method:  "POST",
    headers: headers(apiKey),
    body:    JSON.stringify({ model, prompt: "Hi", stream: false, options: { num_predict: 1 } }),
    headersTimeout: 12_000,
    bodyTimeout:    12_000,
  });
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function checkAccount(acc: Account): Promise<AccountResult> {
  const start = Date.now();
  const base  = { ...acc, models: [] as string[], remaining: null, retryAfter: null,
                  promptTokens: 0, outputTokens: 0, error: null as string | null };

  try {
    // 1) List models (also the cheapest auth check).
    const { models, resp: tags } = await getModels(acc.key);
    if (tags.statusCode === 401)
      return { ...base, state: "unauthorized", error: "Invalid API key", pingMs: Date.now() - start };
    if (tags.statusCode === 429 || tags.statusCode === 403 || tags.statusCode === 402) {
      const state = classifyLimit(tags);
      return { ...base, state, retryAfter: retryAfterSeconds(tags.headers), pingMs: Date.now() - start };
    }
    if (tags.statusCode !== 200)
      return { ...base, state: "error", error: `HTTP ${tags.statusCode}`, pingMs: Date.now() - start };

    // 2) Probe a real generate to confirm quota, retrying once on a transient
    //    rate-limit (respecting retry-after, capped) before concluding.
    const model = models[0] ?? "gemma3:27b-cloud";
    let probe = await probeGenerate(acc.key, model);

    if (probe.statusCode === 429 || probe.statusCode === 403 || probe.statusCode === 402) {
      if (classifyLimit(probe) === "rate_limited") {
        const wait = Math.min(retryAfterSeconds(probe.headers) ?? 5, 15);
        await sleep(wait * 1_000);
        probe = await probeGenerate(acc.key, model);
      }
    }

    if (probe.statusCode === 200) {
      const body = probe.json ?? {};
      const text = JSON.stringify(body).toLowerCase();
      // Some backends return 200 with a quota error embedded in the body.
      const embeddedExhaustion = /quota|limit exceeded|out of credits/.test(text);
      return {
        ...base,
        state:        embeddedExhaustion ? "exhausted" : "available",
        models,
        promptTokens: body.prompt_eval_count ?? 0,
        outputTokens: body.eval_count ?? 0,
        pingMs:       Date.now() - start,
      };
    }

    if (probe.statusCode === 429 || probe.statusCode === 403 || probe.statusCode === 402) {
      const state = classifyLimit(probe);
      return { ...base, state, models, retryAfter: retryAfterSeconds(probe.headers), pingMs: Date.now() - start };
    }

    return { ...base, state: "error", models, error: `HTTP ${probe.statusCode}`, pingMs: Date.now() - start };
  } catch (err: any) {
    return { ...base, state: "error", error: err.message ?? String(err), pingMs: Date.now() - start };
  }
}
