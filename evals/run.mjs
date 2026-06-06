#!/usr/bin/env bun
// Minimal markdown-driven pi eval runner. It clones a pinned repo, lets pi edit it from a prompt,
// captures the transcript and diff, then asks a separate no-tools judge agent to score the result.

import {spawn} from 'node:child_process';
import {createWriteStream, existsSync} from 'node:fs';
import {mkdir, readFile, writeFile, cp} from 'node:fs/promises';
import {basename, dirname, join, resolve} from 'node:path';

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');

// Load a simple .env file so private fixture repos can be checked out without extra shell setup.
async function loadDotEnv() {
  const path = resolve(root, '.env');
  if (!existsSync(path)) return;

  for (const line of (await readFile(path, 'utf8')).split('\n')) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = unquote(match[2].trim());
  }
}

// Parse a small YAML-frontmatter subset: string scalars and indented block strings (`key: |`).
function parseSpec(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) throw new Error('Spec must start with YAML frontmatter delimited by ---');

  const frontmatter = {};
  const lines = match[1].split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith('#')) continue;

    const block = line.match(/^([A-Za-z0-9_-]+):\s*([>|])\s*$/);
    if (block) {
      const key = block[1];
      const collected = [];
      i++;
      while (i < lines.length && (lines[i] === '' || /^\s+/.test(lines[i]))) {
        collected.push(lines[i].replace(/^  /, ''));
        i++;
      }
      i--;
      frontmatter[key] = collected.join('\n').replace(/\n$/, '');
      continue;
    }

    const scalar = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!scalar) throw new Error(`Unsupported frontmatter line: ${line}`);
    frontmatter[scalar[1]] = unquote(scalar[2].trim());
  }

  for (const key of ['repo', 'sha', 'prompt']) {
    if (!frontmatter[key]) throw new Error(`Missing required frontmatter field: ${key}`);
  }

  return {meta: frontmatter, guidance: match[2].trim()};
}

// Remove simple surrounding quotes. This is intentionally not a full YAML parser.
function unquote(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

// Convert spec timeout fields to milliseconds; seconds fields are preferred for short evals.
function durationMs(meta, secondsKey, minutesKey, defaultSeconds) {
  return Number(meta[secondsKey] ?? Number(meta[minutesKey] ?? defaultSeconds / 60) * 60) * 1000;
}

// Run a command, streaming stdout/stderr to files when requested, and reject on non-zero exit.
function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {cwd: options.cwd, env: {...process.env, ...options.env}, shell: false, stdio: [options.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe']});
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const stdoutFile = options.stdoutFile ? createWriteStream(options.stdoutFile) : undefined;
    const stderrFile = options.stderrFile ? createWriteStream(options.stderrFile) : undefined;

    child.stdout.on('data', chunk => {
      stdout += chunk;
      stdoutFile?.write(chunk);
      if (options.echoStdout) process.stdout.write(chunk);
    });
    if (options.input !== undefined) {
      child.stdin.end(options.input);
    }

    child.stderr.on('data', chunk => {
      stderr += chunk;
      stderrFile?.write(chunk);
      if (options.echoStderr) process.stderr.write(chunk);
    });

    const timer = options.timeoutMs ? setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000).unref();
    }, options.timeoutMs) : undefined;

    child.on('error', reject);
    child.on('close', code => {
      if (timer) clearTimeout(timer);
      stdoutFile?.end();
      stderrFile?.end();
      const result = {code, stdout, stderr, timedOut};
      if (code === 0 && !timedOut) resolvePromise(result);
      else reject(Object.assign(new Error(`${command} ${args.join(' ')} failed with exit ${code}${timedOut ? ' (timed out)' : ''}`), result));
    });
  });
}

// Resolve the optional GitHub token named by the spec. `githubToken: GH_TEST` reads `GH_TEST_GITHUB_TOKEN`.
function githubTokenForSpec(meta) {
  if (!meta.githubToken) return undefined;

  const envName = `${meta.githubToken}_GITHUB_TOKEN`;
  const token = process.env[envName];
  if (!token) throw new Error(`Spec requested githubToken: ${meta.githubToken}, but ${envName} is not set`);
  return token;
}

