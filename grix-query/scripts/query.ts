#!/usr/bin/env node
import { runSharedCliAction } from "../../shared/cli/skill-wrapper.js";
runSharedCliAction("query", process.argv.slice(2));
