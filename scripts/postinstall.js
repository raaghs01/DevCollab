const { execSync } = require("child_process");
const path = require("path");

execSync("prisma generate", { stdio: "inherit" });

// The realtime server (server/) deploys separately (Railway/Fly.io) and
// isn't part of the Next.js app — skip installing its deps during a
// platform build (Vercel, generic CI) where they're never used, but keep
// doing it for local `npm install` so `npm run dev:all` works out of the box.
//
// Uses `cwd` rather than `npm --prefix server install`: on this setup,
// `--prefix` doesn't fully isolate lifecycle-script context from the
// invoking directory's package.json, which caused this same postinstall
// script to recursively re-invoke itself.
if (!process.env.VERCEL && !process.env.CI) {
  execSync("npm install", { cwd: path.join(__dirname, "..", "server"), stdio: "inherit" });
}
