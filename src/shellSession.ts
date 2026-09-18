import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { randomBytes } from 'crypto';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PassThrough } from 'stream';

// How long an interrupted cell gets to stop before the whole session is killed
const interruptGraceMs = 2000;

// The function every cell runs through. It sources the cell script into the
// session shell so `cd`, `export`, variables and functions carry over to later
// cells. Stdin is /dev/null so a command waiting for input finishes instead of
// hanging (and cannot swallow the next line we send the shell). The INT trap
// turns a cancel into "stop this cell" rather than "exit the shell"; a trap with
// a handler (unlike an ignored signal) is reset to default in child processes,
// so the running command still receives the interrupt.
const runFunction = [
  '__codebook_md_run() {',
  '  trap \'return 130\' INT',
  '  . "$1" </dev/null',
  '  local __codebook_md_status=$?',
  '  trap - INT',
  '  return $__codebook_md_status',
  '}',
].join('\n');

/**
 * shellQuote wraps a value in single quotes for bash, escaping embedded quotes.
 */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * CellRun is one cell's execution inside a ShellSession. It has the parts of the
 * ChildProcess interface the kernel uses - stdout/stderr streams, 'close' and
 * 'error' events, and kill() - so it can stand in for a spawned process.
 */
export class CellRun extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  private finished = false;

  constructor(private readonly onKill: () => void) {
    super();
  }

  kill(): boolean {
    if (!this.finished) {
      this.onKill();
    }
    return true;
  }

  /** finish ends both streams, then emits 'close' once their data is consumed. */
  finish(exitCode: number): void {
    if (this.finished) {
      return;
    }
    this.finished = true;
    const ended = (stream: PassThrough) => new Promise<void>(resolve => {
      stream.once('end', resolve);
      stream.end();
      // A stream with no reader never emits 'end'; make sure it drains
      if (stream.listenerCount('data') === 0) {
        stream.resume();
      }
    });
    void Promise.all([ended(this.stdout), ended(this.stderr)]).then(() => this.emit('close', exitCode));
  }

  get isFinished(): boolean {
    return this.finished;
  }
}

/**
 * MarkerStream splits one output stream of the session shell at the end-of-cell
 * marker. Text before the marker belongs to the current cell; it is forwarded as
 * it arrives, holding back only a tail that could be the start of a marker.
 */
class MarkerStream {
  private buffer = '';

  constructor(private readonly pattern: RegExp, private readonly holdBack: number) { }

  /** push adds data; returns the text safe to forward and the marker match, if found. */
  push(data: string): { text: string; match?: RegExpExecArray; } {
    this.buffer += data;
    const match = this.pattern.exec(this.buffer);
    if (match) {
      const text = this.buffer.slice(0, match.index);
      this.buffer = this.buffer.slice(match.index + match[0].length);
      return { text, match };
    }
    const safeLength = Math.max(0, this.buffer.length - this.holdBack);
    const text = this.buffer.slice(0, safeLength);
    this.buffer = this.buffer.slice(safeLength);
    return { text };
  }

  /** flush returns and clears whatever is buffered. */
  flush(): string {
    const text = this.buffer;
    this.buffer = '';
    return text;
  }
}

interface PendingRun {
  run: CellRun;
  scriptFile: string;
  exitCode?: number;
  stdoutDone: boolean;
  stderrDone: boolean;
  interruptTimer?: NodeJS.Timeout;
}

/**
 * ShellSession is a long-lived bash process that runs cells one at a time, so
 * shell state carries over from one cell to the next like in a terminal.
 */
export class ShellSession {
  private readonly proc: ChildProcessWithoutNullStreams;
  private readonly marker: string;
  private readonly stdoutMarker: MarkerStream;
  private readonly stderrMarker: MarkerStream;
  private readonly scriptDir: string;
  private queue: Promise<void> = Promise.resolve();
  private current?: PendingRun;
  private runCount = 0;
  private exited = false;

  constructor(cwd: string, env: NodeJS.ProcessEnv, shell: string = 'bash') {
    const nonce = randomBytes(8).toString('hex');
    this.marker = `__CODEBOOK_MD_END_${nonce}__`;
    this.stdoutMarker = new MarkerStream(new RegExp(`${this.marker}(\\d+)\\n`), this.marker.length + 5);
    this.stderrMarker = new MarkerStream(new RegExp(`${this.marker}\\n`), this.marker.length + 1);
    this.scriptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codebook-md-session-'));

    // detached puts bash in its own process group, so an interrupt can reach
    // whatever command it is running without touching the extension host
    this.proc = spawn(shell, [], { cwd, env, detached: process.platform !== 'win32' });
    this.proc.stdout.on('data', (data: Buffer) => this.onOutput('stdout', data.toString()));
    this.proc.stderr.on('data', (data: Buffer) => this.onOutput('stderr', data.toString()));
    this.proc.on('error', (error) => {
      console.error(`shell session error: ${error}`);
      this.onExit(127, `could not start ${shell}: ${error.message}`);
    });
    this.proc.on('close', (code, signal) => this.onExit(code ?? (signal ? 130 : 0)));
    this.proc.stdin.on('error', (error) => console.error(`shell session stdin error: ${error}`));
    this.proc.stdin.write(runFunction + '\n');
  }

  /** alive reports whether the shell process is still running. */
  get alive(): boolean {
    return !this.exited;
  }

