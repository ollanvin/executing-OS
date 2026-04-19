const fs = require("fs");
const path = require("path");
const dist = path.join(__dirname, "..", "dist");
fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(path.join(dist, "index.html"), "<!doctype html><title>stub</title><p>ok</p>\n");
console.log("build ok");
