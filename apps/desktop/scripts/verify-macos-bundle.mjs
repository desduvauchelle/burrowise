import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";

const executable = path.resolve(
  "src-tauri/target/release/bundle/macos/Burrowise.app/Contents/MacOS/second-brain-desktop",
);
const shareExtension = path.resolve(
  "src-tauri/target/release/bundle/macos/Burrowise.app/Contents/PlugIns/BurrowiseShare.appex",
);
const readyMarker = "SECOND_BRAIN_UI_READY";

await access(executable);
await access(shareExtension);

const extensionCheck = spawn(
  "codesign",
  ["--verify", "--strict", "--verbose=2", shareExtension],
  { stdio: "inherit" },
);
await new Promise((resolve, reject) => {
  extensionCheck.once("error", reject);
  extensionCheck.once("exit", (code) =>
    code === 0 ? resolve() : reject(new Error("Share Extension signature verification failed.")),
  );
});

const child = spawn(executable, [], {
  env: { ...process.env },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
child.stdout.on("data", (chunk) => { output += chunk; });
child.stderr.on("data", (chunk) => { output += chunk; });

const timeout = setTimeout(() => child.kill("SIGTERM"), 10_000);
const poll = setInterval(() => {
  if (output.includes(readyMarker)) child.kill("SIGTERM");
}, 50);

await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", resolve);
});

clearInterval(poll);
clearTimeout(timeout);

if (!output.includes(readyMarker)) {
  console.error(output);
  throw new Error("Packaged frontend did not mount; refusing to install this bundle.");
}

console.log("Packaged frontend mounted successfully.");
