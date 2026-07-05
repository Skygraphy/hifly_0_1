import { config } from "dotenv";
import { S3Client, HeadBucketCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

config({ path: ".env.local", quiet: true });

const client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const bucket = process.env.AWS_S3_BUCKET_NAME;

try {
  await client.send(new HeadBucketCommand({ Bucket: bucket }));
  console.log(`S3 connection OK: bucket "${bucket}" reachable in ${process.env.AWS_REGION}`);
  const list = await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 5 }));
  console.log("Object count (sample):", list.KeyCount ?? (list.Contents?.length || 0));
} catch (err) {
  console.error("S3 connection FAILED:", err.name, "-", err.message);
  process.exitCode = 1;
}
