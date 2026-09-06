import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';

/** Server-only S3 adapter configuration; never include credentials in responses. */
export interface ObjectStoreOptions {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/** Binary object storage used by Management. Runtime has no storage credentials. */
export function createObjectStore(options: ObjectStoreOptions) {
  const client = new S3Client({
    endpoint: options.endpoint,
    region: options.region,
    forcePathStyle: true,
    credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
    maxAttempts: 1,
    requestHandler: { connectionTimeout: 3000, requestTimeout: 5000 },
  });
  const Bucket = options.bucket;
  async function get(key: string) {
    const response = await client.send(new GetObjectCommand({ Bucket, Key: key }));
    if (!response.Body) throw new Error('Object response has no body');
    const reader = response.Body.transformToWebStream().getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > 20 * 1024 * 1024) {
          await reader.cancel();
          throw new Error('Object exceeds read limit');
        }
        chunks.push(next.value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  }
  return {
    async initialize() {
      try {
        await client.send(new CreateBucketCommand({ Bucket }));
      } catch (error) {
        if (!(error instanceof Error) || error.name !== 'BucketAlreadyOwnedByYou') throw error;
      }
    },
    async check() {
      await client.send(new HeadBucketCommand({ Bucket }));
    },
    async put(key: string, bytes: Uint8Array) {
      if (key.startsWith('artifacts/')) throw new Error('Artifacts require conditional writes');
      await client.send(new PutObjectCommand({ Bucket, Key: key, Body: bytes }));
    },
    async putImmutable(key: string, bytes: Uint8Array) {
      const snapshot = new Uint8Array(bytes);
      try {
        await client.send(
          new PutObjectCommand({ Bucket, Key: key, Body: snapshot, IfNoneMatch: '*' }),
        );
      } catch (error) {
        // Some S3-compatible servers close the socket instead of returning 412.
        // Resolve only through a read: never retry an uncertain PUT unconditionally.
        let existing: Uint8Array;
        try {
          existing = await get(key);
        } catch {
          // A rejected PUT can leave a closed keep-alive socket in the pool.
          // One additional read is safe even if the previous outcome was unknown.
          try {
            existing = await get(key);
          } catch {
            throw error;
          }
        }
        if (
          existing.byteLength !== snapshot.byteLength ||
          !existing.every((byte, index) => byte === snapshot[index])
        )
          throw new Error('Immutable object address already contains different bytes');
      }
    },
    get,
    async keys(prefix: string) {
      const keys: string[] = [];
      let ContinuationToken: string | undefined;
      do {
        const page = await client.send(
          new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken }),
        );
        keys.push(...(page.Contents ?? []).flatMap((item) => (item.Key ? [item.Key] : [])));
        ContinuationToken = page.NextContinuationToken;
      } while (ContinuationToken);
      return keys;
    },
    async deleteKeys(keys: string[]) {
      if (keys.length)
        await client.send(
          new DeleteObjectsCommand({
            Bucket,
            Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
          }),
        );
    },
    close() {
      client.destroy();
    },
  };
}
