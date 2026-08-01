import assert from "node:assert/strict";
import test from "node:test";

import { normalizeSyncServiceUrl } from "../src/services/syncUrl.ts";

test("accepts HTTPS and normalizes a trailing slash", () => {
  assert.equal(normalizeSyncServiceUrl(" https://sync.example.com/ "), "https://sync.example.com");
});

test("allows loopback HTTP for local development", () => {
  assert.equal(normalizeSyncServiceUrl("http://localhost:3000"), "http://localhost:3000");
  assert.equal(normalizeSyncServiceUrl("http://127.0.0.1:3000/"), "http://127.0.0.1:3000");
  assert.equal(normalizeSyncServiceUrl("http://[::1]:3000/"), "http://[::1]:3000");
});

test("rejects remote HTTP before authentication can transmit credentials", () => {
  assert.throws(
    () => normalizeSyncServiceUrl("http://sync.example.com"),
    /Use HTTPS/,
  );
});

test("rejects embedded credentials, queries, and fragments", () => {
  assert.throws(() => normalizeSyncServiceUrl("https://user:secret@sync.example.com"), /must not contain credentials/);
  assert.throws(() => normalizeSyncServiceUrl("https://sync.example.com?tenant=one"), /query or fragment/);
  assert.throws(() => normalizeSyncServiceUrl("https://sync.example.com/#vault"), /query or fragment/);
});
