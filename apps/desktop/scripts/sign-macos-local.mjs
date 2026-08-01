import { spawnSync } from "node:child_process";
import path from "node:path";

if (process.platform !== "darwin") {
  console.log("Skipping local macOS signing on this platform.");
  process.exit(0);
}

const bundle = path.resolve(
  "src-tauri/target/release/bundle/macos/Burrowise.app",
);
const requirement = '=designated => identifier "ai.recursivesolutions.secondbrain"';
const shareExtension = path.join(
  bundle,
  "Contents/PlugIns/BurrowiseShare.appex",
);
const extensionEntitlements = path.resolve(
  "src-tauri/macos-share-extension/BurrowiseShare.entitlements",
);
const appEntitlements = path.resolve("src-tauri/Burrowise.entitlements");

const extensionSigned = spawnSync(
  "codesign",
  [
    "--force",
    "--sign",
    "-",
    "--entitlements",
    extensionEntitlements,
    shareExtension,
  ],
  { encoding: "utf8" },
);

if (extensionSigned.status !== 0) {
  process.stderr.write(extensionSigned.stderr);
  throw new Error("Unable to sign the Burrowise Share Extension.");
}

const signed = spawnSync(
  "codesign",
  [
    "--force",
    "--sign",
    "-",
    "--entitlements",
    appEntitlements,
    "--requirements",
    requirement,
    bundle,
  ],
  { encoding: "utf8" },
);

if (signed.status !== 0) {
  process.stderr.write(signed.stderr);
  throw new Error("Unable to apply the stable local development signature.");
}

const verified = spawnSync(
  "codesign",
  ["--verify", "--deep", "--strict", "--verbose=2", bundle],
  { encoding: "utf8" },
);

if (verified.status !== 0) {
  process.stderr.write(verified.stderr);
  throw new Error("The locally signed app bundle failed verification.");
}

console.log("Applied stable local identity: ai.recursivesolutions.secondbrain");
