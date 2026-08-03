import { execSync, spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

import { createDiscoverRepository } from "../data/discover-repository.mjs";

const root = resolve(import.meta.dirname, "..");
const origin = "http://127.0.0.1:5511";
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const configPath = join(root, "frontend-config.local.mjs");
const disabledConfigPath = join(root, "frontend-config.local.mjs.following-integration");
const browserProfile = await mkdtemp(join(tmpdir(), "chained-following-integration-"));
const storageObjects = [];
const assertions = [];
const pending = new Map();
let server;
let chrome;
let socket;
let sequence = 0;
let stage = "reading local configuration";

function record(name, condition) {
  assert.equal(Boolean(condition), true, name);
  assertions.push(name);
}

function wait(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function localStatus() {
  const output = execSync("npx.cmd supabase status --output json", {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" }
  });
  const match = output.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("local_status_unavailable");
  const parsed = JSON.parse(match[0]);
  const api = new URL(parsed.API_URL);
  if (api.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(api.hostname)) {
    throw new Error("non_local_endpoint");
  }
  return {
    api: api.origin,
    publishable: parsed.PUBLISHABLE_KEY || parsed.ANON_KEY,
    trusted: parsed.SERVICE_ROLE_KEY || parsed.SECRET_KEY
  };
}

function runSql(statement) {
  const result = spawnSync(
    "docker",
    ["exec", "-i", "supabase_db_CHAINED", "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-q"],
    { input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
  );
  if (result.status !== 0) throw new Error("trusted_fixture_failed");
}

function storageUrl(api, route, bucket, path) {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${api}/storage/v1/object/${route}${bucket}/${encoded}`;
}

async function adminCreateUser(status, email, password) {
  const response = await fetch(`${status.api}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: status.trusted,
      Authorization: `Bearer ${status.trusted}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password, email_confirm: true })
  });
  if (!response.ok) throw new Error("local_auth_fixture_failed");
  const user = await response.json();
  if (!user?.id) throw new Error("local_auth_fixture_failed");
  return user.id;
}

async function signIn(status, email, password) {
  const response = await fetch(`${status.api}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: status.publishable, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!response.ok) throw new Error("local_sign_in_failed");
  const session = await response.json();
  if (!session.access_token || !session.refresh_token) throw new Error("local_sign_in_failed");
  return { accessToken: session.access_token, refreshToken: session.refresh_token };
}

async function upload(status, bucket, path, bytes) {
  const response = await fetch(storageUrl(status.api, "", bucket, path), {
    method: "POST",
    headers: {
      apikey: status.trusted,
      Authorization: `Bearer ${status.trusted}`,
      "Content-Type": "image/png",
      "x-upsert": "false"
    },
    body: bytes
  });
  if (!response.ok) throw new Error("storage_fixture_failed");
  storageObjects.push({ bucket, path });
}

async function removeStorage(status, bucket, path) {
  await fetch(storageUrl(status.api, "", bucket, path), {
    method: "DELETE",
    headers: { apikey: status.trusted, Authorization: `Bearer ${status.trusted}` }
  });
}

async function rest(status, token, table, query = "") {
  const response = await fetch(`${status.api}/rest/v1/${table}${query}`, {
    headers: {
      apikey: status.publishable,
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    }
  });
  if (!response.ok) throw new Error("local_rest_failed");
  return response.json();
}

async function insertFollow(status, token, accountId, profileId) {
  return fetch(`${status.api}/rest/v1/profile_follows`, {
    method: "POST",
    headers: {
      apikey: status.publishable,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify({ account_id: accountId, profile_id: profileId })
  });
}

function mimeType(pathname) {
  return ({
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".webp": "image/webp"
  })[extname(pathname).toLowerCase()] || "application/octet-stream";
}

async function startServer() {
  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, origin).pathname);
      const relative = pathname === "/" ? "discover.html" : pathname.replace(/^\/+/, "");
      const target = resolve(root, relative);
      if (target !== root && !target.startsWith(`${root}${sep}`)) return response.writeHead(403).end();
      const bytes = await readFile(target);
      response.writeHead(200, { "Content-Type": mimeType(target), "Cache-Control": "no-store" });
      response.end(request.method === "HEAD" ? undefined : bytes);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(5511, "127.0.0.1", resolvePromise);
  });
}

