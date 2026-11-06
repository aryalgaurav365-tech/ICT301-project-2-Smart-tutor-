import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
export function storage({ dataDir, production }) {
  const remote = !!process.env.S3_BUCKET;
  const client = remote
    ? new S3Client({
        region: process.env.S3_REGION || "auto",
        endpoint: process.env.S3_ENDPOINT || undefined,
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
        credentials: process.env.S3_ACCESS_KEY_ID
          ? {
              accessKeyId: process.env.S3_ACCESS_KEY_ID,
              secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
            }
          : undefined,
      })
    : null;
  const keyPath = (key) => {
    if (!/^[a-f0-9]{48}\.(pdf|webp)$/.test(key))
      throw new Error("Invalid storage key");
    return path.join(dataDir, "uploads", key);
  };
  return {
    available: !production || remote || process.env.PERSISTENT_DISK === "true",
    remote,
    async put(buffer, extension, type) {
      if (production && !remote && process.env.PERSISTENT_DISK !== "true")
        throw Object.assign(
          new Error("Configure persistent file storage before uploading"),
          { status: 503 },
        );
      const key = randomBytes(24).toString("hex") + "." + extension;
      if (remote) {
        await client.send(
          new PutObjectCommand({
            Bucket: process.env.S3_BUCKET,
            Key: key,
            Body: buffer,
            ContentType: type,
          }),
        );
        return "s3:" + key;
      }
      await fs.mkdir(path.dirname(keyPath(key)), { recursive: true });
      await fs.writeFile(keyPath(key), buffer);
      return key;
    },
    async send(
      res,
      file,
      { attachment = false, type = "application/pdf" } = {},
    ) {
      if (file.startsWith("s3:")) {
        if (!client)
          throw Object.assign(new Error("Object storage is unavailable"), {
            status: 503,
          });
        const key = file.slice(3);
        keyPath(key);
        const url = await getSignedUrl(
          client,
          new GetObjectCommand({
            Bucket: process.env.S3_BUCKET,
            Key: key,
            ResponseContentType: type,
            ResponseContentDisposition: attachment
              ? 'attachment; filename="learning-resource.pdf"'
              : "inline",
          }),
          { expiresIn: 60 },
        );
        return res.redirect(url);
      }
      // Retain access to legacy local PDF names from version 1.
      if (!/^[a-f0-9]{48,64}\.(pdf|webp)$/.test(file))
        throw new Error("Invalid stored filename");
      res.type(type);
      if (attachment) res.attachment("learning-resource.pdf");
      return res.sendFile(path.join(dataDir, "uploads", file));
    },
    async remove(file) {
      if (!file) return;
      if (file.startsWith("s3:")) {
        if (!client) throw new Error("Object storage unavailable");
        const key = file.slice(3);
        keyPath(key);
        await client.send(
          new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
        );
      } else {
        if (!/^[a-f0-9]{48,64}\.(pdf|webp)$/.test(file))
          throw new Error("Invalid stored filename");
        await fs.rm(path.join(dataDir, "uploads", file), { force: true });
      }
    },
  };
}
