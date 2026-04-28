import { ClaudeClient } from '@baoduy2412/ai-cli-client';

const client = new ClaudeClient({ cwd: process.cwd() });

client.on('error', (error) => {
  console.error('Claude client error:', error.message);
});

try {
  await client.start();
  await client.sendMessage('Run a quick health check.');
} catch (error) {
  console.error('Request failed:', error);
} finally {
  client.kill();
}
