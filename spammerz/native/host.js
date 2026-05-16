#!/usr/bin/env node
/**
 * SpammerZ native updater host.
 *
 * Chrome Native Messaging requires length-prefixed JSON over stdin/stdout.
 * Do not write logs to stdout from this file.
 */

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MAX_MESSAGE_SIZE = 1024 * 1024;

function writeResponse(payload) {
  const json = Buffer.from(JSON.stringify(payload), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(json.length, 0);
  process.stdout.write(Buffer.concat([header, json]));
}

function runGit(args, options = {}) {
  return new Promise((resolve) => {
    execFile('git', args, {
      cwd: REPO_ROOT,
      timeout: options.timeout || 30000,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        code: error?.code || 0,
        signal: error?.signal || '',
        stdout: String(stdout || '').trim(),
        stderr: String(stderr || '').trim(),
        error: error?.message || '',
      });
    });
  });
}

async function getRepoStatus() {
  const inside = await runGit(['rev-parse', '--is-inside-work-tree']);
  if (!inside.ok || inside.stdout !== 'true') {
    return {
      ok: false,
      installed: true,
      repoRoot: REPO_ROOT,
      error: 'This folder is not inside a Git working tree.',
      detail: inside.stderr || inside.error,
    };
  }

  const [branch, head, status, remote] = await Promise.all([
    runGit(['rev-parse', '--abbrev-ref', 'HEAD']),
    runGit(['rev-parse', 'HEAD']),
    runGit(['status', '--porcelain']),
    runGit(['remote', 'get-url', 'origin']),
  ]);

  return {
    ok: true,
    installed: true,
    repoRoot: REPO_ROOT,
    branch: branch.stdout || '',
    head: head.stdout || '',
    dirty: Boolean(status.stdout),
    remote: remote.stdout || '',
  };
}

async function updateRepo(message) {
  const steps = [];
  const status = await getRepoStatus();
  if (!status.ok) return status;

  steps.push(`Repo: ${status.repoRoot}`);
  steps.push(`Branch: ${status.branch || 'unknown'}`);

  if (status.dirty) {
    return {
      ok: false,
      installed: true,
      repoRoot: REPO_ROOT,
      error: 'Git working tree has local changes. Commit or stash them before auto-updating.',
      steps,
    };
  }

  const upstream = await runGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  if (!upstream.ok || !upstream.stdout) {
    return {
      ok: false,
      installed: true,
      repoRoot: REPO_ROOT,
      error: 'Current branch has no upstream remote configured.',
      detail: upstream.stderr || upstream.error,
      steps,
    };
  }

  steps.push(`Upstream: ${upstream.stdout}`);

  const before = await runGit(['rev-parse', 'HEAD']);
  const fetch = await runGit(['fetch', '--prune'], { timeout: 60000 });
  if (!fetch.ok) {
    return {
      ok: false,
      installed: true,
      repoRoot: REPO_ROOT,
      error: 'git fetch failed.',
      detail: fetch.stderr || fetch.error,
      steps,
    };
  }
  steps.push('Fetched latest commits.');

  const remoteHead = await runGit(['rev-parse', '@{u}']);
  if (remoteHead.ok && before.stdout === remoteHead.stdout) {
    return {
      ok: true,
      installed: true,
      repoRoot: REPO_ROOT,
      message: 'Repository is already up to date.',
      before: before.stdout,
      after: before.stdout,
      remoteVersion: message.remoteVersion || '',
      steps,
    };
  }

  const pull = await runGit(['pull', '--ff-only'], { timeout: 60000 });
  if (!pull.ok) {
    return {
      ok: false,
      installed: true,
      repoRoot: REPO_ROOT,
      error: 'git pull --ff-only failed.',
      detail: pull.stderr || pull.error,
      steps,
    };
  }

  const after = await runGit(['rev-parse', 'HEAD']);
  steps.push(pull.stdout || 'Pulled latest commits.');

  return {
    ok: true,
    installed: true,
    repoRoot: REPO_ROOT,
    message: before.stdout === after.stdout ? 'Repository is already up to date.' : 'Repository updated successfully.',
    before: before.stdout,
    after: after.stdout,
    remoteVersion: message.remoteVersion || '',
    steps,
  };
}

async function handleMessage(message) {
  if (!message || typeof message !== 'object') {
    return { ok: false, installed: true, error: 'Invalid native updater message.' };
  }

  if (message.action === 'status') {
    return getRepoStatus();
  }

  if (message.action === 'update') {
    return updateRepo(message);
  }

  if (message.action === 'ping') {
    return { ok: true, installed: true, message: 'pong', repoRoot: REPO_ROOT };
  }

  return {
    ok: false,
    installed: true,
    error: `Unsupported native updater action: ${String(message.action || '')}`,
  };
}

function readMessage() {
  const chunks = [];
  let totalLength = 0;

  process.stdin.on('data', (chunk) => {
    chunks.push(chunk);
    totalLength += chunk.length;

    if (totalLength > MAX_MESSAGE_SIZE) {
      writeResponse({ ok: false, installed: true, error: 'Native message is too large.' });
      process.exit(1);
    }
  });

  process.stdin.on('end', async () => {
    try {
      const input = Buffer.concat(chunks);
      if (input.length < 4) {
        writeResponse({ ok: false, installed: true, error: 'Native message header is missing.' });
        return;
      }

      const messageLength = input.readUInt32LE(0);
      const json = input.slice(4, 4 + messageLength).toString('utf8');
      const message = JSON.parse(json);
      writeResponse(await handleMessage(message));
    } catch (error) {
      writeResponse({
        ok: false,
        installed: true,
        error: error?.message || 'Native updater crashed.',
      });
    }
  });
}

if (!fs.existsSync(REPO_ROOT)) {
  writeResponse({ ok: false, installed: true, error: `Repo folder does not exist: ${REPO_ROOT}` });
} else {
  readMessage();
}
