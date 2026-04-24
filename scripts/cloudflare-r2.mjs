import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 修改点：新增 R2 桶名解析函数（优先显式配置，缺省回退默认值）
export function resolveR2BucketName(env) {
  const configured = env?.R2_BUCKET_NAME;
  if (configured && String(configured).trim() !== '') {
    return String(configured).trim();
  }
  return 'yaos-bucket';
}

// 修改点：新增 Cloudflare 账号 ID 解析（兼容 CF_* 与 CLOUDFLARE_*）
export function resolveCloudflareAccountId(env) {
  const value = env?.CF_ACCOUNT_ID || env?.CLOUDFLARE_ACCOUNT_ID;
  if (!value || String(value).trim() === '') {
    return '';
  }
  return String(value).trim();
}

// 修改点：新增 Cloudflare API Token 解析（兼容 CF_* 与 CLOUDFLARE_*）
export function resolveCloudflareApiToken(env) {
  const value = env?.CF_API_TOKEN || env?.CLOUDFLARE_API_TOKEN;
  if (!value || String(value).trim() === '') {
    return '';
  }
  return String(value).trim();
}

// 修改点：新增必填环境变量校验函数
export function assertRequiredEnv(env) {
  if (!resolveCloudflareAccountId(env)) {
    throw new Error('Missing required env: CF_ACCOUNT_ID or CLOUDFLARE_ACCOUNT_ID');
  }
  if (!resolveCloudflareApiToken(env)) {
    throw new Error('Missing required env: CF_API_TOKEN or CLOUDFLARE_API_TOKEN');
  }
}

// 修改点：新增桶存在性判断纯函数
export function bucketExists(buckets, targetName) {
  return (buckets || []).some((bucket) => bucket?.name === targetName);
}

// 修改点：新增 wrangler R2 绑定注入纯函数（幂等）
export function renderWranglerWithR2Binding(content, binding, bucketName) {
  const marker = `binding = "${binding}"`;
  if (content.includes('[[r2_buckets]]') && content.includes(marker)) {
    return content;
  }

  return `${content.trimEnd()}\n\n[[r2_buckets]]\nbinding = "${binding}"\nbucket_name = "${bucketName}"\n`;
}

async function cfFetch(pathname, options = {}) {
  const baseUrl = 'https://api.cloudflare.com/client/v4';
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${resolveCloudflareApiToken(process.env)}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  let data;
  try {
    data = await response.json();
  } catch {
    const body = await response.text().catch(() => '');
    throw new Error(`Cloudflare API non-JSON error: ${response.status} ${pathname} ${body}`);
  }

  if (!response.ok || data?.success === false) {
    const errors = data?.errors ? JSON.stringify(data.errors) : JSON.stringify(data);
    throw new Error(`Cloudflare API error: ${response.status} ${pathname} ${errors}`);
  }
  return data;
}

async function ensureBucket() {
  assertRequiredEnv(process.env);

  const accountId = process.env.CF_ACCOUNT_ID;
  const bucketName = resolveR2BucketName(process.env);

  const listResult = await cfFetch(`/accounts/${accountId}/r2/buckets`);
  const buckets = listResult?.result?.buckets || listResult?.result || [];

  if (bucketExists(buckets, bucketName)) {
    console.log(`R2 bucket exists: ${bucketName}`);
    return;
  }

  try {
    await cfFetch(`/accounts/${accountId}/r2/buckets`, {
      method: 'POST',
      body: JSON.stringify({ name: bucketName }),
    });
    console.log(`R2 bucket created: ${bucketName}`);
  } catch (createError) {
    // 修改点：并发创建冲突时回查；若回查失败，保留原始创建错误上下文
    try {
      const relistResult = await cfFetch(`/accounts/${accountId}/r2/buckets`);
      const relistedBuckets = relistResult?.result?.buckets || relistResult?.result || [];
      if (bucketExists(relistedBuckets, bucketName)) {
        console.log(`R2 bucket already exists after create race: ${bucketName}`);
        return;
      }
    } catch {
      // ignore relist error and throw original create error below
    }
    throw createError;
  }
}

async function writeWranglerCiConfig() {
  const basePath = process.env.WRANGLER_BASE_PATH || path.join('server', 'wrangler.toml');
  const outPath = process.env.WRANGLER_OUT_PATH || path.join('server', 'wrangler.ci.toml');
  const binding = process.env.R2_BINDING_NAME || 'YAOS_BUCKET';
  const bucketName = resolveR2BucketName(process.env);

  if (!bucketName || String(bucketName).trim() === '') {
    throw new Error('Missing required env: R2_BUCKET_NAME');
  }

  const content = await fs.readFile(basePath, 'utf8');
  const rendered = renderWranglerWithR2Binding(content, binding, bucketName);
  await fs.writeFile(outPath, rendered, 'utf8');
  console.log(`Generated ${outPath}`);
}

async function main() {
  const command = process.argv[2];
  if (command === 'ensure-bucket') {
    await ensureBucket();
    return;
  }

  if (command === 'write-wrangler-ci') {
    await writeWranglerCiConfig();
    return;
  }

  throw new Error('Usage: node scripts/cloudflare-r2.mjs <ensure-bucket|write-wrangler-ci>');
}

const currentFilePath = fileURLToPath(import.meta.url);
const invokedFilePath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedFilePath && currentFilePath === invokedFilePath) {
  main().catch((error) => {
    console.error(error?.message || error);
    process.exit(1);
  });
}