function command(method, params = {}) {
  const id = ++sequence;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolvePromise, rejectPromise) => {
    pending.set(id, { resolvePromise, rejectPromise });
  });
}

async function connectBrowser() {
  chrome = spawn(chromePath, [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--disable-breakpad", "--disable-crash-reporter",
    "--remote-debugging-port=9555", `--user-data-dir=${browserProfile}`, "about:blank"
  ], { stdio: "ignore", windowsHide: true });
  let target;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const targets = await (await fetch("http://127.0.0.1:9555/json/list")).json();
      target = targets.find((entry) => entry.type === "page");
      if (target?.webSocketDebuggerUrl) break;
    } catch {}
    await wait(100);
  }
  if (!target?.webSocketDebuggerUrl) throw new Error("chrome_unavailable");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolvePromise, rejectPromise) => {
    socket.addEventListener("open", resolvePromise, { once: true });
    socket.addEventListener("error", rejectPromise, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const resolver = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) resolver.rejectPromise(new Error("cdp_command_failed"));
    else resolver.resolvePromise(message.result);
  });
  await command("Page.enable");
}

async function evaluate(expression, awaitPromise = false) {
  const result = await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise });
  if (result.exceptionDetails) throw new Error("browser_evaluation_failed");
  return result.result.value;
}

async function navigate(pathname, ready = "document.readyState === 'complete'") {
  await command("Page.navigate", { url: `${origin}/${pathname}` });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await evaluate(`Boolean(${ready})`)) return;
    await wait(100);
  }
  throw new Error("browser_page_timeout");
}

async function setBrowserSession(session) {
  const payload = JSON.stringify({ access_token: session.accessToken, refresh_token: session.refreshToken });
  const result = await evaluate(`(async () => {
    const { getFrontendRuntime } = await import('./auth/supabase-client.mjs');
    const runtime = await getFrontendRuntime();
    const result = await runtime.client.auth.setSession(${payload});
    return !result.error;
  })()`, true);
  if (!result) throw new Error("browser_session_failed");
}

