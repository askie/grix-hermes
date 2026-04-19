#!/usr/bin/env node
import { runSharedCliAction } from "../../shared/cli/skill-wrapper.js";
runSharedCliAction("key_rotate", process.argv.slice(2));
