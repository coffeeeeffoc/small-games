import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { root } from './company-deployment.mjs';
import { prepareControl } from './deploy-admin.mjs';
import { writeBackendBundle } from './deploy-backend.mjs';
import { releaseVersion } from './night-build-version.mjs';

export function preparationInput(args) {
  const { values } = parseArgs({ args, options: { version: { type: 'string' } } });
  return { backendVersion: releaseVersion(values.version) };
}

export async function writePreparation(directory, control, runtime, workspace = root) {
  assert.equal(control.manifest.sourceSHA, runtime.sourceSHA, 'CANDIDATE_MISMATCH');
  const migrations = {};
  await mkdir(path.join(directory, 'migrations'));
  for (const name of [
    '016-night-chat.sql',
    '017-night-presence.sql',
    '018-night-direct-messages.sql',
  ]) {
    const bytes = await readFile(path.join(workspace, 'infra/migrations', name));
    await writeFile(path.join(directory, 'migrations', name), bytes, { flag: 'wx' });
    migrations[name] = createHash('sha256').update(bytes).digest('hex');
  }
  const receipt = {
    sourceSHA: runtime.sourceSHA,
    backendVersion: runtime.backendVersion,
    controlBundle: path.relative(directory, control.directory).replaceAll('\\', '/'),
    runtimeBundle: 'runtime',
    migrations,
    deployed: false,
    remoteInspected: false,
    databaseBackupVerified: false,
    migrationRehearsed: false,
  };
  await writeFile(
    path.join(directory, 'preparation.json'),
    JSON.stringify(receipt, null, 2) + '\n',
    { flag: 'wx' },
  );
  await writeFile(
    path.join(directory, '上线顺序.md'),
    `# 夜航服务端准备包

源码：${runtime.sourceSHA}，Runtime 候选版本：${runtime.backendVersion}。本脚本只在本地构建和复制材料，没有 SSH、上传、迁移、重启或发布操作；正式执行前须重新核对远端版本与本候选。

1. 只读核对现网 Runtime/管理台镜像、控制库版本、016/017/018、网关和版本运营配置。不要直接运行首次安装脚本或通用 deploy.sh。
2. 按现有控制台部署流程完成二进制数据库备份，在隔离 PostgreSQL 恢复并比较旧表行数与摘要。控制库低于 v5 时，通过 controlBundle 中既有控制库恢复流程预演并应用 005-night-operations；不能直接跳过旧版本兼容检查。
3. 016/017 是 018 的前置，仅补现网缺失项。在恢复副本执行 018 两次，核对旧表、聊天序列、权限和数据不变，新表约束/索引有效；再用新 Runtime 验证在线/忙碌状态、好友接受、永久历史分页与已读、离线留言、第三方不可见、忙碌拒邀、战后留房再战和旧客户端公开聊天。
4. 维护窗口先应用已预演的缺失迁移，再激活同一候选的 Runtime 和配套管理服务/UI。核对健康、网关的 /social 精确路径、版本准入和新旧客户端；最后才择机更新客户端渠道包。
5. 保留旧镜像、备份和全部回执。018 独立于公共聊天表，旧 Runtime 不会读到私信；但控制库 v5 不能切回不支持它的旧应用。schema 摘要变化可能使旧 journal 的 SCHEMA_CHANGED 守卫拒绝回滚，不要强制绕过；数据库恢复与应用回退须分别确认，并防止丢失迁移后的玩家写入。

准备包不是上线验收。preparation.json 中的 false 必须保持真实，正式上线另建回执。
`,
    { flag: 'wx' },
  );
  return receipt;
}

export async function main(args = process.argv.slice(2)) {
  const { backendVersion } = preparationInput(args);
  const control = await prepareControl();
  const directory = path.join(root, 'outputs/night-server-preparation', control.manifest.release);
  await mkdir(directory, { recursive: true });
  const runtime = await writeBackendBundle(path.join(directory, 'runtime'), {
    head: control.manifest.sourceSHA,
    release: control.manifest.release,
    services: ['runtime'],
    backendVersion,
  });
  await writePreparation(directory, control, runtime);
  assert.equal(
    execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
    }).trim(),
    runtime.sourceSHA,
    'HEAD_CHANGED',
  );
  assert.equal(
    execFileSync('git', ['status', '--porcelain'], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
    }).trim(),
    '',
    'DIRTY_TREE',
  );
  console.log(`NIGHT_SERVER_PREPARED ${directory}`);
  return directory;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
