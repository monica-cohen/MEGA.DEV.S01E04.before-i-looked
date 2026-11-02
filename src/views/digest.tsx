import type { DigestRow, Night } from '../digest/types.js';

const dash = '—';

function marks(row: DigestRow): string[] {
  const out: string[] = [];
  if (row.lastStatus === 'fail') out.push('fail');
  if (row.retries >= 3) out.push('3+ retries');
  return out;
}

function Row({ row }: { row: DigestRow }) {
  const flagged = marks(row);
  return (
    <tr class={flagged.length > 0 ? 'warn' : undefined}>
      <td>
        {flagged.length > 0 ? `⚠ ${row.job}` : row.job}
        {flagged.length > 0 ? <span> ({flagged.join(', ')})</span> : null}
      </td>
      <td>{row.owner ?? dash}</td>
      <td>{row.runs}</td>
      <td>{row.retries}</td>
      <td>{row.lastStatus}</td>
      <td>{row.lastError ?? dash}</td>
      <td>{row.firstAt}</td>
      <td>{row.lastAt}</td>
    </tr>
  );
}

export function DigestPage({ night }: { night: Night }) {
  return (
    <>
      <h1>digest · {night.night}</h1>
      {night.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
            </tr>
          </thead>
          <tbody>
            {night.rows.map((row) => (
              <Row row={row} />
            ))}
          </tbody>
        </table>
      )}
      {night.badLines > 0 ? (
        <p class="mute">
          {night.badLines} {night.badLines === 1 ? 'line' : 'lines'} could not be read
        </p>
      ) : null}
    </>
  );
}

export function DigestMissing({ night }: { night: string }) {
  return (
    <>
      <h1>digest · {night}</h1>
      <p class="mute">no run log for that night</p>
    </>
  );
}
