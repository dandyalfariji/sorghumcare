/**
 * BIMA AI client — talks to the SorghumCare LLM backend.
 *
 * Routes: browser → `/bima-api/chat` (same-origin proxy) → backend.
 * Streaming: enabled by default; the proxy (vite.config.ts) relays SSE chunks
 * as they arrive.
 */
const BIMA_CHAT_PATH = '/bima-api/chat';
const BIMA_MODEL = import.meta.env.VITE_BIMA_MODEL || '';
const BIMA_API_KEY = import.meta.env.VITE_BIMA_API_KEY || '';

export interface BimaChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface BimaChatResult {
  response: string;
  sources?: { documentName: string; text: string }[];
  model?: string;
}

/**
 * Extract only the first complete JSON object from text.
 * The backend SSE often appends metadata ("summary", "reviewer_ran", ...)
 * after the recipe JSON, which would cause JSON.parse to fail with "Extra data".
 * This trims everything after the first balanced closing brace.
 */
function extractFirstJson(text: string): string {
  const start = text.indexOf('{');
  if (start === -1) return text;
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    // Braces inside a string literal (e.g. a description containing "}") must not end
    // the object early: counting them truncated the JSON mid-`ingredients` array, which
    // surfaced downstream as a "recipe" with an empty ingredient list.
    if (inString) {
      if (ch === '\\') { i++; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return text.substring(start, i + 1); }
  }
  return text;
}

