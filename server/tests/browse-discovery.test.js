import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import http from "node:http";
import fs from "fs";
import path from "path";
import express from "express";

// Ensure Firebase credentials are loaded for Firestore connection during this test if key file exists
const credFile = path.resolve("nimstreak-firebase-adminsdk-fbsvc-45751e68e8.json");
if (fs.existsSync(credFile) && !process.env.FIREBASE_SERVICE_ACCOUNT) {
  process.env.FIREBASE_SERVICE_ACCOUNT = fs.readFileSync(credFile, "utf-8");
}

import * as db from "../src/db.js";

describe("Browse Discovery & getChallenges without composite index", () => {
  let serverInstance = null;
  let baseUrl = "";

  before(async () => {
    await db.initDb();

    // Create a lightweight Express test server for /api/challenges
    const testApp = express();
    testApp.get("/api/challenges", async (req, res) => {
      const { category, status = "active", type, search } = req.query;
      try {
        const list = await db.getChallenges({ category, status, type, search });
        return res.json(list);
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    });

    await new Promise((resolve) => {
      serverInstance = http.createServer(testApp);
      serverInstance.listen(0, "127.0.0.1", () => {
        const port = serverInstance.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (serverInstance) {
      await new Promise((resolve) => serverInstance.close(resolve));
    }
  });

  it("getChallenges({ status: 'active' }) executes without requiring composite index", async () => {
    const list = await db.getChallenges({ status: "active" });
    assert.ok(Array.isArray(list), "Expected list to be an array");
    assert.ok(list.length > 0, "Expected at least one active challenge");
  });

  it("results are sorted by created_at descending", async () => {
    const list = await db.getChallenges({ status: "active" });
    assert.ok(list.length >= 2, "Expected multiple challenges to verify sort order");
    for (let i = 0; i < list.length - 1; i++) {
      const current = new Date(list[i].created_at || 0).getTime();
      const next = new Date(list[i + 1].created_at || 0).getTime();
      assert.ok(
        current >= next,
        `Expected ${list[i].title} (${list[i].created_at}) to be >= ${list[i + 1].title} (${list[i + 1].created_at})`
      );
    }
  });

  it("category 'health' filtering works and returns 'Eating egg daily'", async () => {
    const list = await db.getChallenges({ category: "health" });
    assert.ok(Array.isArray(list), "Expected health category results to be an array");
    const eggChallenge = list.find((c) => c.title === "Eating egg daily");
    assert.ok(eggChallenge, "Expected 'Eating egg daily' to be found under health category");
    assert.strictEqual(eggChallenge.category, "health");
    assert.strictEqual(eggChallenge.status, "active");
  });

  it("GET /api/challenges returns real Firestore challenges rather than memory seed challenges", async () => {
    const res = await fetch(`${baseUrl}/api/challenges`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data));

    // Must include production Firestore challenges like 'Eating egg daily'
    const foundProductionChallenge = data.some((c) => c.title === "Eating egg daily");
    assert.strictEqual(
      foundProductionChallenge,
      true,
      "Expected GET /api/challenges to return production challenge 'Eating egg daily'"
    );

    // Must NOT fall back to only the 3 hardcoded seed challenges
    const seedOnly = data.length === 3 && data.every((c) => c.id.startsWith("c1-") || c.id.startsWith("c2-") || c.id.startsWith("c3-"));
    assert.strictEqual(seedOnly, false, "GET /api/challenges must not fall back to memory seed challenges");
  });
});
