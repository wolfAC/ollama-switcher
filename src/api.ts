import { request } from "undici";

const BASE = "https://ollama.com";

export interface Account {
  email: string;
  key:   string;
}

export interface ProbeResult {
  exhausted:    boolean;
  remaining:    number | null;
  promptTokens: number;
  outputTokens: number;
  loadMs:       string | null;
  quota:        Record<string, string>;
}

export interface AccountResult extends Account {
  ok:       boolean;
  exhausted: boolean;
  models:   string[];
  probe:    ProbeResult | null;
  error:    string | null;
  pingMs:   number;
}

function headers(apiKey: string) {
  return {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type":  "application/json",
    "Accept":        "application/json",
    "User-Agent":    "ollama-manager/2.0",
  };
}

export async function getModels(apiKey: string): Promise<string[]> {
  const { statusCode, body } = await request(`${BASE}/api/tags`, {
    headers: headers(apiKey),
    headersTimeout: 8_000,
    bodyTimeout:    8_000,
  });

  if (statusCode === 401) throw new Error("Invalid API key");
  if (statusCode === 429) throw new Error("Rate limited / quota exceeded");
  if (statusCode === 403) throw new Error("Forbidden — quota exhausted");
  if (statusCode !== 200) throw new Error(`HTTP ${statusCode}`);

  const json = await body.json() as any;
  return (json.models ?? []).map((m: any) => m.name ?? m.model ?? String(m));
}

export async function probeGenerate(apiKey: string, model: string): Promise<ProbeResult | null> {
  const payload = JSON.stringify({
    model,
    prompt:  "Hi",
    stream:  false,
    options: { num_predict: 1 },
  });

  const { statusCode, body, headers: resHeaders } = await request(`${BASE}/api/generate`, {
    method:  "POST",
    headers: headers(apiKey),
    body:    payload,
    headersTimeout: 12_000,
    bodyTimeout:    12_000,
  });

  if (statusCode === 429 || statusCode === 403) return { exhausted: true, remaining: null, promptTokens: 0, outputTokens: 0, loadMs: null, quota: {} };
  if (statusCode !== 200) return null;

  const b        = await body.json() as any;
  const bodyStr  = JSON.stringify(b).toLowerCase();
  const exhausted = /quota|limit exceeded|out of credits/.test(bodyStr);

  const quota: Record<string, string> = {};
  let remaining: number | null = null;

  for (const [k, v] of Object.entries(resHeaders)) {
    const kl = k.toLowerCase();
    if (kl.includes("ratelimit") || kl.includes("quota") || kl.includes("remaining")) {
      quota[k] = String(v);
      if (kl.includes("remaining")) remaining = parseInt(String(v), 10);
    }
  }

  return {
    exhausted: exhausted || remaining === 0,
    remaining,
    promptTokens: b.prompt_eval_count ?? 0,
    outputTokens: b.eval_count        ?? 0,
    loadMs:       b.load_duration ? (b.load_duration / 1e6).toFixed(0) : null,
    quota,
  };
}

export async function checkAccount(acc: Account): Promise<AccountResult> {
  const start = Date.now();
  try {
    const models     = await getModels(acc.key);
    const firstModel = models[0] ?? "gemma4:31b-cloud";
    const probe      = await probeGenerate(acc.key, firstModel);
    return { ...acc, ok: true, exhausted: probe?.exhausted ?? false, models, probe: probe ?? null, error: null, pingMs: Date.now() - start };
  } catch (err: any) {
    const exhausted = /quota|rate.?limit|forbidden/i.test(err.message);
    return { ...acc, ok: false, exhausted, models: [], probe: null, error: err.message, pingMs: Date.now() - start };
  }
}
