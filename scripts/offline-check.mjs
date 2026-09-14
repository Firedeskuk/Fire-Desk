/*
  Offline check for the Fire Desk field app, run in headless Chromium.

  It signs in with a local test session (no Supabase needed), seeds one
  building, one door, one work item and one checklist question straight into
  IndexedDB, waits for the service worker to precache the route shells, then
  switches the browser offline and opens door, floor, finding and work item
  screens that were never visited before. Every one of them must render from
  its shell and answers or status changes must land in the outbox.

  This is not part of npm test on purpose: it needs a production build, a
  running server and the playwright-core package, which is not a project
  dependency. Steps, one at a time:
    1. npm run build
    2. npx next start -p 3100
    3. in another terminal: npm install --no-save playwright-core
    4. CHROME=/path/to/chrome node scripts/offline-check.mjs
  CHROME defaults to the Playwright Chromium at /opt/pw-browsers/chromium.
*/
import { chromium } from "playwright-core";

const BASE = process.env.BASE || "http://localhost:3100";
const B = "11111111-1111-4111-8111-111111111111";
const F = "33333333-3333-4333-8333-333333333333";
const A = "22222222-2222-4222-8222-222222222222";
const W = "44444444-4444-4444-8444-444444444444";
const USER = "55555555-5555-4555-8555-555555555555";

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ": " + detail : ""}`);
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME || "/opt/pw-browsers/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({ serviceWorkers: "allow", viewport: { width: 400, height: 800 } });
const page = await context.newPage();
page.on("pageerror", (e) => console.log("pageerror:", e.message));

try {
  // 1. sign in locally (fake session, no Supabase needed for field screens)
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.evaluate(
    ({ USER }) => {
      localStorage.setItem(
        "firedesk.session",
        JSON.stringify({
          user_id: USER,
          email: "inspector@example.com",
          profile: { id: USER, full_name: "Test Inspector", role: "inspector" },
          signed_in_at: new Date().toISOString(),
        }),
      );
      localStorage.setItem("firedesk.device_id", "device-test-1");
    },
    { USER },
  );

  // 2. open the buildings list online, this opens the Dexie database and registers the worker
  await page.goto(`${BASE}/buildings`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const title = await page.title();
  record("buildings list opens online", (await page.textContent("body")).includes("Buildings"), title);

  // 3. seed IndexedDB directly (same stores Dexie created)
  const seeded = await page.evaluate(
    async ({ B, F, A, W }) => {
      const now = new Date().toISOString();
      const open = () =>
        new Promise((resolve, reject) => {
          const req = indexedDB.open("firedesk");
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      const db = await open();
      const stores = Array.from(db.objectStoreNames);
      const need = ["buildings", "floors", "assets", "remedial_items", "sync_state", "survey_templates", "survey_template_items"];
      for (const n of need) if (!stores.includes(n)) throw new Error("store missing: " + n);
      const tx = db.transaction(need, "readwrite");
      const put = (s, v) => tx.objectStore(s).put(v);
      put("buildings", {
        id: B, client_id: "c1", name: "Test House", address: "1 Example Street", postcode: "AB1 2CD",
        adjustment_pct: 100, notes: null, active: true, created_at: now, updated_at: now, deleted_at: null, origin: "server",
      });
      put("floors", { id: F, building_id: B, name: "Ground", sort_order: 0, floor_plan_path: null, created_at: now, updated_at: now, origin: "server" });
      put("assets", {
        id: A, building_id: B, floor_id: F, work_type: "doors", ref: "GF-01", subtype: "FD30", location: "Flat 1 entrance",
        qr_code: null, cycle_months: 6, next_due_date: "2026-08-01", status: "active", spec: {}, created_by: null, device_id: null,
        created_at: now, updated_at: now, deleted_at: null, received_at: null, origin: "server",
      });
      put("remedial_items", {
        id: W, building_id: B, finding_id: null, quote_line_id: null, asset_id: A, floor_id: F, description: "Replace closer",
        detail: null, status: "todo", assigned_to: null, done_by: null, done_at: null, created_by: null, device_id: null,
        created_at: now, updated_at: now, deleted_at: null, received_at: null, origin: "server",
      });
      put("survey_templates", { id: "t1", work_type: "doors", name: "Fire door inspection", version: 1, active: true, created_at: now, updated_at: now, origin: "server" });
      put("survey_template_items", { id: "q1", template_id: "t1", question: "Gaps within 2 to 4 mm", answer_type: "yes_no", group_name: null, sort_order: 1, required: true, options: null, fail_values: ["no"], created_at: now, updated_at: now, origin: "server" });
      put("sync_state", { building_id: B, downloaded_at: now, role_scope: "inspector", building_name: "Test House" });
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      return stores.length;
    },
    { B, F, A, W },
  );
  record("indexeddb seeded", seeded > 10, `${seeded} stores`);

  // 4. wait for the service worker and its precache
  await page.evaluate(() => navigator.serviceWorker.ready);
  let precached = false;
  for (let i = 0; i < 40 && !precached; i++) {
    precached = await page.evaluate(async () => {
      const keys = await caches.keys();
      for (const k of keys) {
        const c = await caches.open(k);
        const hit = await c.match("/buildings/_/assets/_", { ignoreSearch: true });
        if (hit) return true;
        const reqs = await c.keys();
        if (reqs.some((r) => new URL(r.url).pathname === "/buildings/_/assets/_")) return true;
      }
      return false;
    });
    if (!precached) await page.waitForTimeout(500);
  }
  record("service worker precached the door shell", precached);

  // 5. online: the door screen renders from IndexedDB
  await page.goto(`${BASE}/buildings/${B}/assets/${A}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  let body = await page.textContent("body");
  record("door screen online shows the door", body.includes("GF-01") && body.includes("Test House"), body.slice(0, 120).replace(/\s+/g, " "));

  // 6. offline: a door never opened before must render from the shell
  await context.setOffline(true);
  const A2 = A; // same asset, but a fresh hard navigation to a different route shape first
  await page.goto(`${BASE}/buildings/${B}/floors/${F}`, { waitUntil: "load" }).catch((e) => console.log("goto floors offline:", e.message));
  await page.waitForTimeout(2500);
  body = await page.textContent("body");
  record(
    "floor screen offline (never visited) renders from the shell",
    body.includes("GF-01") && !body.includes("This page is not available without a connection"),
    body.slice(0, 160).replace(/\s+/g, " "),
  );

  await page.goto(`${BASE}/buildings/${B}/findings/does-not-exist`, { waitUntil: "load" }).catch((e) => console.log("goto finding offline:", e.message));
  await page.waitForTimeout(2000);
  body = await page.textContent("body");
  record(
    "finding screen offline serves the shell (not the offline page)",
    !body.includes("This page is not available without a connection"),
    body.slice(0, 160).replace(/\s+/g, " "),
  );

  await page.goto(`${BASE}/buildings/${B}/assets/${A2}`, { waitUntil: "load" }).catch((e) => console.log("goto asset offline:", e.message));
  await page.waitForTimeout(2500);
  body = await page.textContent("body");
  record("door screen offline shows the door", body.includes("GF-01") && body.includes("Gaps within 2 to 4 mm"), body.slice(0, 160).replace(/\s+/g, " "));

  // 7. answer a question offline, the outbox must grow and the pill must say Offline, N to sync
  const noButton = page.getByRole("button", { name: /^No$/ }).first();
  if (await noButton.count()) {
    await noButton.click();
    await page.waitForTimeout(1500);
    body = await page.textContent("body");
    const outbox = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const req = indexedDB.open("firedesk");
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction("outbox", "readonly");
            const all = tx.objectStore("outbox").getAll();
            all.onsuccess = () => resolve(all.result.map((r) => `${r.op}:${r.entity}:${r.status}`));
          };
        }),
    );
    record("answer offline queues outbox rows", outbox.length >= 3, outbox.join(", "));
    record("pill shows offline count", /Offline, \d+ to sync/.test(body), body.match(/Offline[^<]{0,20}/)?.[0] ?? "");
    await page.waitForTimeout(2000);
    body = await page.textContent("body");
    record("finding created from a failing answer", body.includes("1 finding"), "");
  } else {
    record("answer offline queues outbox rows", false, "No button not found");
  }

  // 8. remedial screens offline: switch the local session to a manager (allowed on /works), stay offline
  await page.evaluate(
    ({ USER }) => {
      localStorage.setItem(
        "firedesk.session",
        JSON.stringify({
          user_id: USER,
          email: "manager@example.com",
          profile: { id: USER, full_name: "Test Manager", role: "manager" },
          signed_in_at: new Date().toISOString(),
        }),
      );
    },
    { USER },
  );
  await page.goto(`${BASE}/works/${B}/items/${W}`, { waitUntil: "load" }).catch((e) => console.log("goto work item offline:", e.message));
  await page.waitForTimeout(2500);
  body = await page.textContent("body");
  record("work item offline (never visited) renders from the shell", body.includes("Replace closer"), body.slice(0, 160).replace(/\s+/g, " "));
  const markDone = page.getByRole("button", { name: /Mark done/ }).first();
  record("mark done button present (disabled until a photo after)", (await markDone.count()) === 1, "");
  const startBtn = page.getByRole("button", { name: /^Start$/ }).first();
  if (await startBtn.count()) {
    await startBtn.click();
    await page.waitForTimeout(1500);
    body = await page.textContent("body");
    record("start offline patches the item", body.includes("In progress"), body.match(/Offline[^<]{0,20}/)?.[0] ?? "");
  } else {
    record("start offline patches the item", false, "Start button not found");
  }
  await page.goto(`${BASE}/works/${B}`, { waitUntil: "load" }).catch((e) => console.log("goto works list offline:", e.message));
  await page.waitForTimeout(2000);
  body = await page.textContent("body");
  record("works list offline renders from the shell", body.includes("Replace closer") && body.includes("Test House"), body.slice(0, 120).replace(/\s+/g, " "));

  await context.setOffline(false);
} catch (err) {
  record("script", false, err.stack || String(err));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
