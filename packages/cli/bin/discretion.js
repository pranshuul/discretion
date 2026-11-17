#!/usr/bin/env node
import process from "node:process";
import { run } from "../dist/main.js";

process.exitCode = await run(process.argv.slice(2), process.stdout, process.stderr);
