import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
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
      await client.send(new PutObjectCommand({ Bucket, Key: key, Body: bytes }));
    },
    async get(key: string) {
      const response = await client.send(new GetObjectCommand({ Bucket, Key: key }));
      if (!response.Body) throw new Error('Object response has no body');
      return response.Body.transformToByteArray();
    },
    close() {
      client.destroy();
    },
  };
}
