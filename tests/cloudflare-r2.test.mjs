import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertRequiredEnv,
  bucketExists,
  renderWranglerWithR2Binding,
} from '../scripts/cloudflare-r2.mjs';

// 修改点：覆盖 bucketExists 命中场景
test('bucketExists returns true when bucket name matches', () => {
  const list = [{ name: 'yaos-bucket' }, { name: 'other' }];
  assert.equal(bucketExists(list, 'yaos-bucket'), true);
});

// 修改点：覆盖 bucketExists 未命中场景
test('bucketExists returns false when bucket name not found', () => {
  const list = [{ name: 'other' }];
  assert.equal(bucketExists(list, 'yaos-bucket'), false);
});

// 修改点：覆盖 wrangler R2 绑定注入幂等行为
test('renderWranglerWithR2Binding appends r2 section once', () => {
  const base = 'name = "yaos"\nmain = "src/index.ts"\n';
  const out1 = renderWranglerWithR2Binding(base, 'YAOS_BUCKET', 'yaos-bucket');
  const out2 = renderWranglerWithR2Binding(out1, 'YAOS_BUCKET', 'yaos-bucket');
  assert.match(out1, /\[\[r2_buckets\]\]/);
  assert.equal((out2.match(/\[\[r2_buckets\]\]/g) || []).length, 1);
});

// 修改点：覆盖必填环境变量缺失时抛错
test('assertRequiredEnv throws on missing env', () => {
  assert.throws(() => {
    assertRequiredEnv({
      CF_ACCOUNT_ID: '',
      CF_API_TOKEN: 'token',
      R2_BUCKET_NAME: 'yaos-bucket',
    });
  }, /CF_ACCOUNT_ID/);
});