try {
  if (!existsSync(chromePath) || !existsSync(configPath) || existsSync(disabledConfigPath)) {
    throw new Error("local_browser_configuration_unavailable");
  }
  const status = localStatus();
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`.toLowerCase();
  const primaryEmail = `following-primary-${suffix}@example.test`;
  const otherEmail = `following-other-${suffix}@example.test`;
  const primaryPassword = `Local-${randomUUID()}-A1!`;
  const otherPassword = `Local-${randomUUID()}-B2!`;
  const primaryId = await adminCreateUser(status, primaryEmail, primaryPassword);
  const otherId = await adminCreateUser(status, otherEmail, otherPassword);
  const profiles = Array.from({ length: 4 }, () => randomUUID());
  const slugs = profiles.map((_, index) => `following-${suffix}-${index + 1}`);
  const works = Array.from({ length: 9 }, () => randomUUID());
  const images = Array.from({ length: 6 }, () => randomUUID());
  const revisions = Array.from({ length: 6 }, () => randomUUID());
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const published = [
    { work: works[0], profile: profiles[0], image: images[0], revision: revisions[0], title: "FOLLOW A ONE", date: "2026-08-06T12:00:00Z" },
    { work: works[1], profile: profiles[0], image: images[1], revision: revisions[1], title: "FOLLOW A TWO", date: "2026-08-06T11:00:00Z" },
    { work: works[2], profile: profiles[0], image: images[2], revision: revisions[2], title: "FOLLOW A THREE", date: "2026-08-06T10:00:00Z" },
    { work: works[3], profile: profiles[1], image: images[3], revision: revisions[3], title: "FOLLOW B ONE", date: "2026-08-06T09:00:00Z" },
    { work: works[4], profile: profiles[2], image: images[4], revision: revisions[4], title: "UNFOLLOWED ONE", date: "2026-08-06T08:00:00Z" },
    { work: works[5], profile: profiles[3], image: images[5], revision: revisions[5], title: "UNPUBLISHED ONE", date: "2026-08-06T07:00:00Z" }
  ].map((entry) => ({
    ...entry,
    privatePath: `${entry.profile}/${entry.work}/${entry.image}/original.png`,
    publicPath: `${entry.profile}/${entry.work}/${entry.revision}/${entry.image}.png`
  }));

  stage = "creating temporary local fixtures";
  runSql(`
    insert into public.accounts(id,status,display_name) values
      ('${primaryId}'::uuid,'active','FOLLOW PRIMARY'),('${otherId}'::uuid,'active','FOLLOW OTHER');
    insert into public.account_roles(account_id,role) values
      ('${primaryId}'::uuid,'private_member'),('${otherId}'::uuid,'private_member');
    insert into public.public_profiles(id,profile_type,slug,display_name,publication_status,published_at,claim_state) values
      ('${profiles[0]}'::uuid,'artist','${slugs[0]}','FOLLOW ARTIST A','published',now(),'unclaimed_gallery_managed'),
      ('${profiles[1]}'::uuid,'artist','${slugs[1]}','FOLLOW ARTIST B','published',now(),'unclaimed_gallery_managed'),
      ('${profiles[2]}'::uuid,'artist','${slugs[2]}','FOLLOW ARTIST C','published',now(),'unclaimed_gallery_managed'),
      ('${profiles[3]}'::uuid,'artist','${slugs[3]}','FOLLOW ARTIST D','published',now(),'unclaimed_gallery_managed');
    insert into public.works(id,owner_profile_id,title,year_label,work_type,visibility,published_at,updated_at) values
      ${published.map((entry) => `('${entry.work}'::uuid,'${entry.profile}'::uuid,'${entry.title}','2026','painting','published','${entry.date}'::timestamptz,'${entry.date}'::timestamptz)`).join(",")},
      ('${works[6]}'::uuid,'${profiles[0]}'::uuid,'FOLLOW DRAFT','2026','painting','draft',null,now()),
      ('${works[7]}'::uuid,'${profiles[0]}'::uuid,'FOLLOW COVERLESS','2026','painting','published','2026-08-06T06:00:00Z',now()),
      ('${works[8]}'::uuid,'${profiles[0]}'::uuid,'FOLLOW DELETED','2026','painting','published','2026-08-06T05:00:00Z',now());
    insert into public.work_images(id,work_id,private_object_path,public_object_path,original_filename,mime_type,file_size,pixel_width,pixel_height,sort_order,is_cover,upload_status,original_verified_at) values
      ${published.map((entry) => `('${entry.image}'::uuid,'${entry.work}'::uuid,'${entry.privatePath}','${entry.publicPath}','test.png','image/png',${png.length},1,1,0,true,'ready',now())`).join(",")};
    update public.public_profiles set publication_status='draft',published_at=null where id='${profiles[3]}'::uuid;
    update public.works set deleted_at=now(),purge_after=now()+interval '30 days',deleted_by_account_id='${primaryId}'::uuid where id='${works[8]}'::uuid;
  `);
  for (const item of published) {
    await upload(status, "work-originals", item.privatePath, png);
    await upload(status, "work-public", item.publicPath, png);
  }

  const session = await signIn(status, primaryEmail, primaryPassword);
  const otherSession = await signIn(status, otherEmail, otherPassword);
  await startServer();
  await connectBrowser();

  stage = "checking signed-out routes";
  await navigate("following.html", "location.pathname.endsWith('/login.html')");
  record("signed-out Following redirects to login", await evaluate("location.pathname.endsWith('/login.html')"));
  await navigate(`profile.html?slug=${encodeURIComponent(slugs[0])}`, "document.querySelectorAll('.profile-work').length === 3");
  record("public profile remains readable signed out", await evaluate("document.querySelectorAll('.profile-work').length === 3 && document.querySelector('#profile-follow-control').hidden"));
  const indexedDbBefore = await evaluate("indexedDB.databases().then(rows => rows.map(row => `${row.name}:${row.version}`).sort())", true);

  stage = "following profiles through the real profile control";
  await setBrowserSession(session);
  stage = "waiting for the first authenticated profile control";
  await navigate(`profile.html?slug=${encodeURIComponent(slugs[0])}`, "document.querySelectorAll('.profile-work').length === 3");
  const profileAccess = await evaluate(`(async () => {
    const { getFrontendRuntime } = await import('./auth/supabase-client.mjs');
    const { readApplicationSession } = await import('./auth/session.mjs');
    const runtime = await getFrontendRuntime();
    const application = await readApplicationSession(runtime.client);
    const query = await runtime.client.from('profile_follows').select('profile_id').eq('account_id', application.user?.id || '').eq('profile_id', '${profiles[0]}').maybeSingle();
    return { kind: application.kind, hidden: document.querySelector('#profile-follow-control').hidden, errorCode: query.error?.code || 'none' };
  })()`, true);
  if (profileAccess.hidden) {
    stage = `waiting for the first authenticated profile control (${profileAccess.kind}/${profileAccess.errorCode})`;
    throw new Error("profile_follow_control_unavailable");
  }
  record("active profile control begins at FOLLOW", await evaluate("document.querySelector('#profile-follow-action').textContent.includes('FOLLOW') && !document.querySelector('#profile-follow-action').textContent.includes('FOLLOWING')"));
  stage = "activating the first profile follow";
  await evaluate("document.querySelector('#profile-follow-action').click()");
  for (let attempt = 0; attempt < 50 && !(await evaluate("document.querySelector('#profile-follow-action').textContent.includes('FOLLOWING')")); attempt += 1) await wait(100);
  record("follow state reloads as FOLLOWING", await evaluate("document.querySelector('#profile-follow-action').textContent.includes('FOLLOWING')"));
  stage = "waiting for the second authenticated profile control";
  await navigate(`profile.html?slug=${encodeURIComponent(slugs[1])}`, "!document.querySelector('#profile-follow-control').hidden");
  stage = "activating the second profile follow";
  await evaluate("document.querySelector('#profile-follow-action').click()");
  for (let attempt = 0; attempt < 50 && !(await evaluate("document.querySelector('#profile-follow-action').textContent.includes('FOLLOWING')")); attempt += 1) await wait(100);
  record("second published profile can be followed", await evaluate("document.querySelector('#profile-follow-action').textContent.includes('FOLLOWING')"));

  const duplicateResponse = await insertFollow(status, session.accessToken, primaryId, profiles[0]);
  const ownFollows = await rest(status, session.accessToken, "profile_follows", "?select=profile_id");
  record("duplicate follow creates no duplicate relationship", !duplicateResponse.ok && ownFollows.length === 2);
  const otherGraph = await rest(status, otherSession.accessToken, "profile_follows", "?select=profile_id");
  record("another account cannot inspect follows", otherGraph.length === 0);

  stage = "checking the real Following feed";
  await navigate("following.html", "document.querySelectorAll('.discover-work[data-artist-slug]').length === 4");
  const feed = await evaluate(`(() => ({
    titles: [...document.querySelectorAll('.discover-work h2')].map((node) => node.textContent.trim()),
    artists: [...document.querySelectorAll('.discover-work')].map((node) => node.dataset.artistSlug),
    links: [...document.querySelectorAll('.discover-work .artist-link')].every((link) => link.getAttribute('href').startsWith('profile.html?slug=')),
    uncropped: [...document.querySelectorAll('.discover-work img')].every((image) => getComputedStyle(image).objectFit === 'contain')
  }))()`);
  record("Following contains only followed published eligible Works", feed.titles.join(",") === "FOLLOW A ONE,FOLLOW A TWO,FOLLOW A THREE,FOLLOW B ONE");
  record("three newest same-artist Works remain consecutive", feed.artists.slice(0, 3).every((slug) => slug === slugs[0]));
  record("Following profile links and uncropped images are valid", feed.links && feed.uncropped);
  const anonymousPublic = await fetch(storageUrl(status.api, "public/", "work-public", published[0].publicPath));
  const anonymousPrivate = await fetch(storageUrl(status.api, "authenticated/", "work-originals", published[0].privatePath), { headers: { apikey: status.publishable } });
  record("public copies load and private originals remain denied anonymously", anonymousPublic.ok && !anonymousPrivate.ok);

  const discoverClient = { storage: { from: (bucket) => ({ getPublicUrl: (path) => ({ data: { publicUrl: storageUrl(status.api, "public/", bucket, path) } }) }) } };
  const discover = await createDiscoverRepository(discoverClient, { supabaseUrl: status.api, supabaseKey: status.publishable }).listWorks();
  record("Discover still applies artist spreading", !discover.slice(0, 3).every((item) => item.artistSlug === slugs[0]));

  stage = "checking suspension and reactivation";
  runSql(`update public.accounts set status='suspended' where id='${primaryId}'::uuid;`);
  const suspendedFollow = await insertFollow(status, session.accessToken, primaryId, profiles[2]);
  stage = "waiting for suspended browser denial";
  await navigate("following.html", "document.body.innerText.includes('DASHBOARD ACCESS IS UNAVAILABLE')");
  stage = "asserting suspended feed and follow denial";
  record("suspended account loses feed and follow access", !suspendedFollow.ok && await evaluate("document.body.innerText.includes('DASHBOARD ACCESS IS UNAVAILABLE')"));
  runSql(`update public.accounts set status='active' where id='${primaryId}'::uuid;`);
  const reactivatedSession = await signIn(status, primaryEmail, primaryPassword);
  stage = "restoring the reactivated browser session";
  await navigate(`profile.html?slug=${encodeURIComponent(slugs[1])}`, "document.querySelectorAll('.profile-work').length === 1");
  await setBrowserSession(reactivatedSession);
  stage = "waiting for the reactivated follow state";
  await navigate(`profile.html?slug=${encodeURIComponent(slugs[1])}`, "document.querySelector('#profile-follow-action')?.textContent.includes('FOLLOWING')");
  stage = "asserting the reactivated private relationship";
  record("reactivation restores only the existing private relationship", await evaluate("document.querySelector('#profile-follow-action').textContent.includes('FOLLOWING')"));
  stage = "unfollowing through the reactivated profile control";
  await evaluate("window.confirm = () => true; document.querySelector('#profile-follow-action').click()");
  for (let attempt = 0; attempt < 50 && !(await evaluate("document.querySelector('#profile-follow-action').textContent.includes('FOLLOW') && !document.querySelector('#profile-follow-action').textContent.includes('FOLLOWING')")); attempt += 1) await wait(100);
  stage = "waiting for the feed after unfollow";
  await navigate("following.html", "document.querySelectorAll('.discover-work[data-artist-slug]').length === 3");
  stage = "asserting feed removal after unfollow";
  const afterUnfollow = await evaluate(`(() => ({
    total: document.querySelectorAll('.discover-work[data-artist-slug]').length,
    removedProfile: [...document.querySelectorAll('.discover-work')].filter((node) => node.dataset.artistSlug === '${slugs[1]}').length,
    retainedProfile: [...document.querySelectorAll('.discover-work')].filter((node) => node.dataset.artistSlug === '${slugs[0]}').length
  }))()`);
  if (afterUnfollow.removedProfile !== 0 || afterUnfollow.retainedProfile !== 3) {
    stage = `asserting feed removal after unfollow (${afterUnfollow.total}/${afterUnfollow.retainedProfile}/${afterUnfollow.removedProfile})`;
  }
  record("unfollow removes that profile Works after refresh", afterUnfollow.removedProfile === 0 && afterUnfollow.retainedProfile === 3);

  for (const width of [1440, 390, 320]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: width === 1440 ? 900 : 844, deviceScaleFactor: 1, mobile: width < 700 });
    for (const pathname of ["following.html", `profile.html?slug=${encodeURIComponent(slugs[0])}`]) {
      const ready = pathname.startsWith("following")
        ? "document.querySelectorAll('.discover-work').length === 3"
        : "document.querySelector('#profile-follow-action') && !document.querySelector('#profile-follow-control').hidden";
      stage = `checking responsive ${pathname.startsWith("following") ? "feed" : "profile"} at ${width}`;
      await navigate(pathname, ready);
      const layout = await evaluate(`(() => {
        const header = document.querySelector('.site-header').getBoundingClientRect();
        const contentTop = Math.min(...[...document.querySelectorAll('.discover-toolbar, .discover-work, .artist-sidebar-inner, .profile-work')]
          .map((element) => element.getBoundingClientRect().top)
          .filter((value) => Number.isFinite(value)));
        const action = document.querySelector('#profile-follow-action');
        return {
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          below: contentTop >= header.bottom - 1,
          uncropped: [...document.querySelectorAll('main img')].every((image) => getComputedStyle(image).objectFit === 'contain'),
          realButton: !action || action.tagName === 'BUTTON'
        };
      })()`);
      record(`responsive Following boundary ${width} ${pathname.startsWith("following") ? "feed" : "profile"}`, !layout.overflow && layout.below && layout.uncropped && layout.realButton);
    }
  }

  const indexedDbAfter = await evaluate("indexedDB.databases().then(rows => rows.map(row => `${row.name}:${row.version}`).sort())", true);
  record("IndexedDB remains untouched", JSON.stringify(indexedDbBefore) === JSON.stringify(indexedDbAfter));

  stage = "checking prototype preservation";
  await rename(configPath, disabledConfigPath);
  await navigate("following.html", "document.body.dataset.authMode === 'prototype'");
  const prototype = await evaluate(`(() => ({
    staticItems: document.querySelectorAll('.discover-work[data-artist-id]').length,
    mode: document.body.dataset.authMode,
    requests: performance.getEntriesByType('resource').filter((entry) => entry.name.includes('/rest/v1/profile_follows') || entry.name.includes('/rpc/list_following_feed')).length
  }))()`);
  record("prototype Following stays static and makes no Supabase follow request", prototype.mode === "prototype" && prototype.staticItems === 5 && prototype.requests === 0);
  await rename(disabledConfigPath, configPath);

  process.stdout.write(JSON.stringify({ ok: true, assertions: assertions.length }));
} catch (error) {
  const safeCode = error?.name === "AssertionError" ? "ASSERTION_FAILED" : "INTEGRATION_ERROR";
  process.stderr.write(`Following integration failed while ${stage} (${safeCode}).`);
  process.exitCode = 1;
} finally {
  if (existsSync(disabledConfigPath) && !existsSync(configPath)) {
    try { await rename(disabledConfigPath, configPath); } catch {}
  }
  try { socket?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  if (server) await new Promise((resolvePromise) => server.close(resolvePromise));
  try {
    const status = localStatus();
    for (const object of storageObjects) await removeStorage(status, object.bucket, object.path);
  } catch {}
  await wait(300);
  try { await rm(browserProfile, { recursive: true, force: true }); } catch {}
}
