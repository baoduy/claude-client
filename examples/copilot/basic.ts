import { CopilotClient } from '@drunkcoding/ai-cli-clients/copilot';

async function main() {
  const client = new CopilotClient({ cwd: process.cwd() });
  await client.start();
  console.log('Session:', client.sessionId);

  await client.sendMessage('Summarize this project in one sentence.');

  const [latest] = client.getHistory().slice(-1);
  console.log('Reply:', latest.text);

  await client.close();
}

main().catch(err => { console.error(err); process.exit(1); });
