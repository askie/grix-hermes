#!/usr/bin/env node
import { runSharedCliAction } from "../../shared/cli/skill-wrapper.js";
runSharedCliAction("group", process.argv.slice(2));
