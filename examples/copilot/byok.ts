import { CopilotClient } from '@baoduy2412/ai-cli-client/copilot';

async function main() {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) throw new Error('Set ANTHROPIC_API_KEY for this example.');

  const client = new CopilotClient({
    cwd: process.cwd(),
    apiKey: { provider: 'anthropic', key: anthropicKey },
    model: 'claude-sonnet-4.5',
  });
  await client.start();

  await client.sendMessage('Hello — confirm you are running Claude Sonnet 4.5.');

  await client.close();
}

main().catch(err => { console.error(err); process.exit(1); });
