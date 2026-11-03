import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getEnv } from "@/lib/config";

export type StorageProvider = "b2" | "vercel" | "postgres";

const B2_PREFIX = "b2://";

function b2Settings() {
  const endpoint = getEnv("B2_ENDPOINT");
  const keyId = getEnv("B2_KEY_ID");
  const appKey = getEnv("B2_APPLICATION_KEY");
  const bucket = getEnv("B2_BUCKET");
  if (!endpoint || !keyId || !appKey || !bucket) return null;
  const url = new URL(endpoint.includes("://") ? endpoint : `https://${endpoint}`);
  const derivedRegion =
    /^s3\.([^.]+)\.backblazeb2\.com$/i.exec(url.hostname)?.[1] ?? "us-east-1";
  return {
    endpoint: url.toString().replace(/\/$/, ""),
    region: getEnv("B2_REGION") ?? derivedRegion,
    keyId,
    appKey,
    bucket,
  };
}

export function storageProvider(): StorageProvider {
  if (b2Settings()) return "b2";
  if (getEnv("BLOB_READ_WRITE_TOKEN")) return "vercel";
  return "postgres";
}

let cachedClient: S3Client | null = null;

function client() {
  const settings = b2Settings();
  if (!settings) throw new Error("Backblaze B2 no está configurado");
  if (!cachedClient) {
    cachedClient = new S3Client({
      endpoint: settings.endpoint,
      region: settings.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: settings.keyId,
        secretAccessKey: settings.appKey,
      },
    });
  }
  return { client: cachedClient, bucket: settings.bucket };
}

export function b2Ref(key: string) {
  return `${B2_PREFIX}${key}`;
}

export function isB2Ref(value: string | null | undefined): value is string {
  return Boolean(value?.startsWith(B2_PREFIX));
}

export function b2KeyFromRef(value: string) {
  return value.startsWith(B2_PREFIX) ? value.slice(B2_PREFIX.length) : value;
}

export async function putB2(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  const { client: s3, bucket } = client();
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return b2Ref(key);
}

export async function signedB2Url(key: string, expiresIn = 3600) {
  const { client: s3, bucket } = client();
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn },
  );
}

export async function deleteB2(key: string) {
  const { client: s3, bucket } = client();
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export function attachmentKey(vaultId: string, path: string) {
  return `vaults/${vaultId}/attachments/${path}`;
}

export function backupKey(vaultId: string, filename: string) {
  return `backups/${vaultId}/${filename}`;
}
