// 生成任务进度展示估算
//
// 背景:/api/proxy/image/status 的多数上游模型不返回真实 progress
// (backend/src/routes/proxy.js 恒返 '0%'),导致节点"生成中"进度长时间静止。
// 这里按轮询次数线性估算(5% 起步,每 2 次轮询 +1%,封顶 95%),
// 上游真实进度更大时优先采用真实值;最终 100% 由各节点完成分支写入。
export function estimateGenerationProgress(realProgress: string | undefined, pollIndex: number): string {
  const realPct = Number.parseInt(String(realProgress ?? ''), 10) || 0;
  const estimatedPct = Math.min(95, 5 + Math.floor(pollIndex / 2));
  return `${Math.max(realPct, estimatedPct)}%`;
}
