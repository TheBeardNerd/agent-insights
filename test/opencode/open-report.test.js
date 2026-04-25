import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import { openReport } from '../../src/opencode/open-report.js';

test('openReport resolves true when browser launch starts', async () => {
  class FakeChild extends EventEmitter { unref() {} }
  const launched = openReport('/tmp/report.html', () => {
    const child = new FakeChild();
    queueMicrotask(() => child.emit('spawn'));
    return child;
  });
  assert.equal(await launched, true);
});
