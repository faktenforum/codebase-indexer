import { d as defineEventHandler, r as readBody, u as useCodeIndexer, g as getWorkspacePath } from '../../../nitro/nitro.mjs';
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

const releaseLock_post = defineEventHandler(async (event) => {
  const body = await readBody(event);
  const indexer = useCodeIndexer();
  const workspacePath = (body == null ? void 0 : body.workspacePath) || getWorkspacePath();
  const released = indexer.releaseLock(workspacePath);
  return { released };
});

export { releaseLock_post as default };
//# sourceMappingURL=release-lock.post.mjs.map