// Clone the target repo, check out the pinned SHA, and leave the repo ready for pi.
async function prepareRepo(meta, resultDir) {
  const repoDir = join(resultDir, 'repo');
  const githubToken = githubTokenForSpec(meta);
  const cloneUrl = githubToken && /^https:\/\/github\.com\//.test(meta.repo)
    ? meta.repo.replace('https://github.com/', `https://x-access-token:${githubToken}@github.com/`)
    : meta.repo;

  // Disable credential helpers so macOS does not try to persist ephemeral eval tokens.
  await run('git', ['-c', 'credential.helper=', 'clone', '--no-tags', cloneUrl, repoDir], {env: {GIT_CONFIG_GLOBAL: '/dev/null'}, echoStderr: true});
  await run('git', ['remote', 'set-url', 'origin', meta.repo], {cwd: repoDir});
  await run('git', ['checkout', meta.sha], {cwd: repoDir});
  return repoDir;
}

// Pass this repo's extension explicitly because eval agents run inside cloned fixture repos.
function mintExtensionArgs() {
  return ['--extension', resolve(root, 'extension.ts')];
}

// Invoke pi in JSON mode and store the event stream as the authoritative transcript.
async function runMainAgent(meta, repoDir, resultDir) {
  const args = ['--mode', 'json', '--session-dir', join(resultDir, 'session'), ...mintExtensionArgs()];
  const model = meta.model || process.env.PI_EVAL_MODEL;
  if (model) args.push('--model', meta.thinking ? `${model}:${meta.thinking}` : model);

  args.push(meta.prompt);
  await run('pi', args, {
    cwd: repoDir,
    env: {npm_config_cache: join(resultDir, 'npm-cache')},
    timeoutMs: durationMs(meta, 'timeoutSeconds', 'timeoutMinutes', 80),
    stdoutFile: join(resultDir, 'transcript.jsonl'),
    stderrFile: join(resultDir, 'pi.stderr.log'),
    echoStderr: true,
  });
}

// Capture the patch and optional verification output after the agent finishes.
async function captureResult(meta, repoDir, resultDir) {
  // Intent-to-add makes untracked files appear in `git diff` without actually staging content.
  await run('git', ['add', '--intent-to-add', '--', '.', ':!node_modules', ':!dist', ':!coverage'], {cwd: repoDir});
  const status = await run('git', ['status', '--short'], {cwd: repoDir});
  const diff = await run('git', ['diff', '--no-ext-diff', '--binary'], {cwd: repoDir});
  await writeFile(join(resultDir, 'status.txt'), status.stdout);
  await writeFile(join(resultDir, 'diff.patch'), diff.stdout);

  if (meta.verify) {
    try {
      const verification = await run('bash', ['-lc', meta.verify], {
        cwd: repoDir,
        timeoutMs: durationMs(meta, 'verifyTimeoutSeconds', 'verifyTimeoutMinutes', 60),
        stdoutFile: join(resultDir, 'verify.stdout.log'),
        stderrFile: join(resultDir, 'verify.stderr.log'),
      });
      await writeFile(join(resultDir, 'verify.json'), JSON.stringify({ok: true, code: verification.code}, null, 2));
    } catch (error) {
      await writeFile(join(resultDir, 'verify.json'), JSON.stringify({ok: false, code: error.code, timedOut: error.timedOut}, null, 2));
    }
  }
}

// Fill the markdown judge prompt template with eval artifacts.
function renderJudgePrompt(template, values) {
  return template.replaceAll(/{{([A-Z_]+)}}/g, (_, key) => values[key] ?? '');
}

