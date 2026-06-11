import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('Grok OAuth Agent is registered as an independent public-shell node', () => {
  const types = read('../src/types/canvas.ts');
  const registry = read('../src/config/nodeRegistry.ts');
  const ports = read('../src/config/portTypes.ts');
  const canvas = read('../src/components/Canvas.tsx');
  const sidebar = read('../src/components/Sidebar.tsx');
  const features = read('../features.json');

  assert.match(types, /'grok-oauth-agent'/);
  assert.match(types, /'grok'/);
  assert.match(registry, /label:\s*'GROK OAuth'/);
  assert.match(registry, /type:\s*'grok-oauth-agent'/);
  assert.match(registry, /category:\s*'grok'/);
  assert.match(ports, /'grok-oauth-agent':\s*\{\s*inputs:\s*\['text', 'image', 'video', 'audio'\],\s*outputs:\s*\['text', 'image', 'video', 'audio'\]/);
  assert.match(canvas, /GrokOAuthAgentNode/);
  assert.match(canvas, /import\('\.\/nodes\/GrokOAuthAgentNode'\)/);
  assert.match(canvas, /'grok-oauth-agent': GrokOAuthAgentNode/);
  assert.match(sidebar, /'grok-oauth-agent': 'Bot'/);
  assert.match(features, /grokOAuthAgentPublicShell/);
});

test('Grok OAuth public backend exposes hook-backed routes with private-module fallback', () => {
  const route = read('../backend/src/routes/grokOAuth.js');
  const server = read('../backend/src/server.js');

  assert.match(server, /const grokOAuthRouter = require\('\.\/routes\/grokOAuth'\)/);
  assert.match(server, /app\.use\('\/api\/grok-oauth', grokOAuthRouter\)/);
  assert.match(route, /Grok OAuth 私有模块未启用，请使用带私有模块的本地版本。/);
  assert.match(route, /runLocalHooks\(`grokOAuth\.\$\{action\}`/);
  assert.match(route, /router\.get\('\/status'/);
  assert.match(route, /router\.post\('\/login\/start'/);
  assert.match(route, /router\.post\('\/login\/poll'/);
  assert.match(route, /router\.post\('\/login\/complete'/);
  assert.match(route, /router\.post\('\/logout'/);
  assert.match(route, /router\.post\('\/chat\/stream'/);
  assert.match(route, /router\.post\('\/image'/);
  assert.match(route, /router\.post\('\/video\/submit'/);
  assert.match(route, /router\.post\('\/video\/status'/);
  assert.match(route, /router\.post\('\/audio\/tts'/);
  assert.match(route, /router\.post\('\/audio\/stt'/);
  assert.match(route, /saveOneMediaOutput/);
  assert.match(route, /\/files\/output\//);
});

test('Grok OAuth frontend service and node support streaming and multimodal outputs', () => {
  const service = read('../src/services/grokOAuth.ts');
  const node = read('../src/components/nodes/GrokOAuthAgentNode.tsx');

  assert.match(service, /streamGrokOAuthChat/);
  assert.match(service, /completeGrokOAuthLogin/);
  assert.match(service, /response\.output_text\.delta/);
  assert.match(service, /choices\?\.\[0\]\?\.delta\?\.content/);
  assert.match(service, /generateGrokOAuthImage/);
  assert.match(service, /submitGrokOAuthVideo/);
  assert.match(service, /generateGrokOAuthTts/);
  assert.match(service, /transcribeGrokOAuthAudio/);
  assert.match(node, /流式聊天/);
  assert.match(node, /无法建立连接/);
  assert.match(node, /完成授权/);
  assert.match(node, /imageUrl/);
  assert.match(node, /videoUrl/);
  assert.match(node, /audioUrl/);
  assert.match(node, /outputText/);
  assert.match(node, /MentionPromptInput/);
  assert.match(node, /useUpstreamMaterials/);
  assert.match(node, /useRunTrigger\(id, handleRun, 'grok-oauth-agent'\)/);
});
