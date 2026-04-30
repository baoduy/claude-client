import type { ContentBlock } from './types.js';

export class UnsupportedContentError extends Error {
  readonly provider: 'claude' | 'copilot';
  readonly unsupportedBlock: ContentBlock;
  readonly inputIndex: number;

  constructor(
    provider: 'claude' | 'copilot',
    block: ContentBlock,
    index: number,
  ) {
    super(
      `Provider '${provider}' does not support content block of type ` +
      `'${block.type}' at index ${index}`,
    );
    this.name = 'UnsupportedContentError';
    this.provider = provider;
    this.unsupportedBlock = block;
    this.inputIndex = index;
  }
}

export class UnsupportedModeError extends Error {
  override readonly name = 'UnsupportedModeError';
  constructor(public readonly provider: string, public readonly mode: string) {
    super(`Provider '${provider}' does not support permission mode '${mode}'.`);
  }
}
