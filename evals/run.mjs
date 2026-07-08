#!/usr/bin/env bun
// Minimal markdown-driven pi eval runner. It keeps one reusable checkout per fixture repo,
// resets it to either a pinned SHA or a GitHub PR head for each run, lets pi edit it,
// then stores the transcript/diff under results.

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

  const prUrl = frontmatter.pr || frontmatter.prUrl;
  if (prUrl && !frontmatter.pr) frontmatter.pr = prUrl;
  if (!frontmatter.prompt && prUrl) frontmatter.prompt = `/summary ${prUrl}`;
  if (!frontmatter.prompt) throw new Error('Missing required frontmatter field: prompt');
  if (!prUrl && (!frontmatter.repo || !frontmatter.sha)) throw new Error('Spec must provide either pr/prUrl or both repo and sha');

  return {meta: frontmatter, guidance: match[2].trim()};
}

// Remove simple surrounding quotes. This is intentionally not a full YAML parser.
function unquote(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

const evalTimeoutMs = 5 * 60 * 1000;

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

// Return a stable, readable local path for a fixture repo without leaking auth tokens into directory names.
function checkoutDirForRepo(repo) {
  const parsed = repo.match(/^(?:https:\/\/[^/]+\/|git@[^:]+:)?(.+?)(?:\.git)?$/);
  const repoPath = parsed?.[1] ?? repo;
  return resolve(root, 'evals/checkouts', slug(repoPath.replace(/^grant-/, '')));
}

// Parse GitHub PR URLs so specs can point at the review object instead of hand-pinning SHAs and diff ranges.
function parseGithubPrUrl(url) {
  const parsed = String(url).match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:[/?#].*)?$/);
  if (!parsed) throw new Error(`Unsupported GitHub PR URL: ${url}`);
  return {owner: parsed[1], repo: parsed[2], number: parsed[3], repoUrl: `https://github.com/${parsed[1]}/${parsed[2]}.git`};
}

// Resolve the repository URL and exact checkout target for either old SHA specs or newer PR URL specs.
async function resolveCheckout(meta) {
  const prUrl = meta.pr || meta.prUrl;
  if (!prUrl) return {kind: 'sha', repo: meta.repo, sha: meta.sha};

  const pr = parseGithubPrUrl(prUrl);
  return {kind: 'pr', repo: pr.repoUrl, prUrl, prNumber: pr.number};
}

// Clone or update the reusable checkout. PR specs additionally fetch GitHub's pull refs so they still work after the contributor branch is deleted.
async function prepareRepo(meta) {
  const checkout = await resolveCheckout(meta);
  const repoDir = checkoutDirForRepo(checkout.repo);
  const githubToken = githubTokenForSpec(meta);
  const cloneUrl = githubToken && /^https:\/\/github\.com\//.test(checkout.repo)
    ? checkout.repo.replace('https://github.com/', `https://x-access-token:${githubToken}@github.com/`)
    : checkout.repo;

  // Disable credential helpers so macOS does not try to persist ephemeral eval tokens.
  if (!existsSync(join(repoDir, '.git'))) {
    await mkdir(dirname(repoDir), {recursive: true});
    await run('git', ['-c', 'credential.helper=', 'clone', '--no-tags', cloneUrl, repoDir], {env: {GIT_CONFIG_GLOBAL: '/dev/null'}, echoStderr: true});
    await run('git', ['remote', 'set-url', 'origin', checkout.repo], {cwd: repoDir});
  } else {
    await run('git', ['-c', 'credential.helper=', 'fetch', '--no-tags', cloneUrl, '+refs/heads/*:refs/remotes/origin/*'], {cwd: repoDir, env: {GIT_CONFIG_GLOBAL: '/dev/null'}, echoStderr: true});
  }

  if (checkout.kind === 'pr') {
    const prRef = `refs/remotes/origin/pull/${checkout.prNumber}/head`;
    await run('git', ['reset', '--hard'], {cwd: repoDir});
    await run('git', ['clean', '-ffdx'], {cwd: repoDir});
    await run('git', ['-c', 'credential.helper=', 'fetch', '--no-tags', cloneUrl, `+refs/pull/${checkout.prNumber}/head:${prRef}`], {cwd: repoDir, env: {GIT_CONFIG_GLOBAL: '/dev/null'}, echoStderr: true});
    await run('git', ['checkout', '-B', `eval-pr-${checkout.prNumber}`, prRef], {cwd: repoDir});
    await run('git', ['reset', '--hard', prRef], {cwd: repoDir});
  } else {
    await run('git', ['checkout', '--detach', checkout.sha], {cwd: repoDir});
    await run('git', ['reset', '--hard', checkout.sha], {cwd: repoDir});

    // SHA specs often point at old commits where the real fix now exists on main. Keep the
    // shared checkout, but hide fetched branches/tags before the agent runs so it cannot
    // inspect future refs like origin/main for the answer.
    await run('git', ['remote', 'remove', 'origin'], {cwd: repoDir}).catch(() => {});
    const refs = await run('git', ['for-each-ref', '--format=%(refname)', 'refs/remotes', 'refs/heads', 'refs/tags'], {cwd: repoDir});
    for (const ref of refs.stdout.split('\n').filter(Boolean)) {
      await run('git', ['update-ref', '-d', ref], {cwd: repoDir});
    }
    await run('git', ['reflog', 'expire', '--expire=now', '--all'], {cwd: repoDir});
  }

  await run('git', ['clean', '-ffdx'], {cwd: repoDir});
  return repoDir;
}

// Pass this repo's extension explicitly because eval agents run inside cloned fixture repos.
function mintExtensionArgs() {
  return ['--extension', resolve(root, 'extension.ts')];
}

// Replace simple {{frontmatterKey}} placeholders in prompts so specs can avoid duplicating PR URLs.
function renderSpecPrompt(meta) {
  return meta.prompt.replaceAll(/{{\s*([A-Za-z0-9_-]+)\s*}}/g, (_, key) => meta[key] ?? '');
}

// Invoke pi in JSON mode and store the event stream as the authoritative transcript.
async function runMainAgent(meta, repoDir, resultDir) {
  const args = ['--mode', 'json', '--session-dir', join(resultDir, 'session'), ...mintExtensionArgs()];
  const model = meta.model || process.env.PI_EVAL_MODEL;
  if (model) args.push('--model', meta.thinking ? `${model}:${meta.thinking}` : model);

  args.push(renderSpecPrompt(meta));
  await run('pi', args, {
    cwd: repoDir,
    env: {npm_config_cache: join(resultDir, 'npm-cache')},
    timeoutMs: evalTimeoutMs,
    stdoutFile: join(resultDir, 'transcript.jsonl'),
    stderrFile: join(resultDir, 'pi.stderr.log'),
    echoStderr: true,
  });
}

// Capture the patch, any markdown scratch artifacts, and optional verification output after the agent finishes.
async function captureResult(meta, repoDir, resultDir) {
  await saveMarkdownArtifacts(repoDir, resultDir);

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
        timeoutMs: evalTimeoutMs,
        stdoutFile: join(resultDir, 'verify.stdout.log'),
        stderrFile: join(resultDir, 'verify.stderr.log'),
      });
      await writeFile(join(resultDir, 'verify.json'), JSON.stringify({ok: true, code: verification.code}, null, 2));
    } catch (error) {
      await writeFile(join(resultDir, 'verify.json'), JSON.stringify({ok: false, code: error.code, timedOut: error.timedOut}, null, 2));
    }
  }
}

