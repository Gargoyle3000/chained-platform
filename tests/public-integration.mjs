import { execSync, spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rename, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

import { createDiscoverRepository } from "../data/discover-repository.mjs";
import { createPublicProfileRepository } from "../data/public-profile-repository.mjs";
import { createSupabaseWorkRepository } from "../data/supabase-work-repository.mjs";

const root = resolve(import.meta.dirname, "..");
const serverOrigin = "http://127.0.0.1:5510";
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const configPath = join(root, "frontend-config.local.mjs");
const disabledConfigPath = join(root, "frontend-config.local.mjs.public-integration");
const browserProfile = await mkdtemp(join(tmpdir(), "chained-public-integration-"));
const publicObjects = [];
const privateObjects = [];
const outcomes = [];
let generatedProfileIds = [];
let stage = "reading local status";
let chrome;
let server;
let socket;
let sequence = 0;
const pending = new Map();

function record(name, condition) {
  if (!condition) {
    process.stderr.write(`FAILED ASSERTION: ${name}\n`);
  }

  assert.equal(Boolean(condition), true, name);
  outcomes.push(name);
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
  if (!match) throw new Error("status_unavailable");
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

function storageUrl(api, route, bucket, objectPath) {
  const encoded = objectPath.split("/").map(encodeURIComponent).join("/");
  return `${api}/storage/v1/object/${route}${bucket}/${encoded}`;
}

async function uploadObject(status, bucket, objectPath, bytes) {
  const response = await fetch(storageUrl(status.api, "", bucket, objectPath), {
    method: "POST",
    headers: {
      apikey: status.trusted,
      Authorization: `Bearer ${status.trusted}`,
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
      "x-upsert": "false"
    },
    body: bytes
  });
  if (!response.ok) throw new Error("storage_fixture_failed");
}

async function removeObject(status, bucket, objectPath) {
  try {
    await fetch(storageUrl(status.api, "", bucket, objectPath), {
      method: "DELETE",
      headers: {
        apikey: status.trusted,
        Authorization: `Bearer ${status.trusted}`
      }
    });
  } catch {
    // The mandatory database reset also clears local object metadata.
  }
}

function publicClient(status) {
  return {
    storage: {
      from(bucket) {
        return {
          getPublicUrl(path) {
            return { data: { publicUrl: storageUrl(status.api, "public/", bucket, path) } };
          }
        };
      }
    }
  };
}

function mimeType(pathname) {
  return ({
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp"
  })[extname(pathname).toLowerCase()] || "application/octet-stream";
}

async function startStaticServer() {
  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, serverOrigin).pathname);
      const relative = pathname === "/" ? "discover.html" : pathname.replace(/^\/+/, "");
      const target = resolve(root, relative);
      if (target !== root && !target.startsWith(`${root}${sep}`)) {
        response.writeHead(403).end();
        return;
      }
      const bytes = await readFile(target);
      response.writeHead(200, { "Content-Type": mimeType(target), "Cache-Control": "no-store" });
      if (request.method === "HEAD") response.end();
      else response.end(bytes);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(5510, "127.0.0.1", resolvePromise);
  });
}

async function connectBrowser() {
  chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-breakpad",
    "--disable-crash-reporter",
    "--remote-debugging-port=9444",
    `--user-data-dir=${browserProfile}`,
    "about:blank"
  ], { stdio: "ignore", windowsHide: true });

  let target;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const targets = await (await fetch("http://127.0.0.1:9444/json/list")).json();
      target = targets.find((entry) => entry.type === "page");
      if (target?.webSocketDebuggerUrl) break;
    } catch {
      // Chrome is still starting.
    }
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

function command(method, params = {}) {
  const id = ++sequence;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolvePromise, rejectPromise) => {
    pending.set(id, { resolvePromise, rejectPromise });
  });
}

async function navigate(pathname, waitForExpression = "document.readyState === 'complete'") {
  await command("Page.navigate", { url: `${serverOrigin}/${pathname}` });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await command("Runtime.evaluate", {
      expression: `Boolean(${waitForExpression})`,
      returnByValue: true
    });
    if (result.result.value) return;
    await wait(100);
  }
  throw new Error("browser_page_timeout");
}

