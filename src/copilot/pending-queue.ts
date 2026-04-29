import { randomUUID } from 'crypto';
import type {
  PermissionRequest,
  PermissionRequestResult,
  ElicitationContext,
  ElicitationResult,
  UserInputRequest,
  UserInputResponse,
} from './sdk.js';
import type {
  PendingRequest,
  ApproveDecision,
  QuestionResponse,
  PendingAction,
} from '../unified/index.js';

interface PermissionEntry {
  id: string;
  kind: 'permission';
  request: PermissionRequest;
  resolve: (r: PermissionRequestResult) => void;
  insertedAt: number;
}
interface ElicitationEntry {
  id: string;
  kind: 'elicitation';
  context: ElicitationContext;
  resolve: (r: ElicitationResult) => void;
  insertedAt: number;
}
interface UserInputEntry {
  id: string;
  kind: 'question';
  request: UserInputRequest;
  resolve: (r: UserInputResponse) => void;
  insertedAt: number;
}
type Entry = PermissionEntry | ElicitationEntry | UserInputEntry;

type EventName =
  | 'pending_request_added'
  | 'pending_request_removed'
  | 'pending_request_resolved';

interface QueueDeps {
  emit: (name: EventName, payload: any) => void;
}

export class PendingRequestQueue {
  private map = new Map<string, Entry>();
  private deps: QueueDeps;
  private autoEdit = false;
  private seq = 0;

  constructor(deps: QueueDeps) {
    this.deps = deps;
  }

  /** Monotonic insertion sequence — guarantees stable ordering. */
  private nextStamp(): number {
    return ++this.seq;
  }

  /** Toggle auto-approval of `PermissionRequest.kind === 'write'` entries. */
  setAutoEdit(enabled: boolean): void {
    this.autoEdit = enabled;
  }

  registerPermission(request: PermissionRequest, _sessionId: string): Promise<PermissionRequestResult> {
    return new Promise(resolve => {
      const id = `perm-${randomUUID()}`;
      const entry: PermissionEntry = { id, kind: 'permission', request, resolve, insertedAt: this.nextStamp() };
      this.map.set(id, entry);
      this.deps.emit('pending_request_added', { id, kind: 'permission' });

      if (this.autoEdit && request.kind === 'write') {
        // Auto-resolve immediately, on the next microtask so the consumer sees
        // the 'added' event first.
        queueMicrotask(() => {
          if (!this.map.has(id)) return; // already resolved by another path
          this.map.delete(id);
          resolve({ kind: 'approve-once' } as PermissionRequestResult);
          this.deps.emit('pending_request_removed', { id });
          this.deps.emit('pending_request_resolved', { id, outcome: 'approved' });
        });
      }
    });
  }

  registerElicitation(context: ElicitationContext): Promise<ElicitationResult> {
    return new Promise(resolve => {
      const id = `elic-${randomUUID()}`;
      this.map.set(id, { id, kind: 'elicitation', context, resolve, insertedAt: this.nextStamp() });
      this.deps.emit('pending_request_added', { id, kind: 'elicitation' });
    });
  }

  registerUserInput(request: UserInputRequest, _sessionId: string): Promise<UserInputResponse> {
    return new Promise(resolve => {
      const id = `qst-${randomUUID()}`;
      this.map.set(id, { id, kind: 'question', request, resolve, insertedAt: this.nextStamp() });
      this.deps.emit('pending_request_added', { id, kind: 'question' });
    });
  }

  list(): PendingRequest[] {
    const entries = Array.from(this.map.values()).sort((a, b) => a.insertedAt - b.insertedAt);
    return entries.map(toPendingRequest);
  }

  getMostRecent(): PendingAction | null {
    let latest: Entry | null = null;
    for (const e of this.map.values()) {
      if (!latest || e.insertedAt > latest.insertedAt) latest = e;
    }
    return latest ? { id: latest.id, kind: latest.kind } : null;
  }

  size(): number {
    return this.map.size;
  }

