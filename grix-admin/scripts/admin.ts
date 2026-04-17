#!/usr/bin/env node
import { runSharedCliAction } from "../../shared/cli/skill-wrapper.js";
runSharedCliAction("admin", process.argv.slice(2));
