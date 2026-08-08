#!/usr/bin/env node
/**
 * Alias for inspect:dom - DOM inspector for chat list selector discovery.
 */
import { main } from './inspectDom.js';

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
