import { createInsightsCommands } from '../../src/opencode/create-command.js';
import { runInsights } from '../../src/opencode/run-insights.js';

export const AgentInsightsPlugin = async () => ({
  tui: async (api) => {
    api.command.register(() =>
      createInsightsCommands({
        runInsights: () => runInsights({ api }),
      }),
    );
  },
});