async function parseSSE(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let full = '';
  let buffer = '';
  let validationData: any = null;
  let lastContentTime = Date.now();
  // 80–130s for wizard prompts (RAG retrieval + reviewer pass run BEFORE the first
  // token is emitted). Measured over the 2026-09 sweeps: p75 114s, max 175s, and one
  // production request streamed for 230s end-to-end, so the old 170s cap left ~3s of
  // headroom on the slowest runs. 200s keeps headroom for the backend's slow tail.
  // Re-measured 2026-11-07 on the live backend: RAG retrieval returns in ~0.3s but the LLM
  // provider emitted no content at all across four runs (150s, 180s, 240s, 392s). The 392s
  // run is the informative one — the backend itself gave up there and streamed its own
  // "Koneksi ke server AI mengalami waktu tunggu habis (timeout)" text. So the binding
  // ceiling is the backend's (~392s), not ours: aborting at 200s only replaces the user's
  // timeout with a bare error while the provider is still working. 250s bounds the wait
  // while giving the provider the room the earlier 230s production run already needed.
  const NO_CONTENT_TIMEOUT_MS = 250_000;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') continue;
      try {
        const obj = JSON.parse(payload);
        if (obj.delta) { full += obj.delta; lastContentTime = Date.now(); }
        if (obj.response) { full = obj.response; lastContentTime = Date.now(); }
        if (obj.validation) validationData = obj.validation;
      } catch { /* ignore malformed line */ }
    }
    // Backstop only: abort if the backend stays silent past NO_CONTENT_TIMEOUT_MS.
    if (!full && Date.now() - lastContentTime > NO_CONTENT_TIMEOUT_MS) {
      reader.cancel();
      // Actionable message: the cause is LLM speed on the backend (not the user's
      // connection), and there is a no-AI way out. Matched by isAiUnavailableError
      // through the word "timeout".
      throw new Error(
        `Timeout AI: server AI belum mengirim isi resep setelah ${NO_CONTENT_TIMEOUT_MS / 1000} detik. ` +
        'Ini biasanya karena model AI di sisi server sedang lambat atau antrean padat — bukan koneksi Anda. ' +
        'Silakan coba lagi sebentar lagi, atau pilih salah satu alternatif resep di bawah ini (dibuat langsung tanpa AI).'
      );
    }
  }

  // 🔧 If the backend RAG guard flagged the recipe as unfit/dangerous, DO NOT render the food!
  // Force it into an 'unpayload' refusal so the frontend displays the warning instead.
  if (validationData && validationData.verdict === 'tidak_valid') {
    const issues = validationData.issues || [];
    const reasons = issues.map((i: any) => `- **${i.aspect}**: ${i.problem}`).join('\n');
    const msg = `**Resep Ditolak (Skor Kelayakan: ${validationData.score}/100)**\n\nResep ini dinilai belum layak dipraktikkan karena:\n${reasons}\n\n*Sistem AI BIMA telah memblokir resep ini demi keamanan dan kenyamanan.*`;
    return msg;
  }
  // perlu_perbaikan: recipe needs fixes — append warnings to the response
  if (validationData && validationData.verdict === 'perlu_perbaikan' && validationData.issues?.length) {
    const warnings = validationData.issues
      .filter((i: any) => i.severity === 'sedang' || i.severity === 'berat')
      .map((i: any) => `- **${i.aspect}**: ${i.fix || i.problem}`)
      .join('\n');
    if (warnings) {
      full += `

---

### Catatan Verifikasi (Skor ${validationData.score}/100)
${warnings}`;
    }
  }

  // The backend appends metadata after the recipe JSON, which would break JSON.parse
  // (e.g. ""summary": "", "reviewer_ran": false, ..." after the closing brace).
  // Extract only the first complete JSON object.
  const trimmedFull = full.trim();
  // 🔧 Search for JSON anywhere in the text (LLM may return prose before JSON)
  const firstBrace = trimmedFull.indexOf('{');
  if (firstBrace !== -1) {
    const jsonCandidate = trimmedFull.substring(firstBrace);
    const clean = extractFirstJson(jsonCandidate);
    try {
      // If the LLM hallucinated a JSON wrapper { "type": "text", "text": "..." }
      const parsedClean = JSON.parse(clean);
      if (parsedClean && parsedClean.type === 'text' && typeof parsedClean.text === 'string') {
        full = parsedClean.text;
      } else if (clean !== full) {
        full = clean;
      }
    } catch (e) {
      if (clean !== full) full = clean;
    }
  }
  return full;
}
export async function bimaChat(
  message: string,
  history: BimaChatMessage[] = [],
  opts: { model?: string; useRag?: boolean; stream?: boolean } = {}
): Promise<BimaChatResult> {
  const stream = opts.stream !== false; // default true
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Use-RAG': String(opts.useRag ?? true),
        'X-Stream': stream ? 'true' : 'false',
        'X-Max-Tokens': '8192',
      };
    
    // We intentionally do NOT send X-Model, X-Server-Url, or X-LLM-API-Key from the frontend.
    // This forces the backend to use the default LLM settings configured by the Admin in the dashboard.
    // The X-Api-Key header below is strictly for Consumer API Keys (bima_...), not LLM provider keys.
    if (BIMA_API_KEY) headers['X-Api-Key'] = BIMA_API_KEY;
      const payload: Record<string, unknown> = { message };
  if (history && history.length) payload.history = history;

  // 🔧 Client-side timeout: 260s — must exceed the no-content guard in parseSSE (250s)
  // AND the frontend-host proxy window. Raised together with that guard (see the note
  // there): the live backend gave up on its own at 392s, so the previous 180s/200s pair
  // was aborting requests the provider was still working on.
  const CLIENT_TIMEOUT_MS = 260_000;

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), CLIENT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(BIMA_CHAT_PATH, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: ctl.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    let cleanMsg = errText;
    try {
      const parsed = JSON.parse(errText);
      if (parsed.detail) cleanMsg = parsed.detail;
    } catch (e) {
      cleanMsg = errText.slice(0, 300);
    }
    throw new Error(`BIMA AI error ${res.status}: ${cleanMsg}`);
  }

  let response: string;
  let sources: any[] = [];
  let modelUsed: string | undefined;

  if (stream && res.body) {
    response = await parseSSE(res.body.getReader());
    if (!response || !response.trim()) {
      throw new Error('BIMA AI returned an empty response.');
    }
  } else {
    const data = await res.json();
    response = data.response ?? data.answer ?? '';
    sources = data.sources;
    modelUsed = data.model;
  }

  if (!response || !response.trim()) {
    throw new Error('BIMA AI returned an empty response.');
  }
  if (/tidak ada teks respons/i.test(response)) {
    throw new Error('BIMA AI backend failed to produce a response (empty text).');
  }
  // The backend sometimes streams its own Python error text as if it were the
  // answer (e.g. "Server AI gagal merespons: 'str' object has no attribute 'put'").
  // Throw so generateWithRetry retries instead of rendering that string to the user.
  if (/^\s*Server AI gagal merespons/i.test(response) || /object has no attribute/i.test(response)) {
    throw new Error(`BIMA AI backend error: ${response.trim().slice(0, 200)}`);
  }
  // The backend can also relay the UPSTREAM provider's quota/rate-limit payload as the
  // answer body: an HTTP 200 whose content is
  // {"error": {"message": "[commandcode/Qwen/...] [429]: You've reached your weekly usage
  // limit ... resets at 2026-10-04T06:08:58.221Z"}} (observed 2026-09-29). Treated as prose
  // it was retried four times and then rendered raw in the chat bubble. Retrying cannot
  // create quota, so fail fast with a 429-shaped error — generateWithRetry treats 429 as
  // non-retryable — and surface a message the user can act on.
  if (isUpstreamQuotaPayload(response)) {
    throw new Error(`BIMA AI error 429: kuota layanan AI sedang mencapai batas${quotaResetHint(response)}. Coba lagi setelah kuota direset.`);
  }
  return { response, sources, model: modelUsed };
}

