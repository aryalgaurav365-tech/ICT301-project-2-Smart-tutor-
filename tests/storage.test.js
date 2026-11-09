import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import nodemailer from "nodemailer";
import { storage } from "../apps/api/src/storage.js";
import { database, migrate, now } from "../apps/api/src/db.js";
import { jobs } from "../apps/api/src/jobs.js";
test("S3-compatible storage uploads privately and signs short-lived download links", async () => {
  const objects = new Map(),
    requests = [];
  const server = createServer(async (req, res) => {
    requests.push({
      method: req.method,
      acl: req.headers["x-amz-acl"],
      authorization: req.headers.authorization,
    });
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (req.method === "HEAD") {
      const bytes = objects.get(pathname);
      if (!bytes) {
        res.statusCode = 404;
        res.end();
        return;
      }
      res.setHeader(
        "ETag",
        '"' + createHash("sha256").update(bytes).digest("hex") + '"',
      );
      res.setHeader("Content-Length", bytes.length);
      res.setHeader("Content-Type", "application/pdf");
      res.end();
    } else if (req.method === "PUT" && req.headers["x-amz-copy-source"]) {
      const source =
        "/" +
        decodeURIComponent(req.headers["x-amz-copy-source"]).replace(/^\//, "");
      objects.set(pathname, Buffer.from(objects.get(source)));
      res.setHeader("Content-Type", "application/xml");
      res.end(
        '<CopyObjectResult><ETag>"copied"</ETag><LastModified>2026-11-09T00:00:00.000Z</LastModified></CopyObjectResult>',
      );
    } else if (req.method === "PUT") {
      const chunks = [];
      for await (const b of req) chunks.push(b);
      objects.set(pathname, Buffer.concat(chunks));
      res.setHeader("ETag", '"test-etag"');
      res.end();
    } else if (req.method === "GET") {
      res.setHeader("Content-Type", "application/pdf");
      const bytes = objects.get(pathname);
      if (req.headers.range === "bytes=0-4") {
        res.statusCode = 206;
        res.end(bytes.subarray(0, 5));
      } else res.end(bytes);
    } else {
      objects.delete(pathname);
      res.statusCode = 204;
      res.end();
    }
  }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const keys = [
      "S3_BUCKET",
      "S3_ENDPOINT",
      "S3_REGION",
      "S3_ACCESS_KEY_ID",
      "S3_SECRET_ACCESS_KEY",
      "S3_FORCE_PATH_STYLE",
    ],
    previous = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  Object.assign(process.env, {
    S3_BUCKET: "test-private-bucket",
    S3_ENDPOINT: `http://127.0.0.1:${server.address().port}`,
    S3_REGION: "us-east-1",
    S3_ACCESS_KEY_ID: "TEST_ACCESS_KEY",
    S3_SECRET_ACCESS_KEY: "TEST_SECRET_KEY",
    S3_FORCE_PATH_STYLE: "true",
  });
  try {
    const store = storage({ production: true, dataDir: "/tmp" });
    const key = await store.put(
      Buffer.from("%PDF-test"),
      "pdf",
      "application/pdf",
    );
    assert.ok(key.startsWith("s3:"));
    let signed;
    await store.send(
      {
        redirect: (url) => {
          signed = url;
        },
      },
      key,
      { attachment: true },
    );
    const url = new URL(signed);
    assert.equal(url.searchParams.get("X-Amz-Expires"), "60");
    assert.ok(url.searchParams.get("X-Amz-Signature"));
    assert.equal(await fetch(signed).then((r) => r.text()), "%PDF-test");
    assert.equal(requests[0].acl, undefined);
    assert.ok(requests[0].authorization.startsWith("AWS4-HMAC-SHA256"));
    await store.remove(key);
    assert.equal(objects.size, 0);
    await assert.rejects(store.send({}, "s3:../private-key"));
    const bytes = Buffer.alloc(20 * 1024 * 1024, 32);
    bytes.write("%PDF-1.4");
    const ticket = await store.stagePdf(bytes.length);
    assert.equal(new URL(ticket.url).searchParams.get("X-Amz-Expires"), "300");
    assert.equal(
      (
        await fetch(ticket.url, {
          method: "PUT",
          headers: { "Content-Type": "application/pdf" },
          body: bytes,
        })
      ).status,
      200,
    );
    const final = await store.promotePdf(ticket.key, bytes.length);
    assert.ok(final.startsWith("s3:") && !final.includes("staging/"));
    await store.send(
      {
        redirect: (url) => {
          signed = url;
        },
      },
      final,
      { attachment: true },
    );
    assert.equal(
      (await fetch(signed).then((r) => r.arrayBuffer())).byteLength,
      20 * 1024 * 1024,
    );
    // Reusing the short-lived staging URL cannot overwrite validated final content.
    await fetch(ticket.url, {
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      body: Buffer.alloc(bytes.length, 65),
    });
    const original = await fetch(signed).then((r) => r.arrayBuffer());
    assert.equal(Buffer.from(original).subarray(0, 5).toString(), "%PDF-");
    await assert.rejects(
      store.promotePdf(ticket.key, bytes.length),
      (e) => e.status === 400,
    );
    await store.remove("s3:" + ticket.key);
    await store.remove(final);
  } finally {
    for (const k of keys)
      if (previous[k] === undefined) delete process.env[k];
      else process.env[k] = previous[k];
    await new Promise((r) => server.close(r));
  }
});
test("real Nodemailer transport serializes an outgoing message before the job is marked sent", async () => {
  const db = database(":memory:");
  try {
    await migrate(db);
    await db("mail").insert({
      recipient: "learner@example.test",
      subject: "Welcome to SmartTutor",
      body: "Your learning journey starts here.",
      job_key: "serialization",
      created_at: now(),
    });
    const sender = nodemailer.createTransport({
      streamTransport: true,
      buffer: true,
      newline: "unix",
    });
    let output;
    await jobs(db, {
      transport: {
        sendMail: async (options) => {
          output = await sender.sendMail({
            ...options,
            from: "SmartTutor <sender@example.test>",
          });
          return output;
        },
      },
    });
    assert.ok(
      output.message.toString().includes("Your learning journey starts here."),
    );
    assert.equal((await db("mail").first()).status, "sent");
  } finally {
    await db.destroy();
  }
});

test("spreadsheet output contains escaped literal cells and proper workbook relationships", async () => {
  const { spreadsheet } = await import("../apps/api/src/spreadsheet.js");
  const { unzipSync, strFromU8 } = await import("fflate");
  const files = unzipSync(
    spreadsheet([
      {
        id: 1,
        student_id: 2,
        tutor_id: 3,
        starts_at: "2026-11-06T10:00:00Z",
        ends_at: "2026-11-06T11:00:00Z",
        status: '=HYPERLINK("x") & <test>',
      },
    ]),
  );
  assert.ok(files["[Content_Types].xml"]);
  assert.ok(
    strFromU8(files["xl/_rels/workbook.xml.rels"]).includes(
      "worksheets/sheet1.xml",
    ),
  );
  const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
  assert.ok(sheet.includes('t="inlineStr"'));
  assert.ok(sheet.includes("=HYPERLINK(&quot;x&quot;) &amp; &lt;test&gt;"));
  assert.equal(sheet.includes("<f>"), false);
});
