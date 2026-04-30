import type { SendInput, ContentBlock } from '../unified/index.js';
import { UnsupportedContentError } from '../unified/index.js';

export type CopilotAttachment =
  | { type: 'file'; path: string; displayName?: string }
  | { type: 'directory'; path: string; displayName?: string }
  | {
      type: 'selection';
      filePath: string;
      displayName: string;
      selection?: { start: { line: number; character: number }; end: { line: number; character: number } };
      text?: string;
    }
  | { type: 'blob'; data: string; mimeType: string; displayName?: string };

export interface CopilotMessage {
  prompt: string;
  attachments?: CopilotAttachment[];
}

/**
 * Translate a unified SendInput to Copilot's MessageOptions shape.
 *
 * - Plain strings or `{ text }` map to `{ prompt }` only.
 * - Text content blocks concatenate into `prompt`.
 * - `image` with `base64` source → `blob` attachment.
 * - `image` with `url` source → throws UnsupportedContentError (Copilot has no URL attachment).
 * - `file_path` / `directory_path` / `selection` → matching Copilot attachment kinds.
 * - Empty content array throws UnsupportedContentError.
 */
export function sendInputToCopilotMessage(input: SendInput): CopilotMessage {
  if (typeof input === 'string') return { prompt: input };
  if ('text' in input) return { prompt: input.text };

  if (input.content.length === 0) {
    throw new UnsupportedContentError(
      'copilot',
      { type: 'text', text: '' } as ContentBlock,
      0,
    );
  }

  let prompt = '';
  const attachments: CopilotAttachment[] = [];

  for (let i = 0; i < input.content.length; i++) {
    const block = input.content[i];
    switch (block.type) {
      case 'text':
        prompt += block.text;
        break;
      case 'image': {
        if (block.source.type === 'base64') {
          attachments.push({
            type: 'blob',
            data: block.source.data,
            mimeType: block.source.mediaType,
          });
        } else {
          throw new UnsupportedContentError('copilot', block, i);
        }
        break;
      }
      case 'file_path':
        attachments.push({
          type: 'file',
          path: block.path,
          ...(block.displayName !== undefined && { displayName: block.displayName }),
        });
        break;
      case 'directory_path':
        attachments.push({
          type: 'directory',
          path: block.path,
          ...(block.displayName !== undefined && { displayName: block.displayName }),
        });
        break;
      case 'selection':
        attachments.push({
          type: 'selection',
          filePath: block.filePath,
          displayName: block.displayName,
          ...(block.range !== undefined && { selection: block.range }),
          ...(block.text !== undefined && { text: block.text }),
        });
        break;
      default: {
        const _exhaustive: never = block;
        throw new UnsupportedContentError('copilot', block as ContentBlock, i);
      }
    }
  }

  if (attachments.length === 0) return { prompt };
  return { prompt, attachments };
}
