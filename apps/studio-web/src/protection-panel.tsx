import { useState } from 'react';
import { z } from 'zod';

const impactSchema = z.object({
  artifactId: z.string(),
  objectCount: z.number(),
  versions: z.array(z.string()),
  channels: z.array(z.object({ gameId: z.string(), channel: z.string() })),
  blocked: z.literal(true).optional(),
  confirmationRequired: z.literal(true).optional(),
  removed: z.literal(true).optional(),
});
type Impact = z.infer<typeof impactSchema>;

async function cleanup(artifactId: string, confirmation: boolean) {
  const response = await fetch(
    `/api/protection/artifacts/${encodeURIComponent(artifactId)}/cleanup`,
    {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirmation }),
    },
  );
  if (!response.ok && response.status !== 409) throw new Error('Artifact 清理服务不可用。');
  return impactSchema.parse(await response.json());
}

export function ProtectionPanel() {
  const [artifactId, setArtifactId] = useState('');
  const [impact, setImpact] = useState<Impact | null>(null);
  const [error, setError] = useState('');
  const run = (confirmation: boolean) =>
    void cleanup(artifactId, confirmation).then(setImpact, (failure: Error) =>
      setError(failure.message),
    );
  return (
    <section className="draft-workspace">
      <h2>Artifact 清理</h2>
      <label>
        Artifact ID
        <input value={artifactId} onChange={(event) => setArtifactId(event.target.value)} />
      </label>
      <button disabled={!/^[a-f0-9]{64}$/.test(artifactId)} onClick={() => run(false)}>
        查看影响范围
      </button>
      {impact && (
        <dialog open aria-label="Artifact 清理确认">
          <p>
            {impact.objectCount} 个对象；{impact.versions.length} 个版本；{impact.channels.length}{' '}
            个 Channel 引用。
          </p>
          {impact.blocked ? (
            <p role="alert">Artifact 正被引用，拒绝删除。</p>
          ) : impact.removed ? (
            <p role="status">Artifact 已清理。</p>
          ) : (
            <button onClick={() => run(true)}>确认清理</button>
          )}
          <button onClick={() => setImpact(null)}>关闭</button>
        </dialog>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
