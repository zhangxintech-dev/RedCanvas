'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const { runLocalHooks } = require('../extensions/runtimeHooks');

const router = express.Router();

const PRIVATE_DISABLED_MESSAGE = 'Grok OAuth 私有模块未启用，请使用带私有模块的本地版本。';

function disabledPayload(extra = {}) {
  return {
    success: false,
    code: 'grok_oauth_private_module_missing',
    error: PRIVATE_DISABLED_MESSAGE,
    data: {
      available: false,
      moduleEnabled: false,
      message: PRIVATE_DISABLED_MESSAGE,
      ...extra,
    },
  };
}

function statusPayload(extra = {}) {
  return {
    success: true,
    data: {
      available: false,
      loggedIn: false,
      moduleEnabled: false,
      message: PRIVATE_DISABLED_MESSAGE,
      ...extra,
    },
  };
}

function outputExtFromMime(mime, fallback = '.png') {
  const text = String(mime || '').toLowerCase();
  if (text.includes('mp4')) return '.mp4';
  if (text.includes('webm')) return '.webm';
  if (text.includes('quicktime')) return '.mov';
  if (text.includes('mpeg') || text.includes('mp3')) return '.mp3';
  if (text.includes('wav')) return '.wav';
  if (text.includes('ogg')) return '.ogg';
  if (text.includes('flac')) return '.flac';
  if (text.includes('aac')) return '.aac';
  if (text.includes('jpeg') || text.includes('jpg')) return '.jpg';
  if (text.includes('webp')) return '.webp';
  if (text.includes('gif')) return '.gif';
  if (text.includes('bmp')) return '.bmp';
  if (text.includes('png')) return '.png';
  return fallback;
}

function outputExtFromUrl(url, fallback = '.png') {
  try {
    const parsed = new URL(url);
    const ext = path.extname(parsed.pathname).toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.mp4', '.webm', '.mov', '.m4v', '.mp3', '.wav', '.ogg', '.flac', '.aac'].includes(ext)) {
      return ext;
    }
  } catch {
    // ignore
  }
  return fallback;
}

function defaultExtForKind(kind) {
  if (kind === 'video') return '.mp4';
  if (kind === 'audio') return '.mp3';
  return '.png';
}

function writeOutputBuffer(buffer, ext) {
  if (!fs.existsSync(config.OUTPUT_DIR)) fs.mkdirSync(config.OUTPUT_DIR, { recursive: true });
  const suffix = crypto.randomBytes(4).toString('hex');
  const filename = `grok_oauth_${Date.now()}_${suffix}${ext || '.png'}`;
  fs.writeFileSync(path.join(config.OUTPUT_DIR, filename), buffer);
  return `/files/output/${filename}`;
}

async function saveOneMediaOutput(url, kind = 'image') {
  const text = String(url || '').trim();
  if (!text) return '';
  if (text.startsWith('/files/output/') || text.startsWith('/files/input/')) return text;
  const dataMatch = text.match(/^data:([^;,]+);base64,(.+)$/i);
  if (dataMatch) {
    return writeOutputBuffer(Buffer.from(dataMatch[2], 'base64'), outputExtFromMime(dataMatch[1], defaultExtForKind(kind)));
  }
  if (/^https?:\/\//i.test(text)) {
    const res = await fetch(text);
    if (!res.ok) throw new Error(`下载 Grok OAuth 输出失败：HTTP ${res.status}`);
    const mime = typeof res.headers?.get === 'function' ? res.headers.get('content-type') : '';
    const ext = outputExtFromMime(mime, outputExtFromUrl(text, defaultExtForKind(kind)));
    return writeOutputBuffer(Buffer.from(await res.arrayBuffer()), ext);
  }
  return text;
}

function arrayOf(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}

async function normalizeMediaOutputs(data = {}) {
  const patch = {};
  const remoteImageUrls = arrayOf(data.imageUrls || data.images || data.urls).concat(arrayOf(data.imageUrl));
  const remoteVideoUrls = arrayOf(data.videoUrls || data.videos).concat(arrayOf(data.videoUrl));
  const remoteAudioUrls = arrayOf(data.audioUrls || data.audios).concat(arrayOf(data.audioUrl));

  if (remoteImageUrls.length > 0) {
    patch.remoteImageUrls = remoteImageUrls;
    patch.imageUrls = [];
    for (const url of remoteImageUrls) patch.imageUrls.push(await saveOneMediaOutput(url, 'image'));
    patch.imageUrl = patch.imageUrls[0] || '';
  }
  if (remoteVideoUrls.length > 0) {
    patch.remoteVideoUrls = remoteVideoUrls;
    patch.videoUrls = [];
    for (const url of remoteVideoUrls) patch.videoUrls.push(await saveOneMediaOutput(url, 'video'));
    patch.videoUrl = patch.videoUrls[0] || '';
  }
  if (remoteAudioUrls.length > 0) {
    patch.remoteAudioUrls = remoteAudioUrls;
    patch.audioUrls = [];
    for (const url of remoteAudioUrls) patch.audioUrls.push(await saveOneMediaOutput(url, 'audio'));
    patch.audioUrl = patch.audioUrls[0] || '';
  }
  return patch;
}

async function runGrokHook(action, payload = {}) {
  return runLocalHooks(`grokOAuth.${action}`, {
    action,
    handled: false,
    config,
    ...payload,
  });
}

