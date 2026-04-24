import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertRequiredEnv,
  bucketExists,
  renderWranglerWithR2Binding,
  resolveR2BucketName,
  resolveCloudflareAccountId,
  resolveCloudflareApiToken,
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

// 修改点：覆盖 R2 桶名优先读取显式配置
test('resolveR2BucketName uses configured name when provided', () => {
  assert.equal(resolveR2BucketName({ R2_BUCKET_NAME: 'custom-bucket' }), 'custom-bucket');
});

// 修改点：覆盖 R2 桶名缺省回退默认值
test('resolveR2BucketName falls back to default when missing', () => {
  assert.equal(resolveR2BucketName({}), 'yaos-bucket');
});

// 修改点：覆盖 Cloudflare Account ID 兼容解析（优先 CF_ACCOUNT_ID）
test('resolveCloudflareAccountId prefers CF_ACCOUNT_ID', () => {
  assert.equal(
    resolveCloudflareAccountId({
      CF_ACCOUNT_ID: 'cf-id',
      CLOUDFLARE_ACCOUNT_ID: 'cloudflare-id',
    }),
    'cf-id',
  );
});

// 修改点：覆盖 Cloudflare Account ID 回退解析
test('resolveCloudflareAccountId falls back to CLOUDFLARE_ACCOUNT_ID', () => {
  assert.equal(resolveCloudflareAccountId({ CLOUDFLARE_ACCOUNT_ID: 'cloudflare-id' }), 'cloudflare-id');
});

// 修改点：覆盖 Cloudflare API Token 兼容解析（优先 CF_API_TOKEN）
test('resolveCloudflareApiToken prefers CF_API_TOKEN', () => {
  assert.equal(
    resolveCloudflareApiToken({
      CF_API_TOKEN: 'cf-token',
      CLOUDFLARE_API_TOKEN: 'cloudflare-token',
    }),
    'cf-token',
  );
});

// 修改点：覆盖 Cloudflare API Token 回退解析
test('resolveCloudflareApiToken falls back to CLOUDFLARE_API_TOKEN', () => {
  assert.equal(resolveCloudflareApiToken({ CLOUDFLARE_API_TOKEN: 'cloudflare-token' }), 'cloudflare-token');
});

// 修改点：覆盖必填环境变量缺失时抛错（仅 Cloudflare 认证信息）
test('assertRequiredEnv throws on missing account id', () => {
  assert.throws(() => {
    assertRequiredEnv({
      CF_ACCOUNT_ID: '',
      CF_API_TOKEN: 'token',
    });
  }, /CF_ACCOUNT_ID or CLOUDFLARE_ACCOUNT_ID/);
});
