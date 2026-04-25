export function createInsightsCommands({ runInsights }) {
  return [
    {
      title: 'Insights report',
      value: 'insights.generate',
      description: 'Generate a 30-day OpenCode insights report',
      category: 'Insights',
      suggested: true,
      slash: { name: 'insights' },
      onSelect: async () => {
        await runInsights();
      },
    },
  ];
}
