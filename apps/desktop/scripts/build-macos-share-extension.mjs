import { execFileSync } from "node:child_process";
import { cp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

if (process.platform !== "darwin") {
  console.log("Skipping the Burrowise macOS Share Extension on this platform.");
  process.exit(0);
}

const app = path.resolve("src-tauri/target/release/bundle/macos/Burrowise.app");
const sourceRoot = path.resolve("src-tauri/macos-share-extension");
const extensionBundle = path.join(
  app,
  "Contents/PlugIns/BurrowiseShare.appex",
);
const contents = path.join(extensionBundle, "Contents");
const executable = path.join(contents, "MacOS/BurrowiseShare");
const sdk = execFileSync("xcrun", ["--show-sdk-path"], {
  encoding: "utf8",
}).trim();
const architecture = os.arch() === "arm64" ? "arm64" : "x86_64";

await rm(extensionBundle, { recursive: true, force: true });
await mkdir(path.dirname(executable), { recursive: true });
await cp(path.join(sourceRoot, "Info.plist"), path.join(contents, "Info.plist"));

execFileSync(
  "xcrun",
  [
    "swiftc",
    path.join(sourceRoot, "ShareViewController.swift"),
    "-parse-as-library",
    "-module-name",
    "BurrowiseShare",
    "-target",
    `${architecture}-apple-macos13.0`,
    "-sdk",
    sdk,
    "-framework",
    "AppKit",
    "-framework",
    "UniformTypeIdentifiers",
    "-emit-executable",
    "-Xlinker",
    "-e",
    "-Xlinker",
    "_NSExtensionMain",
    "-o",
    executable,
  ],
  { stdio: "inherit" },
);

console.log(`Embedded Save to Burrowise at ${extensionBundle}`);
