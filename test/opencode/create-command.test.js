import test from 'node:test';
import assert from 'node:assert/strict';

import { createInsightsCommands } from '../../src/opencode/create-command.js';

test('creates a visible /insights slash command', async () => {
  const calls = [];
  const commands = createInsightsCommands({
    runInsights: async () => {
      calls.push('ran');
    },
  });

  assert.equal(commands.length, 1);
  assert.equal(commands[0].title, 'Insights report');
  assert.equal(commands[0].slash?.name, 'insights');
  assert.equal(commands[0].value, 'insights.generate');

  await commands[0].onSelect();
  assert.deepEqual(calls, ['ran']);
});
