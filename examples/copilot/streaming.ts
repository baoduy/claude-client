import { CopilotClient } from '@baoduy2412/ai-cli-client/copilot';

async function main() {
  const client = new CopilotClient({ cwd: process.cwd() });
  await client.start();

  const turn = client.send('List three Node.js best practices.');
  for await (const update of turn.updates()) {
    if (update.kind === 'output')   process.stdout.write(update.delta);
    if (update.kind === 'tool_use') console.log('\n[tool]', update.tool.name);
  }
  process.stdout.write('\n');

  await turn.done;
  await client.close();
}

main().catch(err => { console.error(err); process.exit(1); });
