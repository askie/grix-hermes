#!/usr/bin/env node
import { runSharedCliAction } from "../../shared/cli/skill-wrapper.js";
runSharedCliAction("unsend", process.argv.slice(2));