// Ask a separate no-tools pi invocation to judge the final patch against the markdown rubric.
async function runJudge(specPath, spec, resultDir) {
  const diff = await readFile(join(resultDir, 'diff.patch'), 'utf8');
  const status = await readFile(join(resultDir, 'status.txt'), 'utf8');
  const verify = existsSync(join(resultDir, 'verify.json')) ? await readFile(join(resultDir, 'verify.json'), 'utf8') : 'not run';
  const mainError = existsSync(join(resultDir, 'main-agent-error.json')) ? await readFile(join(resultDir, 'main-agent-error.json'), 'utf8') : 'none';
  const template = await readFile(resolve(root, 'evals/judge.md'), 'utf8');
  const judgePrompt = renderJudgePrompt(template, {
    SPEC_PATH: specPath,
    PROMPT: spec.meta.prompt,
    GUIDANCE: spec.guidance || '(none)',
    MAIN_ERROR: mainError,
    STATUS: status || '(clean)',
    VERIFY: verify,
    DIFF: diff || '(empty diff)',
  });

  const args = ['-p', '--no-tools', '--session-dir', join(resultDir, 'session'), ...mintExtensionArgs()];
  const judgeModel = spec.meta.judgeModel || process.env.PI_EVAL_JUDGE_MODEL;
  if (judgeModel) args.push('--model', judgeModel);

  try {
    const judged = await run('pi', args, {
      input: judgePrompt,
      timeoutMs: durationMs(spec.meta, 'judgeTimeoutSeconds', 'judgeTimeoutMinutes', 25),
      stdoutFile: join(resultDir, 'judge.md'),
      stderrFile: join(resultDir, 'judge.stderr.log'),
      echoStdout: true,
      echoStderr: true,
    });

    const score = judged.stdout.match(/^Score:\s*(\d+)/mi)?.[1];
    await writeFile(join(resultDir, 'judge.json'), JSON.stringify({score: score ? Number(score) : null}, null, 2));
  } catch (error) {
    const fallback = `Score: null\nVerdict: Judge failed: ${error.message}\nWhat went well:\n- See diff.patch.\nWhat went badly:\n- Judge did not complete.\nNotable slop:\n- Unknown.\nWould accept as a PR: no\n`;
    await writeFile(join(resultDir, 'judge.md'), fallback);
    await writeFile(join(resultDir, 'judge.json'), JSON.stringify({score: null, error: error.message, timedOut: error.timedOut}, null, 2));
    console.error(error.message);
  }
}

function slug(input) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'eval';
}

// Resolve `schedule` to `evals/specs/schedule.md`, while still allowing explicit paths.
function resolveSpecPath(specArg) {
  if (specArg.includes('/') || specArg.endsWith('.md')) return resolve(specArg);
  return resolve(root, 'evals/specs', `${specArg}.md`);
}

async function main() {
  await loadDotEnv();

  const [specArg] = process.argv.slice(2);
  if (!specArg) {
    console.error('Usage: bun evals/run.mjs <spec-name>');
    console.error('Example: bun evals/run.mjs schedule');
    process.exit(1);
  }

  const specPath = resolveSpecPath(specArg);
  const spec = parseSpec(await readFile(specPath, 'utf8'));
  const name = spec.meta.name || basename(specPath, '.md');
  const resultDir = resolve(root, 'evals/results', `${new Date().toISOString().replace(/[:.]/g, '-')}_${slug(name)}`);
  await mkdir(resultDir, {recursive: true});
  await cp(specPath, join(resultDir, 'spec.md'));
  await writeFile(join(resultDir, 'metadata.json'), JSON.stringify({name, repo: spec.meta.repo, sha: spec.meta.sha, startedAt: new Date().toISOString()}, null, 2));

  console.error(`Result dir: ${resultDir}`);
  const repoDir = await prepareRepo(spec.meta, resultDir);

  if (spec.meta.setup) {
    await run('bash', ['-lc', spec.meta.setup], {
      cwd: repoDir,
      timeoutMs: durationMs(spec.meta, 'setupTimeoutSeconds', 'setupTimeoutMinutes', 60),
      stdoutFile: join(resultDir, 'setup.stdout.log'),
      stderrFile: join(resultDir, 'setup.stderr.log'),
      echoStderr: true,
    });
  }

  try {
    await runMainAgent(spec.meta, repoDir, resultDir);
  } catch (error) {
    // Timeouts are still useful eval results: preserve the partial patch and let the judge penalize it.
    await writeFile(join(resultDir, 'main-agent-error.json'), JSON.stringify({message: error.message, code: error.code, timedOut: error.timedOut}, null, 2));
    console.error(error.message);
  }

  await captureResult(spec.meta, repoDir, resultDir);
  await runJudge(specPath, spec, resultDir);
  console.error(`\nDone. See ${resultDir}`);
}

main().catch(error => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
