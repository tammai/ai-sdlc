#!/usr/bin/env node
// Codex protocol adapter. Shared guard logic remains in the existing scripts; this adapter
// normalizes Codex apply_patch requests, maps Claude's ask result to a Codex denial, and
// wraps lifecycle context in Codex's event-specific response shape.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MAX_INPUT_BYTES = 1024 * 1024;
const MAX_PATCH_BYTES = 512 * 1024;
const MAX_TARGET_BYTES = 1024 * 1024;
const MAX_PATCH_FILES = 16;
const MAX_PATCH_HUNKS = 64;
const MAX_SOURCE_LINES = 20000;
const MAX_MATCH_WORK = 5_000_000;
const PRE_HOOK_BUDGET_MS = 7000;
const startedAt = Date.now();
const expectedEvent = process.argv[2] || '';
const preToolWatchdog = expectedEvent === 'PreToolUse' ? setTimeout(() => {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: {
    hookEventName: 'PreToolUse', permissionDecision: 'deny',
    permissionDecisionReason: '[ai-sdlc] Codex guard exceeded its time budget; action blocked for safety.'
  } }));
  process.exit(0);
}, PRE_HOOK_BUDGET_MS) : null;
function ensurePreBudget() {
  if (expectedEvent === 'PreToolUse' && Date.now() - startedAt >= PRE_HOOK_BUDGET_MS) {
    throw new Error('pre-tool guard exceeded its time budget');
  }
}
async function readBoundedInput() {
  const chunks = [];
  let bytes = 0;
  try {
    for await (const chunk of process.stdin) {
      ensurePreBudget();
      bytes += Buffer.byteLength(chunk);
      if (bytes > MAX_INPUT_BYTES) return { invalidInput: true, tooLarge: true };
      chunks.push(chunk);
    }
  } catch { return { invalidInput: true, tooLarge: true }; }
  try { return JSON.parse(chunks.join('') || '{}'); } catch { return { invalidInput: true }; }
}
const input = await readBoundedInput();
if (preToolWatchdog) clearTimeout(preToolWatchdog);
const event = expectedEvent || String(input.hook_event_name || '');
const tool = String(input.tool_name || '');
const pluginRoot = process.env.PLUGIN_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scripts = path.join(pluginRoot, 'scripts');

function emit(value) { process.stdout.write(JSON.stringify(value)); }
function deny(reason) {
  emit({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `[ai-sdlc] ${reason}` } });
  process.exit(0);
}

function readBoundedFile(file) {
  const stats = fs.statSync(file);
  if (!stats.isFile()) throw new Error('target is not a regular file');
  if (stats.size > MAX_TARGET_BYTES) throw new Error('target file exceeds the size limit');
  const fd = fs.openSync(file, 'r');
  try {
    const chunks = [];
    const buffer = Buffer.alloc(64 * 1024);
    let bytes = 0;
    for (;;) {
      const amount = Math.min(buffer.length, MAX_TARGET_BYTES + 1 - bytes);
      if (amount <= 0) throw new Error('target file exceeds the size limit');
      const count = fs.readSync(fd, buffer, 0, amount, null);
      if (!count) break;
      bytes += count;
      if (bytes > MAX_TARGET_BYTES) throw new Error('target file exceeds the size limit');
      chunks.push(Buffer.from(buffer.subarray(0, count)));
    }
    return Buffer.concat(chunks, bytes).toString('utf8');
  } finally { fs.closeSync(fd); }
}

