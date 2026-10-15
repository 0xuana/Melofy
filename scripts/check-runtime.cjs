const major = Number.parseInt(process.versions.node.split(".")[0], 10);

if (major < 24) {
  console.error(
    `QQMusic Web Player requires Node 24 or newer; current version is ${process.version}.\n` +
      "Run `nvm use` in this directory, then run `npm ci` before `npm run dev`.",
  );
  process.exit(1);
}
