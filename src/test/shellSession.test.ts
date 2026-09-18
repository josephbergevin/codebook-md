import * as os from 'os';
import { CellRun, ShellSession, shellQuote, getSession, hasSession, disposeSession } from '../shellSession';

interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

// collect waits for a cell run to close and gathers its output
function collect(run: CellRun): Promise<RunResult> {
  return new Promise(resolve => {
    let stdout = '';
    let stderr = '';
    run.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    run.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    run.on('close', (code: number) => resolve({ stdout, stderr, code }));
  });
}

const describeUnix = process.platform === 'win32' ? describe.skip : describe;

describe('shellQuote', () => {
  it('wraps values in single quotes and escapes embedded quotes', () => {
    expect(shellQuote('/tmp/a b')).toBe(`'/tmp/a b'`);
    expect(shellQuote(`it's`)).toBe(`'it'\\''s'`);
  });
});

describeUnix('ShellSession', () => {
  let session: ShellSession;

  beforeEach(() => {
    session = new ShellSession(os.tmpdir(), { ...process.env });
  });

  afterEach(() => {
    session.dispose();
  });

  it('keeps variables, exports and the working directory between runs', async () => {
    const first = await collect(session.run('cd /\nexport GREETING=hello\nNAME=world\necho first'));
    expect(first).toEqual({ stdout: 'first\n', stderr: '', code: 0 });

    const second = await collect(session.run('echo "$GREETING $NAME from $(pwd)"'));
    expect(second.stdout).toBe('hello world from /\n');
  });

  it('keeps functions between runs', async () => {
    await collect(session.run('greet() { echo "hi $1"; }'));
    expect((await collect(session.run('greet there'))).stdout).toBe('hi there\n');
  });

  it('reports the exit code of the last command and routes stderr', async () => {
    const result = await collect(session.run('echo out\necho err >&2\n(exit 3)'));
    expect(result).toEqual({ stdout: 'out\n', stderr: 'err\n', code: 3 });
  });

  it('continues past a failing command, like a terminal', async () => {
    const result = await collect(session.run('false\necho still-running'));
    expect(result.stdout).toBe('still-running\n');
    expect(result.code).toBe(0);
  });

  it('handles output without a trailing newline', async () => {
    expect((await collect(session.run('printf no-newline'))).stdout).toBe('no-newline');
    expect((await collect(session.run('echo next'))).stdout).toBe('next\n');
  });

  it('gives commands an empty stdin instead of hanging', async () => {
    const result = await collect(session.run('cat\necho after-cat'));
    expect(result.stdout).toBe('after-cat\n');
  });

  it('queues runs started while another is running', async () => {
    const slow = collect(session.run('sleep 0.3; echo slow'));
    const fast = collect(session.run('echo fast'));
    const order: string[] = [];
    await Promise.all([
      slow.then(r => order.push(r.stdout.trim())),
      fast.then(r => order.push(r.stdout.trim())),
    ]);
    expect(order).toEqual(['slow', 'fast']);
  });

  it('interrupts the running cell but keeps the session and its state', async () => {
    await collect(session.run('export KEEP=kept'));
    const run = session.run('echo started; sleep 10; echo not-reached');
    const pending = collect(run);
    await new Promise(resolve => setTimeout(resolve, 300));
    run.kill();
    const result = await pending;
    expect(result.stdout).toBe('started\n');
    expect(result.code).toBe(130);
    expect(session.alive).toBe(true);
    expect((await collect(session.run('echo $KEEP'))).stdout).toBe('kept\n');
  }, 10000);

  it('ends the session when a cell runs exit', async () => {
    const result = await collect(session.run('echo bye\nexit 4'));
    expect(result.stdout).toBe('bye\n');
    expect(result.code).toBe(4);
    expect(result.stderr).toContain('shell session ended');
    expect(session.alive).toBe(false);

    const after = await collect(session.run('echo hi'));
    expect(after.code).toBe(1);
    expect(after.stderr).toContain('has ended');
  });
});

describeUnix('session registry', () => {
  afterEach(() => {
    disposeSession('nb-1');
  });

  it('reuses a live session and replaces one that has exited', async () => {
    const first = getSession('nb-1', os.tmpdir(), { ...process.env });
    expect(getSession('nb-1', os.tmpdir(), { ...process.env })).toBe(first);
    expect(hasSession('nb-1')).toBe(true);

    await collect(first.run('exit 0'));
    const second = getSession('nb-1', os.tmpdir(), { ...process.env });
    expect(second).not.toBe(first);
    expect(second.alive).toBe(true);
  });

  it('disposes a session on request', () => {
    getSession('nb-1', os.tmpdir(), { ...process.env });
    expect(disposeSession('nb-1')).toBe(true);
    expect(hasSession('nb-1')).toBe(false);
    expect(disposeSession('nb-1')).toBe(false);
  });
});