// Parse the apply_patch format used by Codex. Each update hunk must match the current file
// uniquely and in order. We reject moves, malformed hunks, duplicate matches, and unknown
// directives so every affected path and resulting file content is known before the tool runs.
function parsePatch(command, cwd) {
  if (Buffer.byteLength(command) > MAX_PATCH_BYTES) throw new Error('patch exceeds the size limit');
  const lines = String(command).replace(/\r\n/g, '\n').split('\n');
  if (lines.shift() !== '*** Begin Patch') throw new Error('missing *** Begin Patch');
  const files = [];
  let current = null;
  let i = 0;
  let totalHunks = 0;
  let matchWork = 0;
  const finish = () => {
    if (current?.kind === 'update' && !current.hunks) throw new Error('update operation has no hunks');
    current = null;
  };
  const resolve = (name) => {
    if (!name || path.isAbsolute(name) || name.split(/[\\/]/).includes('..')) throw new Error('unsafe or missing patch path');
    return path.resolve(cwd, name);
  };
  while (i < lines.length) {
    ensurePreBudget();
    const line = lines[i++];
    if (line === '*** End Patch') {
      if (lines.slice(i).some((rest) => rest.trim())) throw new Error('trailing patch data');
      finish();
      if (!files.length) throw new Error('empty patch');
      return files;
    }
    let m;
    if ((m = /^\*\*\* (Update|Add|Delete) File: (.+)$/.exec(line))) {
      // The next file header closes the prior operation; its content parser consumes all
      // operation lines before control returns here.
      finish();
      if (files.length >= MAX_PATCH_FILES) throw new Error('patch contains too many files');
      const abs = resolve(m[2]);
      const rel = path.relative(cwd, abs);
      if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('patch path escapes cwd');
      current = { abs, file_path: abs, kind: m[1].toLowerCase(), original: '', result: '', added: '', hunks: 0 };
      if (current.kind === 'update' || current.kind === 'delete') {
        try { current.original = readBoundedFile(abs); } catch { throw new Error(`cannot safely read ${m[2]}`); }
        current.result = current.original;
      } else if (fs.existsSync(abs)) throw new Error(`add target already exists: ${m[2]}`);
      files.push(current);
      continue;
    }
    if (line.startsWith('*** Move to:')) throw new Error('file moves are not supported');
    if (!current) throw new Error('unexpected patch directive');
    if (current.kind === 'add') {
      if (line.startsWith('*** ')) { i--; current = null; continue; }
      if (!line.startsWith('+')) throw new Error('add-file content must use + lines');
      const value = line.slice(1);
      current.result += `${value}\n`;
      current.added += `${value}\n`;
      if (Buffer.byteLength(current.result) > MAX_TARGET_BYTES) throw new Error('resulting file exceeds the size limit');
      continue;
    }
    if (current.kind === 'delete') {
      if (line.startsWith('*** ')) { i--; current = null; continue; }
      throw new Error('delete-file operation has unexpected content');
    }
    if (!line.startsWith('@@')) throw new Error('update hunk is missing @@');
    current.hunks++;
    totalHunks++;
    if (totalHunks > MAX_PATCH_HUNKS) throw new Error('patch contains too many hunks');
    const oldBlock = [];
    const newBlock = [];
    while (i < lines.length && !lines[i].startsWith('*** ')) {
      ensurePreBudget();
      const hunkLine = lines[i++];
      if (hunkLine.startsWith(' ')) { oldBlock.push(hunkLine.slice(1)); newBlock.push(hunkLine.slice(1)); }
      else if (hunkLine.startsWith('-')) oldBlock.push(hunkLine.slice(1));
      else if (hunkLine.startsWith('+')) { newBlock.push(hunkLine.slice(1)); current.added += `${hunkLine.slice(1)}\n`; }
      else if (hunkLine === '\\ No newline at end of file') continue;
      else if (hunkLine === '') throw new Error('unprefixed blank hunk line');
      else throw new Error('unknown hunk syntax');
    }
    const endOfFile = lines[i] === '*** End of File';
    if (endOfFile) i++;
    const source = current.result;
    const newline = source.includes('\r\n') ? '\r\n' : '\n';
    const normalizedSource = source.replace(/\r\n/g, '\n');
    const hadFinalNewline = normalizedSource.endsWith('\n');
    const sourceLines = normalizedSource.replace(/\n$/, '').split('\n');
    if (sourceLines.length > MAX_SOURCE_LINES) throw new Error('target file has too many lines to scan safely');
    const matches = [];
    if (endOfFile && oldBlock.length === 0) matches.push(sourceLines.length);
    else for (let start = 0; start <= sourceLines.length - oldBlock.length; start++) {
      ensurePreBudget();
      let matchesHere = true;
      for (let n = 0; n < oldBlock.length; n++) {
        ensurePreBudget();
        matchWork += Math.max(oldBlock[n].length, sourceLines[start + n].length, 1);
        if (matchWork > MAX_MATCH_WORK) throw new Error('patch context matching exceeded the work limit');
        if (oldBlock[n] !== sourceLines[start + n]) { matchesHere = false; break; }
      }
      if (matchesHere && (!endOfFile || start + oldBlock.length === sourceLines.length)) matches.push(start);
    }
    if (matches.length !== 1) throw new Error(matches.length ? 'ambiguous hunk context' : 'hunk does not match current file');
    const start = matches[0];
    sourceLines.splice(start, oldBlock.length, ...newBlock);
    current.result = sourceLines.join(newline) + (hadFinalNewline ? newline : '');
    if (Buffer.byteLength(current.result) > MAX_TARGET_BYTES) throw new Error('resulting file exceeds the size limit');
  }
  throw new Error('missing *** End Patch');
}