function sendHookJson(res, hookResult, fallbackStatus = 501, fallbackExtra = {}) {
  if (!hookResult?.handled) {
    return res.status(fallbackStatus).json(disabledPayload(fallbackExtra));
  }
  const status = Number(hookResult.status || hookResult.statusCode || 200);
  const ok = hookResult.success !== false && hookResult.ok !== false;
  const data = hookResult.data && typeof hookResult.data === 'object' ? hookResult.data : { ...hookResult };
  delete data.handled;
  delete data.config;
  delete data.action;
  delete data.status;
  delete data.statusCode;
  return res.status(status).json({
    success: ok,
    code: hookResult.code,
    error: ok ? undefined : (hookResult.error || hookResult.message || 'Grok OAuth 调用失败'),
    data,
  });
}

router.get('/status', async (_req, res) => {
  try {
    const result = await runGrokHook('status');
    if (!result?.handled) return res.json(statusPayload());
    const data = result.data && typeof result.data === 'object' ? result.data : result;
    return res.json({
      success: result.success !== false && result.ok !== false,
      code: result.code,
      error: result.error,
      data: {
        available: true,
        moduleEnabled: true,
        ...data,
        handled: undefined,
        config: undefined,
        action: undefined,
      },
    });
  } catch (e) {
    return res.status(500).json({ success: false, code: 'grok_oauth_status_failed', error: e?.message || String(e) });
  }
});

router.post('/login/start', async (req, res) => {
  try {
    const result = await runGrokHook('loginStart', { body: req.body || {} });
    return sendHookJson(res, result);
  } catch (e) {
    return res.status(500).json({ success: false, code: 'grok_oauth_login_start_failed', error: e?.message || String(e) });
  }
});

router.post('/login/poll', async (req, res) => {
  try {
    const result = await runGrokHook('loginPoll', { body: req.body || {} });
    return sendHookJson(res, result);
  } catch (e) {
    return res.status(500).json({ success: false, code: 'grok_oauth_login_poll_failed', error: e?.message || String(e) });
  }
});

router.post('/login/complete', async (req, res) => {
  try {
    const result = await runGrokHook('loginComplete', { body: req.body || {} });
    if (!result?.handled) {
      const fallback = await runGrokHook('loginPoll', { body: req.body || {} });
      return sendHookJson(res, fallback);
    }
    return sendHookJson(res, result);
  } catch (e) {
    return res.status(500).json({ success: false, code: 'grok_oauth_login_complete_failed', error: e?.message || String(e) });
  }
});

router.post('/logout', async (req, res) => {
  try {
    const result = await runGrokHook('logout', { body: req.body || {} });
    return sendHookJson(res, result);
  } catch (e) {
    return res.status(500).json({ success: false, code: 'grok_oauth_logout_failed', error: e?.message || String(e) });
  }
});

router.post('/chat/stream', async (req, res) => {
  try {
    const result = await runGrokHook('chatStream', { req, res, body: req.body || {} });
    if (result?.handled) return undefined;
    return res.status(501).json(disabledPayload({ mode: 'chat' }));
  } catch (e) {
    if (!res.headersSent) {
      return res.status(500).json({ success: false, code: 'grok_oauth_chat_stream_failed', error: e?.message || String(e) });
    }
    try {
      res.write(`event: error\ndata: ${JSON.stringify({ error: e?.message || String(e) })}\n\n`);
      res.end();
    } catch {
      // response may already be closed
    }
    return undefined;
  }
});

router.post('/image', async (req, res) => {
  try {
    const result = await runGrokHook('image', { body: req.body || {} });
    if (!result?.handled) return res.status(501).json(disabledPayload({ mode: 'image' }));
    const mediaPatch = await normalizeMediaOutputs(result.data || result);
    result.data = { ...(result.data || result), ...mediaPatch };
    return sendHookJson(res, result);
  } catch (e) {
    return res.status(500).json({ success: false, code: 'grok_oauth_image_failed', error: e?.message || String(e) });
  }
});

router.post('/video/submit', async (req, res) => {
  try {
    const result = await runGrokHook('videoSubmit', { body: req.body || {} });
    if (!result?.handled) return res.status(501).json(disabledPayload({ mode: 'video' }));
    const mediaPatch = await normalizeMediaOutputs(result.data || result);
    result.data = { ...(result.data || result), ...mediaPatch };
    return sendHookJson(res, result);
  } catch (e) {
    return res.status(500).json({ success: false, code: 'grok_oauth_video_submit_failed', error: e?.message || String(e) });
  }
});

router.post('/video/status', async (req, res) => {
  try {
    const result = await runGrokHook('videoStatus', { body: req.body || {} });
    if (!result?.handled) return res.status(501).json(disabledPayload({ mode: 'video' }));
    const mediaPatch = await normalizeMediaOutputs(result.data || result);
    result.data = { ...(result.data || result), ...mediaPatch };
    return sendHookJson(res, result);
  } catch (e) {
    return res.status(500).json({ success: false, code: 'grok_oauth_video_status_failed', error: e?.message || String(e) });
  }
});

router.post('/audio/tts', async (req, res) => {
  try {
    const result = await runGrokHook('tts', { body: req.body || {} });
    if (!result?.handled) return res.status(501).json(disabledPayload({ mode: 'tts' }));
    const mediaPatch = await normalizeMediaOutputs(result.data || result);
    result.data = { ...(result.data || result), ...mediaPatch };
    return sendHookJson(res, result);
  } catch (e) {
    return res.status(500).json({ success: false, code: 'grok_oauth_tts_failed', error: e?.message || String(e) });
  }
});

router.post('/audio/stt', async (req, res) => {
  try {
    const result = await runGrokHook('stt', { body: req.body || {} });
    return sendHookJson(res, result, 501, { mode: 'stt' });
  } catch (e) {
    return res.status(500).json({ success: false, code: 'grok_oauth_stt_failed', error: e?.message || String(e) });
  }
});

module.exports = router;
module.exports.PRIVATE_DISABLED_MESSAGE = PRIVATE_DISABLED_MESSAGE;