async function evaluate(expression) {
  const result = await command("Runtime.evaluate", { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error("browser_evaluation_failed");
  return result.result.value;
}

async function loadDiscoverFixtures(fixtureSlugs) {
  await navigate(
    "discover.html",
    "document.querySelectorAll('.discover-work[data-artist-slug]').length > 0"
  );

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await evaluate(`(() => {
      const fixtureSlugs = ${JSON.stringify(fixtureSlugs)};
      const items = [...document.querySelectorAll(
        '.discover-work[data-artist-slug]'
      )];

      return {
        count: items.filter(
          (item) => fixtureSlugs.includes(item.dataset.artistSlug)
        ).length,
        hasMore: Boolean(
          document.querySelector('.discover-load-more button')
        )
      };
    })()`);

    if (state.count >= 7) return;
    if (!state.hasMore) break;

    await evaluate(
      "document.querySelector('.discover-load-more button')?.click()"
    );
    await wait(100);
  }

  throw new Error("discover_fixture_batch_unavailable");
}

try {
  if (!existsSync(chromePath)) throw new Error("chrome_unavailable");
  if (!existsSync(configPath) || existsSync(disabledConfigPath)) throw new Error("local_config_unavailable");

  const status = localStatus();
  const config = { supabaseUrl: status.api, supabaseKey: status.publishable };
  const client = publicClient(status);
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`.toLowerCase();
  const profileIds = Array.from({ length: 6 }, () => randomUUID());
  generatedProfileIds = [...profileIds];
  const slugs = profileIds.map((_, index) => `public-test-${suffix}-${index + 1}`);
  const workIds = Array.from({ length: 10 }, () => randomUUID());
  const imageIds = Array.from({ length: 9 }, () => randomUUID());
  const revisionIds = Array.from({ length: 9 }, () => randomUUID());
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

  const visibleWorks = [
    { work: workIds[0], profile: profileIds[0], image: imageIds[0], revision: revisionIds[0], date: "2026-08-08T12:00:00Z", yearSort: 2026, yearLabel: "2026" },
    { work: workIds[1], profile: profileIds[0], image: imageIds[1], revision: revisionIds[1], date: "2026-08-07T12:00:00Z", yearSort: 2024, yearLabel: "2024" },
    { work: workIds[2], profile: profileIds[0], image: imageIds[2], revision: revisionIds[2], date: "2026-08-06T12:00:00Z", yearSort: null, yearLabel: "UNDATED" },
    { work: workIds[3], profile: profileIds[1], image: imageIds[3], revision: revisionIds[3], date: "2026-08-05T12:00:00Z", yearSort: 2026, yearLabel: "2026" },
    { work: workIds[4], profile: profileIds[2], image: imageIds[4], revision: revisionIds[4], date: "2026-08-04T12:00:00Z", yearSort: 2026, yearLabel: "2026" },
    { work: workIds[5], profile: profileIds[3], image: imageIds[5], revision: revisionIds[5], date: "2026-08-03T12:00:00Z", yearSort: 2026, yearLabel: "2026" },
    { work: workIds[6], profile: profileIds[4], image: imageIds[6], revision: revisionIds[6], date: "2026-08-02T12:00:00Z", yearSort: 2026, yearLabel: "2026" }
  ];
  const missingCoverWork = { work: workIds[7], profile: profileIds[1], image: imageIds[7], revision: revisionIds[7] };
  const hiddenProfileWork = { work: workIds[8], profile: profileIds[5], image: imageIds[8], revision: revisionIds[8] };
  const draftWorkId = workIds[9];
  const imageFixtures = [...visibleWorks, hiddenProfileWork].map((entry) => {
    const privatePath = `${entry.profile}/${entry.work}/${entry.image}/original.png`;
    const publicPath = `${entry.profile}/${entry.work}/${entry.revision}/${entry.image}.png`;
    privateObjects.push(privatePath);
    publicObjects.push(publicPath);
    return { ...entry, privatePath, publicPath };
  });
  const missingPrivatePath = `${missingCoverWork.profile}/${missingCoverWork.work}/${missingCoverWork.image}/original.png`;
  privateObjects.push(missingPrivatePath);

  stage = "creating trusted local public fixtures";
  const profileSql = profileIds.map((id, index) => (
    `('${id}'::uuid,'artist','${slugs[index]}','PUBLIC TEST ARTIST ${index + 1}',${index === 5 ? "null" : `'BIOGRAPHY ${index + 1}'`},'${index === 5 ? "draft" : "published"}',${index === 5 ? "null" : "now()"},'unclaimed_gallery_managed')`
  )).join(",");
  const workSql = visibleWorks.map((entry, index) => (
    `('${entry.work}'::uuid,'${entry.profile}'::uuid,'PUBLIC WORK ${index + 1}',${entry.yearSort == null ? "null" : entry.yearSort},'${entry.yearLabel}','painting','published','${entry.date}'::timestamptz,'${entry.date}'::timestamptz)`
  )).join(",");
  const imageSql = imageFixtures.map((entry) => (
    `('${entry.image}'::uuid,'${entry.work}'::uuid,'${entry.privatePath}','${entry.publicPath}','test.png','image/png',${png.length},1,1,0,true,'ready',now())`
  )).join(",");
  runSql(`
    insert into public.public_profiles (id,profile_type,slug,display_name,biography,publication_status,published_at,claim_state) values ${profileSql};
    insert into public.works (id,owner_profile_id,title,year_sort,year_label,work_type,visibility,published_at,updated_at) values ${workSql};
    insert into public.works (id,owner_profile_id,title,year_sort,year_label,work_type,visibility,published_at,updated_at) values
      ('${missingCoverWork.work}'::uuid,'${missingCoverWork.profile}'::uuid,'MISSING PUBLIC COVER',2026,'2026','painting','published','2026-08-01T12:00:00Z',now()),
      ('${hiddenProfileWork.work}'::uuid,'${hiddenProfileWork.profile}'::uuid,'HIDDEN PROFILE WORK',2026,'2026','painting','published','2026-07-31T12:00:00Z',now()),
      ('${draftWorkId}'::uuid,'${profileIds[0]}'::uuid,'PRIVATE DRAFT',2026,'2026','painting','draft',null,now());
    insert into public.work_images (id,work_id,private_object_path,public_object_path,original_filename,mime_type,file_size,pixel_width,pixel_height,sort_order,is_cover,upload_status,original_verified_at) values ${imageSql};
    insert into public.work_images (id,work_id,private_object_path,public_object_path,original_filename,mime_type,file_size,pixel_width,pixel_height,sort_order,is_cover,upload_status,original_verified_at) values
      ('${missingCoverWork.image}'::uuid,'${missingCoverWork.work}'::uuid,'${missingPrivatePath}',null,'test.png','image/png',${png.length},1,1,0,true,'ready',now());
  `);

  stage = "creating generated local Storage fixtures";
  for (const fixture of imageFixtures) {
    await uploadObject(status, "work-originals", fixture.privatePath, png);
    await uploadObject(status, "work-public", fixture.publicPath, png);
  }
  await uploadObject(status, "work-originals", missingPrivatePath, png);

  stage = "checking anonymous repositories";
  const allDiscoverWorks =
    await createDiscoverRepository(client, config).listWorks();
  const discover = allDiscoverWorks.filter(
    (entry) => slugs.includes(entry.artistKey)
  );
  record("Discover loads anonymously", discover.length > 0);
  record("only eligible published Works have public covers", discover.length === visibleWorks.length && discover.every((entry) => entry.image.src));
  record("Discover does not duplicate or drop eligible Works", new Set(discover.map((entry) => entry.id)).size === visibleWorks.length);
  record(
    "fixture artist ownership is preserved",
    discover.every((entry) => slugs.includes(entry.artistKey))
  );
  record(
    "fixture artist grouping remains complete",
    discover.filter((entry) => entry.artistKey === slugs[0]).length === 3 &&
      new Set(discover.map((entry) => entry.artistKey)).size === 5
  );
  record("missing public cover and hidden profile are excluded", !discover.some((entry) => [missingCoverWork.work, hiddenProfileWork.work].includes(entry.id)));

  const publicProfileRepository = createPublicProfileRepository(client, config);
  const profileResult = await publicProfileRepository.getProfile(slugs[0]);
  record("dynamic profile loads the selected published artist", profileResult.kind === "available" && profileResult.profile.slug === slugs[0]);
  record("dynamic profile lists only that artist's published Works", profileResult.works.length === 3 && profileResult.works.every((entry) => entry.artistSlug === slugs[0]));
  record("profile Work order uses year then update then ID", profileResult.works.map((entry) => entry.id).join(",") === workIds.slice(0, 3).join(","));
  record("unpublished profile is unavailable", (await publicProfileRepository.getProfile(slugs[5])).kind === "unavailable");

  const artworkRepository = createSupabaseWorkRepository(client, config);
  record("published Work opens through the artwork repository", Boolean(await artworkRepository.getPublishedWork(workIds[0])));
  record("draft remains unavailable", (await artworkRepository.getPublishedWork(draftWorkId)) === null);

  const publicImageResponse = await fetch(storageUrl(status.api, "public/", "work-public", imageFixtures[0].publicPath));
  const privateImageResponse = await fetch(storageUrl(status.api, "authenticated/", "work-originals", imageFixtures[0].privatePath), {
    headers: { apikey: status.publishable }
  });
  record("public image retrieval works anonymously", publicImageResponse.ok);
  record("private original retrieval is denied anonymously", !privateImageResponse.ok);

  stage = "checking supabase browser rendering";
  await startStaticServer();
  stage = "starting the local browser";
  await connectBrowser();
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  stage = "rendering Discover in local mode";
  await loadDiscoverFixtures(slugs);
  const singleState = await evaluate(`(() => {
    const fixtureSlugs = ${JSON.stringify(slugs)};
    const items = [...document.querySelectorAll('.discover-work')]
      .filter((item) => fixtureSlugs.includes(item.dataset.artistSlug));

    return {
      ids: items.map((item) => item.dataset.workId),
      profileLinks: items.every((item) =>
        item.querySelector('.artist-link')
          ?.getAttribute('href')
          ?.startsWith('profile.html?slug=')
      ),
      artworkLinks: items.every((item) =>
        item.querySelector('.discover-image-link')
          ?.getAttribute('href')
          ?.startsWith('artwork.html?id=')
      ),
      uncropped: items.every((item) => {
        const image = item.querySelector('.discover-image-link img');
        return image && getComputedStyle(image).objectFit === 'contain';
      })
    };
  })()`);
  record("Discover browser links target dynamic profiles and artworks", singleState.profileLinks && singleState.artworkLinks);
  record("Discover SINGLE keeps artwork uncropped", singleState.uncropped);
  await evaluate("document.querySelector('.view-button[data-view=\"grid\"]').click()");
  const gridIds = await evaluate(`(() => {
    const fixtureSlugs = ${JSON.stringify(slugs)};
    return [...document.querySelectorAll('.discover-work')]
      .filter((item) => fixtureSlugs.includes(item.dataset.artistSlug))
      .map((item) => item.dataset.workId);
  })()`);
  record("SINGLE and GRID preserve the same order", gridIds.join(",") === singleState.ids.join(","));

  stage = "rendering the dynamic profile in local mode";
  await navigate(`profile.html?slug=${encodeURIComponent(slugs[0])}`, "document.querySelectorAll('.profile-work').length === 3");
  const browserProfileState = await evaluate(`(() => ({
    count: document.querySelectorAll('.profile-work').length,
    unsupported: document.body.innerText.includes('PRESENTATIONS') || document.body.innerText.includes('PRESS'),
    links: [...document.querySelectorAll('.profile-image-link')].every((link) => link.getAttribute('href').startsWith('artwork.html?id=')),
    uncropped: [...document.querySelectorAll('.profile-image-link img')].every((image) => getComputedStyle(image).objectFit === 'contain')
  }))()`);
  record("browser profile shows only implemented WORKS", browserProfileState.count === 3 && !browserProfileState.unsupported);
  record("browser profile Work links and images are safe", browserProfileState.links && browserProfileState.uncropped);

  stage = "rendering the artwork route in local mode";
  await navigate(`artwork.html?id=${encodeURIComponent(workIds[0])}`, "document.querySelector('.artwork-artist')?.getAttribute('href')?.startsWith('profile.html?slug=')");
  record("artwork page links back by public slug", await evaluate("document.querySelector('.artwork-artist').getAttribute('href').startsWith('profile.html?slug=')"));

  for (const width of [1440, 390, 320]) {
    const height = width === 1440 ? 900 : 844;
    await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 700 });
    for (const pathname of ["discover.html", `profile.html?slug=${encodeURIComponent(slugs[0])}`]) {
      const isDiscover = pathname.startsWith("discover");
      const pageLabel = isDiscover ? "Discover" : "profile";
      stage = `checking responsive ${pageLabel} layout at ${width}`;

      if (isDiscover) {
        await loadDiscoverFixtures(slugs);
      } else {
        await navigate(
          pathname,
          "document.querySelectorAll('.profile-work').length === 3"
        );
      }
      const layout = await evaluate(`(() => {
        const header = document.querySelector('.site-header')?.getBoundingClientRect();
        const contentTop = Math.min(...[...document.querySelectorAll('.discover-toolbar, .discover-work, .artist-sidebar-inner, .profile-work')]
          .map((element) => element.getBoundingClientRect().top)
          .filter((value) => Number.isFinite(value)));
        return {
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          headerBottom: header?.bottom || 0,
          contentTop,
          focusable: [...document.querySelectorAll('a,button')].every((element) => !element.hasAttribute('tabindex') || Number(element.getAttribute('tabindex')) >= 0)
        };
      })()`);
      record(`responsive ${pageLabel} ${width}`, !layout.overflow && layout.contentTop >= layout.headerBottom - 1 && layout.focusable);
    }
  }

  stage = "checking prototype preservation";
  await rename(configPath, disabledConfigPath);
  for (const width of [1440, 390, 320]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: width === 1440 ? 900 : 844, deviceScaleFactor: 1, mobile: width < 700 });
    for (const prototypePage of ["discover.html", "profile-peer-vink.html", "profile-koos-de-vries.html"]) {
      const readyText = prototypePage === "discover.html"
        ? "JONAS KLEE"
        : prototypePage === "profile-peer-vink.html"
          ? "PEER VINK"
          : "MEDUSA";
      stage = `checking prototype ${width}`;
      await navigate(prototypePage, `document.body.innerText.includes('${readyText}')`);
      const prototypeState = await evaluate(`(() => ({
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        publicRequests: performance.getEntriesByType('resource').filter((entry) => entry.name.includes('/rest/v1/') || entry.name.includes('/storage/v1/')).length,
        peer: document.body.innerText.includes('PEER VINK'),
        koos: document.body.innerText.includes('KOOS DE VRIES')
      }))()`);
      record(`prototype ${prototypePage} ${width}`, !prototypeState.overflow && prototypeState.publicRequests === 0 && (prototypeState.peer || prototypeState.koos));
    }
  }
  await rename(disabledConfigPath, configPath);

  process.stdout.write(JSON.stringify({ ok: true, assertions: outcomes.length }));
} catch (error) {
  const safeCode = typeof error?.code === "string" && /^[A-Z0-9_]+$/.test(error.code)
    ? error.code
    : error?.name === "AssertionError"
      ? "ASSERTION_FAILED"
      : "INTEGRATION_ERROR";
  process.stderr.write(`Public integration failed while ${stage} (${safeCode}).`);
  process.exitCode = 1;
} finally {
  if (existsSync(disabledConfigPath) && !existsSync(configPath)) {
    try { await rename(disabledConfigPath, configPath); } catch {}
  }
  try { socket?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  if (server) await new Promise((resolvePromise) => server.close(resolvePromise));

  if (generatedProfileIds.length > 0) {
    try {
      const profileList = generatedProfileIds
        .map((id) => `'${id}'::uuid`)
        .join(",");

      runSql(`
        delete from public.work_images
        where work_id in (
          select id
          from public.works
          where owner_profile_id in (${profileList})
        );

        delete from public.works
        where owner_profile_id in (${profileList});

        delete from public.public_profiles
        where id in (${profileList});
      `);
    } catch {
      // Preserve the original test failure if fixture cleanup also fails.
    }
  }

  try {
    const status = localStatus();
    for (const path of publicObjects) await removeObject(status, "work-public", path);
    for (const path of privateObjects) await removeObject(status, "work-originals", path);
  } catch {
    // The mandatory local reset follows this test even when API cleanup fails.
  }

  await wait(300);
  try { await rm(browserProfile, { recursive: true, force: true }); } catch {}
}
