const fs = require("node:fs");
const path = require("node:path");

const source = path.resolve(__dirname, "..", "Itinerary-Builder.html");
const runtimeDirectory = path.resolve(__dirname, "runtime");
const destination = path.join(runtimeDirectory, "Itinerary-Builder.html");

fs.mkdirSync(runtimeDirectory, { recursive: true });
fs.copyFileSync(source, destination);
console.log(`Copied ${source} to ${destination}`);
