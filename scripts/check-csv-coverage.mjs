#!/usr/bin/env node
// Standalone CSV coverage check. The same rule verify.mjs gates on, runnable on
// its own for /ship and for a CI job that does not need the whole suite.

import { auditCsvCoverage } from './lib/csv-coverage.mjs'
import { repoRoot } from './lib/tree-digest.mjs'

const result = auditCsvCoverage(repoRoot())
if (result.ok) {
  console.log('CSV coverage: every domain declared, every declaration matches its routes.')
  process.exit(0)
}
console.error(result.detail)
process.exit(1)
