import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MIGRATION_PATH = /^supabase\/migrations\/[^/]+\.sql$/i;
const PGTAP_PATH = /^supabase\/tests\/[^/]+\.test\.sql$/i;

export const SECURITY_MIGRATION_COVERAGE_PREFIX = "-- Security migration coverage:";

export function normalizeRepositoryPath(value) {
  return String(value || "").replaceAll("\\", "/").replace(/^\.\//, "");
}

export function maskSqlCommentsAndLiterals(sql) {
  const source = String(sql || "");
  let output = "";
  let index = 0;
  let state = "normal";
  let dollarTag = "";

  const mask = (character) => character === "\n" || character === "\r" ? character : " ";
  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1] || "";

    if (state === "line-comment") {
      output += mask(character);
      index += 1;
      if (character === "\n") state = "normal";
      continue;
    }
    if (state === "block-comment") {
      output += mask(character);
      if (character === "*" && next === "/") {
        output += " ";
        index += 2;
        state = "normal";
      } else {
        index += 1;
      }
      continue;
    }
    if (state === "single-quote") {
      output += mask(character);
      if (character === "'" && next === "'") {
        output += " ";
        index += 2;
      } else {
        index += 1;
        if (character === "'") state = "normal";
      }
      continue;
    }
    if (state === "double-quote") {
      output += mask(character);
      if (character === '"' && next === '"') {
        output += " ";
        index += 2;
      } else {
        index += 1;
        if (character === '"') state = "normal";
      }
      continue;
    }
    if (state === "dollar-quote") {
      if (source.startsWith(dollarTag, index)) {
        output += " ".repeat(dollarTag.length);
        index += dollarTag.length;
        state = "normal";
      } else {
        output += mask(character);
        index += 1;
      }
      continue;
    }

    if (character === "-" && next === "-") {
      output += "  ";
      index += 2;
      state = "line-comment";
      continue;
    }
    if (character === "/" && next === "*") {
      output += "  ";
      index += 2;
      state = "block-comment";
      continue;
    }
    if (character === "'") {
      output += " ";
      index += 1;
      state = "single-quote";
      continue;
    }
    if (character === '"') {
      output += " ";
      index += 1;
      state = "double-quote";
      continue;
    }
    if (character === "$") {
      const match = source.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) {
        dollarTag = match[0];
        output += " ".repeat(dollarTag.length);
        index += dollarTag.length;
        state = "dollar-quote";
        continue;
      }
    }

    output += character;
    index += 1;
  }
  return output;
}

export function detectSecuritySensitiveSql(sql) {
  const statements = maskSqlCommentsAndLiterals(sql).split(";");
  const reasons = new Set();
  for (const statement of statements) {
    if (/\b(?:create|alter|drop)\s+policy\b/i.test(statement)) reasons.add("POLICY change");
    if (/\balter\s+table\b[\s\S]*\b(?:enable|disable|force|no\s+force)\s+row\s+level\s+security\b/i.test(statement)) {
      reasons.add("ROW LEVEL SECURITY change");
    }
    if (/\bgrant\b/i.test(statement)) reasons.add("GRANT");
    if (/\brevoke\b/i.test(statement)) reasons.add("REVOKE");
    if (/\bsecurity\s+definer\b/i.test(statement)) reasons.add("SECURITY DEFINER");
    if (/\bcreate\s+(?:or\s+replace\s+)?function\b/i.test(statement)) reasons.add("FUNCTION change");
    if (/\bcreate\s+(?:or\s+replace\s+)?function\s+(?:private|auth|storage)\s*\./i.test(statement)) {
      reasons.add("privileged helper function change");
    }
    if (/\b(?:create|alter|drop)\s+policy\b/i.test(statement) && /\bstorage\s*\.\s*objects\b/i.test(statement)) {
      reasons.add("storage.objects policy change");
    }
  }
  return [...reasons];
}

function coverageMarkerMatches(testSql, migrationPath) {
  const filename = basename(normalizeRepositoryPath(migrationPath)).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `^\\s*--\\s*security\\s+migration\\s+coverage\\s*:\\s*(?:supabase/migrations/)?${filename}\\s*$`,
    "im"
  ).test(String(testSql || ""));
}

