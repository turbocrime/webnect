#!/usr/bin/env node --experimental-strip-types

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const [inputPath, outputPath] = process.argv
	.slice(2)
	.map((p) => path.resolve(process.cwd(), p));

if (!inputPath || !outputPath) {
	console.info("Convert a blob URL in a text file to a binary file");
	console.info("Usage: convert-blob-url <input> <output>");
	process.exit(1);
}

const base64Url = await fs.readFile(inputPath, "utf-8");
const bytes = await fetch(base64Url).then((r) => r.bytes());
await fs.writeFile(outputPath, bytes);
