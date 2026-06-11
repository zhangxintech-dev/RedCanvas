import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateGenerationProgress } from '../src/utils/generationProgress.ts';

test('estimateGenerationProgress advances with poll count when upstream stays at 0%', () => {
  assert.equal(estimateGenerationProgress('0%', 0), '5%');
  assert.equal(estimateGenerationProgress(undefined, 0), '5%');
  assert.equal(estimateGenerationProgress('', 0), '5%');
  assert.equal(estimateGenerationProgress('0%', 2), '6%');
  assert.equal(estimateGenerationProgress('0%', 60), '35%');
  // 长任务封顶 95%,100% 由完成分支写入
  assert.equal(estimateGenerationProgress('0%', 1799), '95%');
});

test('estimateGenerationProgress prefers larger real upstream progress', () => {
  assert.equal(estimateGenerationProgress('50%', 0), '50%');
  assert.equal(estimateGenerationProgress('80%', 10), '80%');
  assert.equal(estimateGenerationProgress('100%', 0), '100%');
  // 估算追上真实值后取较大者,进度不回退
  assert.equal(estimateGenerationProgress('10%', 60), '35%');
});