  /**
   * run executes a script in the session. Runs are queued, so a cell started
   * while another is still running waits for it to finish.
   */
  run(script: string): CellRun {
    const run = new CellRun(() => this.interrupt(run));
    this.queue = this.queue.then(() => this.start(run, script));
    return run;
  }

  private start(run: CellRun, script: string): Promise<void> {
    if (run.isFinished) {
      return Promise.resolve(); // cancelled while it was queued
    }
    if (this.exited) {
      run.stderr.write('codebook-md: the shell session has ended - run the cell again to start a new one\n');
      run.finish(1);
      return Promise.resolve();
    }

    const scriptFile = path.join(this.scriptDir, `cell_${++this.runCount}.sh`);
    fs.writeFileSync(scriptFile, script);
    this.current = { run, scriptFile, stdoutDone: false, stderrDone: false };

    // One line, so nothing is left in the shell's stdin for the cell to read
    const quotedMarker = shellQuote(this.marker);
    this.proc.stdin.write(
      `__codebook_md_run ${shellQuote(scriptFile)}; ` +
      `printf '%s%s\\n' ${quotedMarker} "$?"; printf '%s\\n' ${quotedMarker} >&2\n`
    );

    return new Promise(resolve => run.once('close', () => resolve()));
  }

  private onOutput(streamName: 'stdout' | 'stderr', data: string): void {
    const pending = this.current;
    if (!pending) {
      // e.g. a background job writing after its cell finished
      console.log(`shell session ${streamName} (no running cell): ${data}`);
      return;
    }
    const splitter = streamName === 'stdout' ? this.stdoutMarker : this.stderrMarker;
    const { text, match } = splitter.push(data);
    if (text) {
      pending.run[streamName].write(text);
    }
    if (match) {
      if (streamName === 'stdout') {
        pending.exitCode = Number(match[1]);
        pending.stdoutDone = true;
      } else {
        pending.stderrDone = true;
      }
      if (pending.stdoutDone && pending.stderrDone) {
        this.complete(pending.exitCode ?? 0);
      }
    }
  }

  private complete(exitCode: number): void {
    const pending = this.current;
    if (!pending) {
      return;
    }
    this.current = undefined;
    if (pending.interruptTimer) {
      clearTimeout(pending.interruptTimer);
    }
    fs.rm(pending.scriptFile, { force: true }, () => undefined);
    pending.run.finish(exitCode);
  }

  private onExit(exitCode: number, reason?: string): void {
    if (this.exited) {
      return;
    }
    this.exited = true;
    const pending = this.current;
    if (pending) {
      const leftover = this.stdoutMarker.flush();
      if (leftover) {
        pending.run.stdout.write(leftover);
      }
      pending.run.stderr.write(this.stderrMarker.flush());
      pending.run.stderr.write(`\ncodebook-md: ${reason ?? `shell session ended (exit code ${exitCode})`} - the next cell starts a new session\n`);
      this.complete(exitCode);
    }
    fs.rm(this.scriptDir, { recursive: true, force: true }, () => undefined);
  }

  /**
   * interrupt stops the running cell with SIGINT, keeping the session. If the
   * cell doesn't stop within the grace period, the session is killed.
   */
  private interrupt(run: CellRun): void {
    const pending = this.current;
    if (!pending || pending.run !== run) {
      run.finish(130); // still queued - just drop it
      return;
    }
    if (process.platform === 'win32' || this.proc.pid === undefined) {
      this.dispose();
      return;
    }
    try {
      process.kill(-this.proc.pid, 'SIGINT');
    } catch (error) {
      console.error(`shell session interrupt failed: ${error}`);
    }
    pending.interruptTimer = setTimeout(() => {
      if (this.current === pending) {
        this.dispose();
      }
    }, interruptGraceMs);
  }

  /** dispose kills the shell and everything it started. */
  dispose(): void {
    if (this.exited) {
      return;
    }
    try {
      if (process.platform !== 'win32' && this.proc.pid !== undefined) {
        process.kill(-this.proc.pid, 'SIGKILL');
      } else {
        this.proc.kill('SIGKILL');
      }
    } catch (error) {
      console.error(`shell session dispose failed: ${error}`);
      this.proc.kill('SIGKILL');
    }
  }
}

// Sessions by notebook URI
const sessions = new Map<string, ShellSession>();

/**
 * getSession returns the live session for a notebook, starting one in cwd if
 * there is none (or the previous one has exited).
 */
export function getSession(key: string, cwd: string, env: NodeJS.ProcessEnv): ShellSession {
  const existing = sessions.get(key);
  if (existing?.alive) {
    return existing;
  }
  const session = new ShellSession(cwd, env);
  sessions.set(key, session);
  return session;
}

/** hasSession reports whether a notebook has a live session. */
export function hasSession(key: string): boolean {
  return sessions.get(key)?.alive ?? false;
}

/** disposeSession ends a notebook's session; the next session cell starts a new one. */
export function disposeSession(key: string): boolean {
  const session = sessions.get(key);
  sessions.delete(key);
  session?.dispose();
  return session !== undefined;
}

/** disposeAllSessions ends every session, e.g. when the extension deactivates. */
export function disposeAllSessions(): void {
  for (const key of [...sessions.keys()]) {
    disposeSession(key);
  }
}