export async function evaluateSecurityMigrationGate({ changedFiles, readText }) {
  const paths = [...new Set((changedFiles || []).map(normalizeRepositoryPath))];
  const migrationPaths = paths.filter((path) => MIGRATION_PATH.test(path));
  const testPaths = paths.filter((path) => PGTAP_PATH.test(path));
  const changedTests = await Promise.all(testPaths.map(async (path) => ({ path, sql: await readText(path) })));
  const sensitive = [];

  for (const path of migrationPaths) {
    const sql = await readText(path);
    const reasons = detectSecuritySensitiveSql(sql);
    if (!reasons.length) continue;
    const coverage = changedTests.find((test) => coverageMarkerMatches(test.sql, path));
    sensitive.push({ path, reasons, coveragePath: coverage?.path || null });
  }

  return Object.freeze({
    ok: sensitive.every((migration) => migration.coveragePath),
    changedMigrations: migrationPaths,
    changedTests: testPaths,
    sensitive
  });
}

function runGit(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${String(result.stderr || "unknown error").trim()}`);
  return String(result.stdout || "").split(/\r?\n/).map((path) => path.trim()).filter(Boolean);
}

export function determineChangedFiles({ root, base, head = "HEAD", explicitFiles = [] }) {
  if (explicitFiles.length) return [...new Set(explicitFiles.map(normalizeRepositoryPath))];
  if (base) return runGit(root, ["diff", "--name-only", "--diff-filter=ACMR", `${base}...${head}`, "--"]);

  const worktree = runGit(root, ["diff", "--name-only", "--diff-filter=ACMR", "HEAD", "--"]);
  const untracked = runGit(root, ["ls-files", "--others", "--exclude-standard"]);
  const changed = [...new Set([...worktree, ...untracked].map(normalizeRepositoryPath))];
  if (changed.length) return changed;

  const [commitAndParents] = runGit(root, ["rev-list", "--parents", "-n", "1", head]);
  const [, firstParent] = commitAndParents.split(/\s+/);
  if (firstParent) {
    return runGit(root, ["diff", "--name-only", "--diff-filter=ACMR", firstParent, head, "--"]);
  }
  return runGit(root, ["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", "--diff-filter=ACMR", head]);
}

export function formatGateFailure(result) {
  const lines = [
    "Security migration gate failed.",
    "Security-sensitive SQL requires explicit coverage in a changed pgTAP test."
  ];
  for (const migration of result.sensitive.filter((item) => !item.coveragePath)) {
    const filename = basename(migration.path);
    lines.push("", `Migration: ${migration.path}`, `Detected: ${migration.reasons.join(", ")}`);
    lines.push("Add or update a file under supabase/tests/*.test.sql with focused allow/deny coverage and this exact marker:");
    lines.push(`${SECURITY_MIGRATION_COVERAGE_PREFIX} ${filename}`);
  }
  lines.push(
    "",
    "Cover the intended actor and wrong actors. For Storage, also test bucket/path/input rejection and shared flows using the same operation.",
    "Do not assume PostgreSQL policy expressions short-circuit.",
    "Then run: npm run test:migration-security"
  );
  return lines.join("\n");
}

function requiredOptionValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value.`);
  return value;
}

export function parseArguments(argv) {
  const options = { explicitFiles: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--base") options.base = requiredOptionValue(argv, index++, argument);
    else if (argument === "--head") options.head = requiredOptionValue(argv, index++, argument);
    else if (argument === "--file") options.explicitFiles.push(requiredOptionValue(argv, index++, argument));
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

export async function runSecurityMigrationGate({ argv = process.argv.slice(2), env = process.env, root = process.cwd() } = {}) {
  const options = parseArguments(argv);
  const changedFiles = determineChangedFiles({
    root,
    base: options.base || env.CHAINED_MIGRATION_GATE_BASE,
    head: options.head || env.CHAINED_MIGRATION_GATE_HEAD || "HEAD",
    explicitFiles: options.explicitFiles
  });
  const result = await evaluateSecurityMigrationGate({
    changedFiles,
    readText: (path) => readFile(resolve(root, path), "utf8")
  });
  if (!result.ok) throw new Error(formatGateFailure(result));
  if (!result.sensitive.length) {
    process.stdout.write(`Security migration gate passed: ${result.changedMigrations.length} changed migration(s), none security-sensitive.\n`);
  } else {
    process.stdout.write(`Security migration gate passed: ${result.sensitive.length} security-sensitive migration(s) have explicit changed pgTAP coverage.\n`);
  }
  return result;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runSecurityMigrationGate().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
