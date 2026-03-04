import assert from "node:assert/strict";
import { describe, test, after, before } from "node:test";
import { BufferManager } from "./buffer-manager.js";
import { mkdir, rm, readdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

describe("BufferManager", () => {
  const testDir = join(tmpdir(), `loamlog-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);

  before(async () => {
    await mkdir(testDir, { recursive: true });
  });

  after(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  test("saves payload to disk", async () => {
    const manager = new BufferManager(testDir);
    const payload = {
      session_id: "test-1",
      trigger: "test",
      captured_at: new Date().toISOString(),
      provider: "test",
    };

    await manager.save(payload);

    const files = (await readdir(testDir)).filter(f => f.endsWith(".json"));
    assert.equal(files.length, 1);
    assert.ok(files[0].startsWith("capture-"));
  });

  test("evicts oldest files when limit is reached", async () => {
    const manager = new BufferManager(testDir);
    // Clear dir
    const filesBefore = await readdir(testDir);
    for (const f of filesBefore) await rm(join(testDir, f));

    // Save 51 files (limit is 50)
    for (let i = 0; i < 51; i++) {
      await manager.save({
        session_id: `test-${i}`,
        trigger: "test",
        captured_at: new Date().toISOString(),
        provider: "test",
      });
      // Delay to ensure mtime differences
      await new Promise(r => setTimeout(r, 10));
    }

    const files = (await readdir(testDir)).filter(f => f.endsWith(".json"));
    assert.equal(files.length, 50);
  });

  test("flushes buffer correctly", async () => {
    const manager = new BufferManager(testDir);
    // Clear dir
    const filesBefore = await readdir(testDir);
    for (const f of filesBefore) await rm(join(testDir, f));

    const payload = {
      session_id: "test-flush",
      trigger: "test",
      captured_at: new Date().toISOString(),
      provider: "test",
    };
    await manager.save(payload);

    let called = false;
    await manager.flush(async (p) => {
      assert.equal(p.session_id, "test-flush");
      called = true;
    });

    assert.ok(called);
    const files = (await readdir(testDir)).filter(f => f.endsWith(".json"));
    assert.equal(files.length, 0);
  });
});
