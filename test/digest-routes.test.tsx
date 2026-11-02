import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

type Entry = { at: string; job: string; status: 'ok' | 'retry' | 'fail'; owner: string | null; error?: string };

const at = (n: number) => `2026-10-28T0${n}:00:00+01:00`;
const jsonl = (entries: Entry[]) => entries.map((e) => JSON.stringify(e)).join('\n') + '\n';

// Jobs written out of order so sorting is observable.
const normal: Entry[] = [
  { at: at(1), job: 'job-mango', status: 'ok', owner: 'ana' },
  { at: at(2), job: 'job-apple', status: 'ok', owner: 'ben' },
  { at: at(3), job: 'job-zebra', status: 'ok', owner: null },
];

const warny: Entry[] = [
  { at: at(1), job: 'job-calm', status: 'ok', owner: 'ana' },
  { at: at(2), job: 'job-broken', status: 'fail', owner: 'ben', error: 'boom' },
  { at: at(3), job: 'job-flaky', status: 'retry', owner: 'cy' },
  { at: at(4), job: 'job-flaky', status: 'retry', owner: 'cy' },
  { at: at(5), job: 'job-flaky', status: 'retry', owner: 'cy' },
  { at: at(6), job: 'job-flaky', status: 'ok', owner: 'cy' },
];

let dir: string;
const config = () => ({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: dir });
const get = (path: string) => createApp(config()).request(path);

// The <tr> that mentions a job, as raw text.
function rowFor(html: string, job: string): string {
  const row = html.split(/<tr[\s>]/).find((part) => part.includes(job));
  if (row === undefined) throw new Error(`no row for ${job}`);
  return '<tr ' + row;
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  writeFileSync(join(dir, '2026-10-01.jsonl'), jsonl(normal));
  writeFileSync(join(dir, '2026-10-02.jsonl'), '');
  writeFileSync(join(dir, '2026-10-03.jsonl'), jsonl(normal.slice(0, 2)) + 'this is not json\n');
  writeFileSync(join(dir, '2026-10-04.jsonl'), jsonl(warny));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('digest routes', () => {
  it('serves a normal night as a page and as JSON, same jobs in the same order', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const page = await get('/digest/2026-10-01');
    const html = await page.text();
    expect(page.status).toBe(200);
    expect(html).toContain('TEST-MARKER');

    const api = await get('/api/digest/2026-10-01');
    expect(api.status).toBe(200);
    const body = (await api.json()) as { night: string; rows: { job: string }[]; badLines: number };
    expect(body.night).toBe('2026-10-01');
    expect(body.badLines).toBe(0);
    const jobs = body.rows.map((r) => r.job);
    expect(jobs).toEqual(['job-apple', 'job-mango', 'job-zebra']);

    const inPage = jobs.map((j) => html.indexOf(j));
    expect(inPage.every((i) => i >= 0)).toBe(true);
    expect([...inPage].sort((a, b) => a - b)).toEqual(inPage);
  });

  it('404s on a night with no file, page and JSON', async () => {
    expect((await get('/digest/2026-09-30')).status).toBe(404);
    expect((await get('/api/digest/2026-09-30')).status).toBe(404);
  });

  it('empty night: page says nothing ran, JSON has no rows', async () => {
    const page = await get('/digest/2026-10-02');
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('nothing ran');

    const api = await get('/api/digest/2026-10-02');
    expect(api.status).toBe(200);
    const body = (await api.json()) as { rows: unknown[] };
    expect(body.rows).toEqual([]);
  });

  it('a bad line is counted in JSON and does not break the page', async () => {
    const api = await get('/api/digest/2026-10-03');
    expect(api.status).toBe(200);
    const body = (await api.json()) as { badLines: number; rows: { job: string }[] };
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['job-apple', 'job-mango']);

    const page = await get('/digest/2026-10-03');
    const html = await page.text();
    expect(page.status).toBe(200);
    expect(html).toContain('job-apple');
    expect(html).toContain('job-mango');
  });

  it('marks fail rows and 3-retry rows as warn, and only those', async () => {
    const page = await get('/digest/2026-10-04');
    const html = await page.text();
    expect(page.status).toBe(200);
    expect(rowFor(html, 'job-broken')).toContain('class="warn"');
    expect(rowFor(html, 'job-flaky')).toContain('class="warn"');
    expect(rowFor(html, 'job-calm')).not.toContain('class="warn"');
  });
});