// Copy untracked markdown files into result artifacts before intent-to-add changes their git status.
async function saveMarkdownArtifacts(repoDir, resultDir) {
  const files = await run('git', ['ls-files', '--others', '--exclude-standard', '--', '*.md', ':(exclude)node_modules/**', ':(exclude)dist/**', ':(exclude)coverage/**'], {cwd: repoDir});
  const artifactFiles = files.stdout.split('\n').filter(Boolean);
  if (!artifactFiles.length) return;

  for (const file of artifactFiles) {
    const destination = join(resultDir, 'artifacts', file);
    await mkdir(dirname(destination), {recursive: true});
    await cp(join(repoDir, file), destination);
  }
}

// Extract the coding agent's final natural-language response from the JSON event stream.
async function saveAgentResponse(resultDir) {
  const transcript = await readFile(join(resultDir, 'transcript.jsonl'), 'utf8');
  const responses = [];

  // Timeout can leave a partial JSONL line; ignore only that recoverable transcript artifact.
  // Pi may emit assistant messages as individual message events or inside the final agent_end snapshot.
  for (const line of transcript.split('\n').filter(Boolean)) {
    let event;
    try { event = JSON.parse(line); } catch { continue; }

    const assistantMessages = [];
    if (event.type === 'message' && event.message?.role === 'assistant') assistantMessages.push(event.message);
    if (Array.isArray(event.messages)) assistantMessages.push(...event.messages.filter(message => message.role === 'assistant'));

    for (const message of assistantMessages) {
      for (const part of message.content ?? []) {
        if (part.type !== 'text' || !part.text) continue;
        responses.push({text: part.text, isFinal: String(part.textSignature ?? '').includes('final_answer')});
      }
    }
  }

  const finalResponse = [...responses].reverse().find(response => response.isFinal)?.text ?? responses.at(-1)?.text ?? '';
  await writeFile(join(resultDir, 'agent-response.md'), finalResponse || '(no agent response captured)');
  return finalResponse;
}