/**
 * True when a body is an upstream provider quota/rate-limit payload rather than an answer.
 * Deliberately narrow: the English provider signatures only, plus a length cap and a check
 * that the text is not a recipe JSON — a real answer (recipe or prose) never satisfies it.
 */
export function isUpstreamQuotaPayload(text: string): boolean {
  const t = (text || '').trim();
  if (!t || t.length > 700) return false;
  if (/"\s*title\s*"/.test(t)) return false;
  return /\[429\]|usage limit|rate limit|too many requests|exceeded your current quota/i.test(t);
}

/**
 * True when an error means the AI service could not answer (quota exhausted, timeout,
 * backend/network failure) rather than the request being refused. The UI uses this to
 * keep the real error text AND offer local, no-AI alternatives instead of a dead end.
 */
export function isAiUnavailableError(err: unknown): boolean {
  const msg = String((err as any)?.message ?? err ?? '');
  return /kuota layanan AI|BIMA AI error 429|\[429\]|usage limit|rate limit|too many requests|timeout|abort|failed to fetch|backend error|Server AI gagal merespons|empty response|tidak memberikan respons yang valid/i.test(msg);
}

/** Pull the provider's reset timestamp out of a quota payload so the user knows when to retry. */
function quotaResetHint(text: string): string {
  const iso = text.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)/);
  if (!iso) return '';
  const d = new Date(iso[1]);
  if (Number.isNaN(d.getTime())) return '';
  const fmt = d.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
  return ` (reset sekitar ${fmt} WIB)`;
}

/** Attempt to repair a truncated JSON string by closing open brackets/braces/strings. */
function repairTruncatedJson(s: string): string | null {
  // Close any open string value
  let text = s;
  // Count unmatched quotes (simple: count non-escaped quotes, odd = open string)
  const quotes = text.match(/(?<!\\)"/g);
  if (quotes && quotes.length % 2 !== 0) {
    // Last quote is unclosed — close the string
    text += '"';
  }

  // Track open { and [ (ignoring those inside strings — simplified: count all)
  const stack: string[] = [];
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' && (i === 0 || text[i - 1] !== '\\')) {
      inString = !inString;
    }
    if (inString) continue;
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }

  // Also close any trailing comma before closing
  text = text.replace(/,\s*$/, '');

  // Append closing brackets in reverse order
  while (stack.length > 0) {
    text += stack.pop();
  }

  return text;
}

/** Parse a recipe JSON from LLM text (tolerant of markdown fences, prose & minor JSON defects). */
export function extractJsonFromLlm(text: string): Record<string, any> | null {
  if (!text) return null;

  const tryParse = (s: string): Record<string, any> | null => {
    try {
      const v = JSON.parse(s);
      return v && typeof v === 'object' ? v : null;
    } catch {
      return null;
    }
  };

  const candidates: string[] = [text.trim()];

  const fenced = text.replace(/```json/gi, '```').split('```');
  for (let i = 0; i < fenced.length; i++) {
    const block = fenced[i].trim();
    if (block.startsWith('{') || block.startsWith('[')) candidates.push(block);
  }

  const start = text.search(/[{[]/);
  if (start !== -1) {
    const open = text[start];
    const close = open === '{' ? '}' : ']';
    const lastClose = text.lastIndexOf(close);
    if (lastClose > start) candidates.push(text.slice(start, lastClose + 1));
  }

  for (const raw of candidates) {
    const direct = tryParse(raw);
    if (direct) return direct;
    const repaired = raw.replace(/(?<=[,{]\s*)"([^"]+)"\s*,/g, '"$1": null,');
    const fixed = tryParse(repaired);
    if (fixed) return fixed;
  }

  // 🔧 NEW: try to repair truncated JSON by auto-closing brackets/braces
  const firstCandidate = candidates[0];
  if (firstCandidate && /^\s*\{/.test(firstCandidate)) {
    const repaired = repairTruncatedJson(firstCandidate);
    if (repaired) {
      const parsed = tryParse(repaired);
      if (parsed) return parsed;
    }
  }

  return null;
}