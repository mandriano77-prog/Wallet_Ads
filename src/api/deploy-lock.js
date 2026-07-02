// Product-line lock del deploy. Filo_Diretto = repo HR-only: il lock è
// hardcoded e blindato dai lock test (vedi CLAUDE.md).
'use strict';

const DEPLOY_PRODUCT_LINES = ['ads', 'hr', 'engage', 'live'];
/** Filo_Diretto repo: deploy is HR-only. */
function deployProductLineLock() {
  return 'hr';
}
function brandProductLine(brand) {
  const pl = brand?.config?.product_line;
  return DEPLOY_PRODUCT_LINES.includes(pl) ? pl : 'hr';
}
function brandAllowedOnDeploy(brand) {
  const lock = deployProductLineLock();
  if (!lock) return true;
  return brandProductLine(brand) === lock;
}

module.exports = { DEPLOY_PRODUCT_LINES, deployProductLineLock, brandProductLine, brandAllowedOnDeploy };
