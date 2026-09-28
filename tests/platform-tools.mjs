import { accessSync, constants, existsSync } from "node:fs";
import { delimiter, join } from "node:path";

const browserCommands = [
  "google-chrome-stable",
  "google-chrome",
  "chromium",
  "chromium-browser"
];

function executableOnPath(command, pathValue = process.env.PATH || "", platform = process.platform) {
  const extensions = platform === "win32"
    ? (process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";")
    : [""];

  return pathValue.split(delimiter).some((directory) => extensions.some((extension) => {
    if (!directory) return false;
    try {
      accessSync(join(directory, `${command}${extension}`), platform === "win32" ? constants.F_OK : constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }));
}

export function resolveBrowserExecutable({
  env = process.env,
  platform = process.platform,
  pathValue = env.PATH || ""
} = {}) {
  if (env.CHROME_PATH) return env.CHROME_PATH;

  for (const command of browserCommands) {
    if (executableOnPath(command, pathValue, platform)) return command;
  }

  if (platform !== "win32") return null;

  const windowsPaths = [
    env.PROGRAMFILES && join(env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
    env["PROGRAMFILES(X86)"] && join(env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
    env.LOCALAPPDATA && join(env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
  ].filter(Boolean);

  return windowsPaths.find((path) => existsSync(path)) || null;
}

export function npxExecutable(platform = process.platform) {
  return platform === "win32" ? "npx.cmd" : "npx";
}
