const BASE = '/api/grok-oauth';

export const GROK_OAUTH_PRIVATE_DISABLED_MESSAGE = 'Grok OAuth 私有模块未启用，请使用带私有模块的本地版本。';

export interface GrokOAuthStatus {
  available?: boolean;
  loggedIn?: boolean;
  moduleEnabled?: boolean;
  user?: string;
  account?: string;
  expiresAt?: string;
  message?: string;
  [key: string]: any;
}

export interface GrokOAuthMaterialPayload {
  prompt?: string;
  promptResolved?: string;
  text?: string;
  model?: string;
  mode?: string;
  images?: string[];
  videos?: string[];
  audios?: string[];
  ratio?: string;
  aspectRatio?: string;
  resolution?: string;
  duration?: number;
  voiceId?: string;
  language?: string;
  outputFormat?: string;
  messages?: Array<Record<string, any>>;
  [key: string]: any;
}

export interface GrokOAuthMediaResult {
  imageUrl?: string;
  imageUrls?: string[];
  videoUrl?: string;
  videoUrls?: string[];
  audioUrl?: string;
  audioUrls?: string[];
  remoteImageUrls?: string[];
  remoteVideoUrls?: string[];
  remoteAudioUrls?: string[];
  text?: string;
  prompt?: string;
  reply?: string;
  requestId?: string;
  status?: string;
  progress?: number;
  message?: string;
  [key: string]: any;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // ignore non-json body
  }
  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
  }
  return (data?.data ?? data) as T;
}

export async function getGrokOAuthStatus(): Promise<GrokOAuthStatus> {
  return requestJson<GrokOAuthStatus>(`${BASE}/status`);
}

export async function startGrokOAuthLogin(payload: Record<string, any> = {}): Promise<Record<string, any>> {
  return requestJson<Record<string, any>>(`${BASE}/login/start`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function pollGrokOAuthLogin(payload: Record<string, any> = {}): Promise<Record<string, any>> {
  return requestJson<Record<string, any>>(`${BASE}/login/poll`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function completeGrokOAuthLogin(payload: Record<string, any> = {}): Promise<Record<string, any>> {
  return requestJson<Record<string, any>>(`${BASE}/login/complete`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function logoutGrokOAuth(): Promise<Record<string, any>> {
  return requestJson<Record<string, any>>(`${BASE}/logout`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

function parseSseEvent(raw: string): any | null {
  const dataLines = raw
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart());
  if (dataLines.length === 0) return null;
  const text = dataLines.join('\n');
  if (!text || text === '[DONE]') return { done: true };
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

export function extractGrokStreamDeltaForTests(event: any): { delta: string; done: boolean; error?: string } {
  if (!event) return { delta: '', done: false };
  if (event.done) return { delta: '', done: true };
  if (event.error) return { delta: '', done: false, error: String(event.error) };
  if (event.type === 'error') return { delta: '', done: false, error: String(event.message || event.error || 'Grok OAuth 流式输出失败') };
  if (event.type === 'response.completed' || event.type === 'done' || event.event === 'done') return { delta: '', done: true };

  const delta =
    event.delta ||
    event.text_delta ||
    event.output_text_delta ||
    event.outputTextDelta ||
    (event.type === 'response.output_text.delta' ? event.delta : '') ||
    event.choices?.[0]?.delta?.content ||
    event.choices?.[0]?.text ||
    event.output_text ||
    event.text ||
    event.content ||
    '';
  return { delta: typeof delta === 'string' ? delta : '', done: false };
}

export async function streamGrokOAuthChat(
  payload: GrokOAuthMaterialPayload,
  options: {
    signal?: AbortSignal;
    onDelta?: (delta: string, event?: any) => void;
    onEvent?: (event: any) => void;
  } = {},
): Promise<string> {
  const res = await fetch(`${BASE}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: options.signal,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      msg = data.error || data.message || msg;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  if (!res.body) throw new Error('浏览器不支持流式读取。');

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let reply = '';

  const consumeEvent = (raw: string) => {
    const event = parseSseEvent(raw);
    if (!event) return false;
    options.onEvent?.(event);
    const parsed = extractGrokStreamDeltaForTests(event);
    if (parsed.error) throw new Error(parsed.error);
    if (parsed.delta) {
      reply += parsed.delta;
      options.onDelta?.(parsed.delta, event);
    }
    return parsed.done;
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let splitAt = buffer.indexOf('\n\n');
    while (splitAt >= 0) {
      const chunk = buffer.slice(0, splitAt);
      buffer = buffer.slice(splitAt + 2);
      if (consumeEvent(chunk)) return reply;
      splitAt = buffer.indexOf('\n\n');
    }
  }
  if (buffer.trim()) consumeEvent(buffer);
  return reply;
}

export async function generateGrokOAuthImage(payload: GrokOAuthMaterialPayload): Promise<GrokOAuthMediaResult> {
  return requestJson<GrokOAuthMediaResult>(`${BASE}/image`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function submitGrokOAuthVideo(payload: GrokOAuthMaterialPayload): Promise<GrokOAuthMediaResult> {
  return requestJson<GrokOAuthMediaResult>(`${BASE}/video/submit`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function queryGrokOAuthVideoStatus(payload: Record<string, any>): Promise<GrokOAuthMediaResult> {
  return requestJson<GrokOAuthMediaResult>(`${BASE}/video/status`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function generateGrokOAuthTts(payload: GrokOAuthMaterialPayload): Promise<GrokOAuthMediaResult> {
  return requestJson<GrokOAuthMediaResult>(`${BASE}/audio/tts`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function transcribeGrokOAuthAudio(payload: GrokOAuthMaterialPayload): Promise<GrokOAuthMediaResult> {
  return requestJson<GrokOAuthMediaResult>(`${BASE}/audio/stt`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
