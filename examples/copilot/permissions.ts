import { CopilotClient } from '@drunkcoding/ai-cli-clients/copilot';

async function main() {
  const client = new CopilotClient({
    cwd: process.cwd(),
    // Fine-grained, per the GitHub best-practices guidance.
    allowTools: ['shell(git:*)', 'read'],
    denyTools: ['shell(git push)', 'shell(rm:*)'],
  });
  await client.start();

  await client.sendMessage('Show me the latest 5 git commits.');

  await client.close();
}

main().catch(err => { console.error(err); process.exit(1); });
