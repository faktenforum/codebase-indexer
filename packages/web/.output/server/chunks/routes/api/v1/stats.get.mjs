import { d as defineEventHandler, a as getQuery, u as useCodeIndexer, g as getWorkspacePath } from '../../../nitro/nitro.mjs';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:path';
import 'node:crypto';
import 'vue-router';
import 'node:url';
import 'node:child_process';
import 'ignore';
import 'node:module';
import '@iconify/utils';
import 'consola';

const stats_get = defineEventHandler(async (event) => {
  var _a;
  const query = getQuery(event);
  const indexer = useCodeIndexer();
  const workspacePath = query.workspacePath || getWorkspacePath();
  const isEnabled = indexer.isEnabled();
  const hasIndex = await indexer.hasIndex(workspacePath);
  const stats = await indexer.getIndexStats(workspacePath);
  return {
    isEnabled,
    hasIndex,
    fileCount: (_a = stats == null ? void 0 : stats.fileCount) != null ? _a : null
  };
});

export { stats_get as default };
//# sourceMappingURL=stats.get.mjs.map