  async resolveApprove(id: string, decision: ApproveDecision = { scope: 'once' }): Promise<void> {
    const entry = this.map.get(id);
    if (!entry || entry.kind !== 'permission') {
      throw new Error(
        entry
          ? `Pending request id=${id} is a ${entry.kind} — call answerQuestion instead`
          : `No pending permission request with id=${id}`,
      );
    }
    const result: PermissionRequestResult = decisionToResult(decision);
    entry.resolve(result);
    this.map.delete(id);
    this.deps.emit('pending_request_removed', { id });
    this.deps.emit('pending_request_resolved', { id, outcome: 'approved' });
  }

  async resolveDeny(id: string, feedback?: string): Promise<void> {
    const entry = this.map.get(id);
    if (!entry || entry.kind !== 'permission') {
      throw new Error(
        entry
          ? `Pending request id=${id} is a ${entry.kind} — call answerQuestion instead`
          : `No pending permission request with id=${id}`,
      );
    }
    const result: PermissionRequestResult =
      feedback !== undefined
        ? ({ kind: 'reject', feedback } as PermissionRequestResult)
        : ({ kind: 'reject' } as PermissionRequestResult);
    entry.resolve(result);
    this.map.delete(id);
    this.deps.emit('pending_request_removed', { id });
    this.deps.emit('pending_request_resolved', { id, outcome: 'denied' });
  }

  async resolveQuestion(id: string, response: QuestionResponse): Promise<void> {
    const entry = this.map.get(id);
    if (!entry) throw new Error(`No pending request with id=${id}`);
    if (entry.kind === 'permission') {
      throw new Error(`Pending request id=${id} is a permission — call approveRequest/denyRequest instead`);
    }

    if (entry.kind === 'elicitation') {
      const result = questionToElicitationResult(response);
      entry.resolve(result);
    } else {
      const result = questionToUserInputResponse(response);
      entry.resolve(result);
    }

    this.map.delete(id);
    this.deps.emit('pending_request_removed', { id });
    this.deps.emit('pending_request_resolved', {
      id,
      outcome: response.kind === 'cancel' ? 'cancelled' : 'answered',
    });
  }
}

function toPendingRequest(entry: Entry): PendingRequest {
  switch (entry.kind) {
    case 'permission':
      return {
        id: entry.id,
        kind: 'permission',
        permissionKind: entry.request.kind,
        message: `${entry.request.kind} permission requested`,
        ...(entry.request.toolCallId !== undefined && { toolCallId: entry.request.toolCallId }),
        raw: { provider: 'copilot', payload: entry.request },
      };
    case 'elicitation':
      return {
        id: entry.id,
        kind: 'elicitation',
        message: entry.context.message,
        ...(entry.context.requestedSchema !== undefined && { schema: entry.context.requestedSchema }),
        raw: { provider: 'copilot', payload: entry.context },
      };
    case 'question':
      return {
        id: entry.id,
        kind: 'question',
        question: entry.request.question,
        ...(entry.request.choices !== undefined && { choices: entry.request.choices }),
        allowFreeform: entry.request.allowFreeform ?? true,
        raw: { provider: 'copilot', payload: entry.request },
      };
  }
}

function decisionToResult(decision: ApproveDecision): PermissionRequestResult {
  switch (decision.scope) {
    case 'once':
      return { kind: 'approve-once' } as PermissionRequestResult;
    case 'session':
      return { kind: 'approve-for-session' } as PermissionRequestResult;
    case 'location':
      return { kind: 'approve-for-location', locationKey: decision.locationKey } as PermissionRequestResult;
  }
}

function questionToElicitationResult(r: QuestionResponse): ElicitationResult {
  if (r.kind === 'cancel') return { action: 'cancel' };
  if (r.kind === 'form') return { action: 'accept', content: r.values };
  if (r.kind === 'choice') return { action: 'accept', content: { value: r.value } };
  return { action: 'accept', content: { answer: r.answer } };
}

function questionToUserInputResponse(r: QuestionResponse): UserInputResponse {
  if (r.kind === 'cancel') return { answer: '', wasFreeform: false };
  if (r.kind === 'choice') return { answer: r.value, wasFreeform: false };
  if (r.kind === 'text') return { answer: r.answer, wasFreeform: true };
  // form responses for ask_user are flattened to JSON string
  return { answer: JSON.stringify(r.values), wasFreeform: true };
}