// Write one markdown artifact per subagent call so eval debugging can see exactly what the child LLM saw and returned.
async function saveSubagentInvocations(resultDir) {
  const transcriptPath = join(resultDir, 'transcript.jsonl');
  if (!existsSync(transcriptPath)) return;

  const transcript = await readFile(transcriptPath, 'utf8');
  const invocations = collectSubagentInvocations(transcript);
  const counts = new Map();

  for (const invocation of invocations) {
    const session = await readSubagentSession(invocation.details?.sessionFile);
    const promptName = invocation.arguments?.promptName || 'subagent';
    const slugName = slug(promptName);
    const n = (counts.get(slugName) ?? 0) + 1;
    counts.set(slugName, n);

    const metadata = {
      promptName,
      freshContext: invocation.details?.freshContext,
      model: invocation.details?.model || session.model || '(unknown)',
      thinking: session.thinking || '(unknown)',
      sessionId: invocation.details?.sessionId || session.sessionId || '(unknown)',
      sessionFile: invocation.details?.sessionFile || '(unknown)',
      toolCallId: invocation.toolCallId,
    };

    const prompt = session.prompt || invocation.arguments?.prompt || '(prompt not captured)';
    const response = session.response || stripSubagentSessionMarker(invocation.response) || '(response not captured)';
    await writeFile(join(resultDir, `subagent-${slugName}-${n}.md`), renderSubagentInvocation(metadata, prompt, response));
  }
}

// Pull subagent tool calls/results out of pi's JSON event stream, tolerating partial timeout transcripts.
function collectSubagentInvocations(transcript) {
  const calls = new Map();

  for (const line of transcript.split('\n').filter(Boolean)) {
    let event;
    try { event = JSON.parse(line); } catch { continue; }

    for (const message of messagesInEvent(event)) {
      if (message.role === 'toolResult' && message.toolName === 'subagent') {
        const call = calls.get(message.toolCallId) ?? {toolCallId: message.toolCallId};
        call.response = getMessageText(message);
        call.details = message.details ?? call.details;
        calls.set(message.toolCallId, call);
        continue;
      }

      for (const part of message.content ?? []) {
        if (part.type !== 'toolCall' || part.name !== 'subagent') continue;
        const call = calls.get(part.id) ?? {toolCallId: part.id};
        if (!call.arguments || JSON.stringify(part.arguments ?? {}).length >= JSON.stringify(call.arguments ?? {}).length) {
          call.arguments = part.arguments ?? {};
        }
        calls.set(part.id, call);
      }
    }
  }

  return [...calls.values()].filter(call => call.arguments || call.response || call.details);
}

// Return all complete message snapshots attached to a pi event.
function messagesInEvent(event) {
  const messages = [];
  if (event.message) messages.push(event.message);
  if (Array.isArray(event.messages)) messages.push(...event.messages);
  if (event.assistantMessageEvent?.message) messages.push(event.assistantMessageEvent.message);
  return messages;
}

// Read the child session to recover the expanded prompt, model settings, and final assistant text.
async function readSubagentSession(sessionFile) {
  const out = {sessionId: '', model: '', thinking: '', prompt: '', response: ''};
  if (!sessionFile || !existsSync(sessionFile)) return out;

  const text = await readFile(sessionFile, 'utf8');
  const assistants = [];
  for (const line of text.split('\n').filter(Boolean)) {
    let event;
    try { event = JSON.parse(line); } catch { continue; }

    if (event.type === 'session') out.sessionId = event.id ?? out.sessionId;
    if (event.type === 'model_change') out.model = event.modelId ? [event.provider, event.modelId].filter(Boolean).join('/') : out.model;
    if (event.type === 'thinking_level_change') out.thinking = event.thinkingLevel ?? out.thinking;

    const message = event.message;
    if (!message) continue;
    if (message.role === 'user') out.prompt = getMessageText(message) || out.prompt;
    if (message.role === 'assistant') assistants.push(message);
  }

  out.response = getFinalAssistantText(assistants);
  return out;
}

function getFinalAssistantText(messages) {
  const texts = [];
  for (const message of messages) {
    for (const part of message.content ?? []) {
      if (part.type !== 'text' || !part.text) continue;
      texts.push({text: part.text, isFinal: String(part.textSignature ?? '').includes('final_answer')});
    }
  }
  return [...texts].reverse().find(t => t.isFinal)?.text ?? texts.at(-1)?.text ?? '';
}

function getMessageText(message) {
  return (message.content ?? []).filter(part => part.type === 'text' && part.text).map(part => part.text).join('\n');
}

