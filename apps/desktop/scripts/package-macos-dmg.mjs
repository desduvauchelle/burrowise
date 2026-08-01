import { execFileSync } from "node:child_process";
import { cp, mkdir, rm, symlink } from "node:fs/promises";
import path from "node:path";

if (process.platform !== "darwin") {
  console.log("Skipping the Burrowise DMG on this platform.");
  process.exit(0);
}

const app = path.resolve("src-tauri/target/release/bundle/macos/Burrowise.app");
const output = path.resolve(
  "src-tauri/target/release/bundle/dmg/Burrowise_0.5.1_aarch64.dmg",
);
const staging = path.resolve(
  "src-tauri/target/release/bundle/dmg/Burrowise-dmg-root",
);

await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });
await cp(app, path.join(staging, "Burrowise.app"), { recursive: true });
await symlink("/Applications", path.join(staging, "Applications"));
await rm(output, { force: true });

execFileSync(
  "hdiutil",
  [
    "create",
    "-volname",
    "Burrowise",
    "-srcfolder",
    staging,
    "-format",
    "UDZO",
    "-ov",
    output,
  ],
  { stdio: "inherit" },
);
await rm(staging, { recursive: true, force: true });
console.log(`Created signed Share-enabled DMG at ${output}`);
