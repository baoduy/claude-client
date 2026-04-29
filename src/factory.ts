import { ClaudeClient, type ClaudeClientConfig } from './claude/index.js';
import { CopilotClient } from './copilot/index.js';
import type { CopilotClientConfig } from './copilot/index.js';
import type { AICliClient } from './ai-cli-client.js';

/**
 * Discriminated-union config for the unified factory. Pick a provider, then
 * fill in the rest of that provider's config inline. TypeScript narrows the
 * remaining fields automatically.
 */
export type AICliClientConfig =
  | ({ provider: 'claude' } & ClaudeClientConfig)
  | ({ provider: 'copilot' } & CopilotClientConfig);

/**
 * Construct and start a provider-specific client behind the unified
 * AICliClient interface. Auto-starts the underlying client; the returned
 * client is ready to use.
 *
 * @param config - Discriminated by `provider`. The remaining fields match the
 *                 chosen provider's native config.
 *
 * @example
 * const client = await createAICliClient({
 *   provider: 'claude',
 *   cwd: process.cwd(),
 * });
 * await client.sendMessage('hi');
 *
 * @remarks
 * The factory always returns a *started* client. Consumers who need to attach
 * event listeners *before* startup events fire (e.g. Copilot's `ready`) should
 * construct the concrete class directly.
 */
export async function createAICliClient(
  config: AICliClientConfig,
): Promise<AICliClient> {
  switch (config.provider) {
    case 'claude': {
      const { provider: _omit, ...claudeConfig } = config;
      void _omit;
      return await ClaudeClient.init(claudeConfig);
    }
    case 'copilot': {
      const { provider: _omit, ...copilotConfig } = config;
      void _omit;
      const client = new CopilotClient(copilotConfig);
      await client.start();
      return client;
    }
    default: {
      const _exhaustive: never = config;
      throw new Error(
        `Unknown provider: ${(_exhaustive as { provider: string }).provider}`,
      );
    }
  }
}