function stripSubagentSessionMarker(text = '') {
  return text.replace(/\n*\[subagent session: [^\]]+\]\s*$/, '').trim();
}

function renderSubagentInvocation(metadata, prompt, response) {
  const metadataLines = Object.entries(metadata).map(([key, value]) => `- ${key}: ${value ?? '(unknown)'}`).join('\n');
  return `# Subagent invocation\n\n## Metadata\n\n${metadataLines}\n\n## Prompt sent to subagent\n\n${fence(prompt)}\n\n## Final subagent response\n\n${fence(response)}\n`;
}

function fence(text) {
  const ticks = text.includes('```') ? '````' : '```';
  return `${ticks}\n${text}\n${ticks}`;
}

// Fill the markdown judge prompt template with eval artifacts.
function renderJudgePrompt(template, values) {
  return template.replaceAll(/{{\s*([A-Za-z0-9_]+)\s*}}/g, (_, key) => values[key] ?? '');
}

// Pick the judge prompt from the spec prefix: build- judges code, summary-/plan- judge responses.
function judgeTemplateForSpec(specPath, spec) {
  const specName = spec.meta.name || basename(specPath, '.md');
  const prefix = specName.split('-')[0];
  if (['build', 'summary', 'plan'].includes(prefix)) return resolve(root, 'evals/judges', `${prefix}.md`);
  return resolve(root, 'evals/judge.md');
}

// Ask a separate pi invocation to inspect the edited checkout and judge the result.
async function runJudge(specPath, spec, repoDir, resultDir) {
  const status = await readFile(join(resultDir, 'status.txt'), 'utf8');
  const response = await readFile(join(resultDir, 'agent-response.md'), 'utf8');
  const specMarkdown = await readFile(specPath, 'utf8');
  const template = await readFile(judgeTemplateForSpec(specPath, spec), 'utf8');
  const judgePrompt = renderJudgePrompt(template, {
    spec: specMarkdown,
    checkout: repoDir,
    status: status || '(no changed files)',
    response,
  });

  const args = ['-p', '--session-dir', join(resultDir, 'session'), ...mintExtensionArgs()];
  const judgeModel = spec.meta.judgeModel || process.env.PI_EVAL_JUDGE_MODEL;
  if (judgeModel) args.push('--model', judgeModel);

  try {
    await run('pi', args, {
      cwd: repoDir,
      input: judgePrompt,
      timeoutMs: evalTimeoutMs,
      stdoutFile: join(resultDir, 'judge.md'),
      stderrFile: join(resultDir, 'judge.stderr.log'),
      echoStdout: true,
      echoStderr: true,
    });
  } catch (error) {
    const fallback = `What went well:\n- See changed files in status.txt.\nWhat went badly:\n- Judge did not complete: ${error.message}\nNotable slop:\n- Unknown.\n`;
    await writeFile(join(resultDir, 'judge.md'), fallback);
    console.error(error.message);
  }
}

function slug(input) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'eval';
}

// Resolve `build-schedule` to `evals/specs/build-schedule.md`, while still allowing explicit paths.
function resolveSpecPath(specArg) {
  if (specArg.includes('/') || specArg.endsWith('.md')) return resolve(specArg);
  return resolve(root, 'evals/specs', `${specArg}.md`);
}

async function main() {
  await loadDotEnv();

  const [specArg] = process.argv.slice(2);
  if (!specArg) {
    console.error('Usage: bun evals/run.mjs <spec-name>');
    console.error('Example: bun evals/run.mjs build-schedule');
    process.exit(1);
  }

  const specPath = resolveSpecPath(specArg);
  const spec = parseSpec(await readFile(specPath, 'utf8'));
  const name = spec.meta.name || basename(specPath, '.md');
  const resultDir = resolve(root, 'evals/results', `${new Date().toISOString().replace(/[:.]/g, '-')}_${slug(name)}`);
  await mkdir(resultDir, {recursive: true});
  await cp(specPath, join(resultDir, 'spec.md'));
  await writeFile(join(resultDir, 'metadata.json'), JSON.stringify({name, repo: spec.meta.repo, sha: spec.meta.sha, pr: spec.meta.pr || spec.meta.prUrl, startedAt: new Date().toISOString()}, null, 2));

  console.error(`Result dir: ${resultDir}`);
  const repoDir = await prepareRepo(spec.meta);

  if (spec.meta.setup) {
    await run('bash', ['-lc', spec.meta.setup], {
      cwd: repoDir,
      timeoutMs: evalTimeoutMs,
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
  await saveAgentResponse(resultDir);
  await saveSubagentInvocations(resultDir);
  await runJudge(specPath, spec, repoDir, resultDir);
  console.error(`\nDone. See ${resultDir}`);
}

main().catch(error => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