function patchPaths(command, cwd) {
  const lines = String(command).replace(/\r\n/g, '\n').split('\n');
  if (lines[0] !== '*** Begin Patch') throw new Error('missing *** Begin Patch');
  const files = [];
  for (const line of lines) {
    if (line === '*** End Patch') break;
    const match = /^\*\*\* (Update|Add|Delete) File: (.+)$/.exec(line);
    if (!match) continue;
    const abs = path.resolve(cwd, match[2]);
    const rel = path.relative(cwd, abs);
    if (!match[2] || path.isAbsolute(match[2]) || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('unsafe patch path');
    if (files.length >= MAX_PATCH_FILES) throw new Error('patch contains too many files');
    files.push({ abs, file_path: abs, kind: match[1].toLowerCase() });
  }
  if (!lines.includes('*** End Patch') || !files.length) throw new Error('incomplete or empty patch');
  return files;
}

function run(script, payload, timeout = 8000) {
  let boundedTimeout = timeout;
  if (event === 'PreToolUse') {
    const remaining = PRE_HOOK_BUDGET_MS - (Date.now() - startedAt);
    if (remaining < 100) throw new Error('pre-tool guard exceeded its time budget');
    boundedTimeout = Math.min(timeout, remaining);
  }
  const child = spawnSync(process.execPath, [path.join(scripts, script)], {
    cwd: input.cwd || process.cwd(), input: JSON.stringify(payload), encoding: 'utf8', timeout: boundedTimeout,
    env: { ...process.env, AI_SDLC_HOST: 'codex', PLUGIN_ROOT: pluginRoot }
  });
  if (child.error || child.status !== 0) throw new Error('shared hook did not complete safely');
  const output = child.stdout.trim();
  if (!output) return null;
  try { return JSON.parse(output); } catch { return output; }
}

function codexDecision(result) {
  if (result == null) return null;
  if (typeof result !== 'object' || Array.isArray(result)) return deny('The guard returned an unrecognized result; action blocked for safety.');
  const specific = result?.hookSpecificOutput;
  if (specific?.permissionDecision === 'deny') return deny(String(specific.permissionDecisionReason || 'The guard blocked this action.'));
  if (specific?.permissionDecision === 'ask') return deny(String(specific.permissionDecisionReason || 'This action needs human review; satisfy the workflow and retry.'));
  return deny('The guard returned an unrecognized decision; action blocked for safety.');
}

if (input.invalidInput) {
  if (event === 'PreToolUse') deny('The guard could not parse Codex hook input; action blocked for safety.');
  process.exit(0);
}
if (expectedEvent && input.hook_event_name !== expectedEvent) {
  if (event === 'PreToolUse') deny('The hook event did not match the configured Codex event; action blocked for safety.');
  process.exit(0);
}

try {
  if (event === 'PreToolUse' && (tool === 'Bash' || tool === 'apply_patch')) {
    const command = input.tool_input?.command;
    if (typeof command !== 'string' || !command.trim()) deny(`Codex ${tool} input must contain a non-empty command string.`);
    if (tool === 'Bash') {
      const result = run('guard.mjs', input, 6500);
      codexDecision(result);
      process.exit(0);
    }
    const parsed = parsePatch(command, input.cwd || process.cwd());
    for (const file of parsed) {
      const normalized = { ...input, tool_name: 'Write', tool_input: { file_path: file.file_path, content: file.result } };
      const result = run('guard.mjs', normalized);
      codexDecision(result);
    }
    process.exit(0);
  }
  if (event === 'PostToolUse' && tool === 'apply_patch') {
    const command = input.tool_input?.command;
    if (typeof command !== 'string' || !command.trim()) process.exit(0);
    const parsed = patchPaths(command, input.cwd || process.cwd());
    for (const file of parsed) {
      if (file.kind === 'delete' || !fs.existsSync(file.abs)) continue;
      run('post-edit.mjs', { ...input, tool_input: { file_path: file.file_path } }, 25000);
    }
    process.exit(0);
  }
  const script = ({ SessionStart: 'session-start.mjs', UserPromptSubmit: 'route-prompt.mjs', PreToolUse: 'guard.mjs', PostToolUse: 'post-edit.mjs', Stop: 'stop-gate.mjs' })[event];
  if (!script) process.exit(0);
  const result = run(script, input, event === 'PostToolUse' ? 25000 : 8000);
  if (event === 'PreToolUse') codexDecision(result);
  if (event === 'SessionStart' && typeof result === 'string' && result.trim()) {
    emit({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: result.trim() } });
  } else if (event === 'UserPromptSubmit' && result?.hookSpecificOutput?.additionalContext) {
    emit({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: result.hookSpecificOutput.additionalContext } });
  } else if (event === 'Stop' && result?.decision === 'block') emit(result);
} catch (error) {
  if (event === 'PreToolUse') deny(`The Codex guard could not safely inspect this action (${error.message}); action blocked.`);
}
