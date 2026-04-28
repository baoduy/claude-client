import { EventEmitter } from 'events';
export function nowIso() {
    return new Date().toISOString();
}
function normalizeSendInput(input) {
    if (typeof input === 'string') {
        return input;
    }
    if ('text' in input) {
        return { text: input.text };
    }
    return {
        content: input.content.map((block) => ({ ...block }))
    };
}
export function cloneQuestionPrompt(prompt) {
    return {
        ...prompt,
        options: prompt.options.map((option) => ({ ...option }))
    };
}
export function cloneOpenRequest(request) {
    if (request.kind === 'question') {
        return {
            ...request,
            questions: request.questions.map(cloneQuestionPrompt)
        };
    }
    if (request.kind === 'tool_approval') {
        return {
            ...request,
            input: { ...request.input },
            suggestions: request.suggestions.map((suggestion) => ({ ...suggestion }))
        };
    }
    if (request.kind === 'hook') {
        return {
            ...request,
            input: { ...request.input }
        };
    }
    return {
        ...request,
        message: request.message
    };
}
function cloneHistoryEntry(entry) {
    return {
        ...entry,
        toolUse: entry.toolUse ? { ...entry.toolUse, input: { ...entry.toolUse.input } } : undefined,
        toolResult: entry.toolResult ? { ...entry.toolResult } : undefined,
        request: entry.request ? cloneOpenRequest(entry.request) : undefined,
        message: entry.message ? { ...entry.message } : undefined,
        result: entry.result ? { ...entry.result } : undefined
    };
}
export function cloneSnapshot(snapshot) {
    return {
        ...snapshot,
        currentMessage: { ...snapshot.currentMessage },
        toolUses: snapshot.toolUses.map((toolUse) => ({ ...toolUse, input: { ...toolUse.input } })),
        toolResults: snapshot.toolResults.map((toolResult) => ({ ...toolResult })),
        openRequests: snapshot.openRequests.map(cloneOpenRequest),
        history: snapshot.history.map(cloneHistoryEntry),
        usage: snapshot.usage ? { ...snapshot.usage } : undefined,
        result: snapshot.result ? { ...snapshot.result } : undefined,
        metadata: snapshot.metadata ? { ...snapshot.metadata } : undefined
    };
}
function toTextContent(input) {
    if (typeof input === 'string') {
        return input;
    }
    if ('text' in input) {
        return input.text;
    }
    return input.content
        .filter((block) => block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text)
        .join('\n');
}
export function buildQuestionPrompts(input) {
    const questions = Array.isArray(input)
        ? input
        : Array.isArray(input?.questions)
            ? input.questions
            : input?.question
                ? [input]
                : [];
    return questions.map((question, index) => {
        const options = Array.isArray(question?.options) ? question.options : [];
        const mappedOptions = options.map((option, optionIndex) => {
            if (typeof option === 'string') {
                return {
                    label: option,
                    value: option
                };
            }
            return {
                label: option?.label || option?.value || `Option ${optionIndex + 1}`,
                value: option?.value || option?.label || `option-${optionIndex + 1}`,
                description: typeof option?.description === 'string' ? option.description : undefined
            };
        });
        return {
            id: String(question?.id || question?.header || `question-${index + 1}`),
            header: typeof question?.header === 'string' ? question.header : undefined,
            prompt: String(question?.question || question?.prompt || 'Please provide input.'),
            options: mappedOptions,
            multiSelect: Boolean(question?.multiSelect)
        };
    });
}
export function getQuestionLookupKeys(question) {
    const keys = [question.id, question.header, question.prompt].filter((value) => typeof value === 'string' && value.length > 0);
    return Array.from(new Set(keys));
}
export function resolveQuestionPrompt(questions, questionKey) {
    if (typeof questionKey === 'number') {
        const question = questions[questionKey];
        if (!question) {
            throw new Error(`Unknown question index: ${questionKey}`);
        }
        return { index: questionKey, question };
    }
    const index = questions.findIndex((question) => getQuestionLookupKeys(question).includes(questionKey));
    if (index < 0) {
        throw new Error(`Unknown question: ${questionKey}`);
    }
    return { index, question: questions[index] };
}
export class TurnHandle extends EventEmitter {
    session;
    snapshot;
    updateQueue = [];
    updateWaiters = [];
    done;
    resolveDone;
    rejectDone;
    constructor(session, id, input, metadata) {
        super();
        this.session = session;
        const startedAt = nowIso();
        this.snapshot = {
            id,
            input: normalizeSendInput(input),
            status: 'queued',
            currentOutputKind: 'idle',
            currentMessage: {
                type: 'idle',
                content: ''
            },
            text: '',
            thinking: '',
            toolUses: [],
            toolResults: [],
            openRequests: [],
            history: [
                {
                    kind: 'status',
                    status: 'queued',
                    timestamp: startedAt
                }
            ],
            startedAt,
            metadata
        };
        this.done = new Promise((resolve, reject) => {
            this.resolveDone = resolve;
            this.rejectDone = reject;
        });
    }
    current() {
        return cloneSnapshot(this.snapshot);
    }
    history() {
        return this.snapshot.history.map(cloneHistoryEntry);
    }
    getOpenRequests() {
        return this.snapshot.openRequests.map(cloneOpenRequest);
    }
    onUpdate(listener) {
        this.on('update', listener);
        return this;
    }
    async *updates() {
        while (true) {
            if (this.updateQueue.length > 0) {
                const update = this.updateQueue.shift();
                yield update;
                if (update.kind === 'completed' || update.kind === 'error') {
                    return;
                }
                continue;
            }
            const nextUpdate = await new Promise((resolve) => {
                this.updateWaiters.push(resolve);
            });
            if (!nextUpdate) {
                return;
            }
            yield nextUpdate;
            if (nextUpdate.kind === 'completed' || nextUpdate.kind === 'error') {
                return;
            }
        }
    }
    markQueued() {
        this.snapshot.status = 'queued';
        this.snapshot.history.push({
            kind: 'status',
            status: 'queued',
            timestamp: nowIso()
        });
        this.emitUpdate('queued');
    }
    markStarted() {
        this.snapshot.status = 'running';
        this.snapshot.history.push({
            kind: 'status',
            status: 'running',
            timestamp: nowIso()
        });
        this.emitUpdate('started');
    }
    updateStatus(status) {
        this.snapshot.status = status;
        this.snapshot.history.push({
            kind: 'status',
            status,
            timestamp: nowIso()
        });
    }
    updateOutput(kind, content) {
        this.snapshot.currentOutputKind = kind;
        this.snapshot.currentMessage = {
            type: kind,
            content
        };
        if (kind === 'text') {
            this.snapshot.text = content;
        }
        else if (kind === 'thinking') {
            this.snapshot.thinking = content;
        }
        this.snapshot.history.push({
            kind: 'output',
            outputKind: kind,
            content,
            message: { ...this.snapshot.currentMessage },
            timestamp: nowIso()
        });
        this.emitUpdate('output');
    }
    updateUsage(usage) {
        this.snapshot.usage = { ...usage };
    }
    addToolUse(tool) {
        const existingIndex = this.snapshot.toolUses.findIndex((entry) => entry.id === tool.id);
        if (existingIndex >= 0) {
            this.snapshot.toolUses[existingIndex] = tool;
        }
        else {
            this.snapshot.toolUses.push(tool);
        }
        this.snapshot.currentOutputKind = 'tool_use';
        this.snapshot.currentMessage = {
            type: 'tool_use',
            content: tool.name,
            toolName: tool.name,
            toolUseId: tool.id
        };
        this.snapshot.history.push({
            kind: 'tool_use',
            toolUse: { ...tool, input: { ...tool.input } },
            message: { ...this.snapshot.currentMessage },
            timestamp: nowIso()
        });
        this.emitUpdate('tool_use');
    }
    addToolResult(toolResult) {
        this.snapshot.toolResults.push({ ...toolResult });
        this.snapshot.currentOutputKind = 'tool_result';
        this.snapshot.currentMessage = {
            type: 'tool_result',
            content: toolResult.content,
            toolUseId: toolResult.toolUseId
        };
        this.snapshot.history.push({
            kind: 'tool_result',
            toolResult: { ...toolResult },
            message: { ...this.snapshot.currentMessage },
            timestamp: nowIso()
        });
        this.emitUpdate('tool_result');
    }
    setOpenRequests(requests) {
        this.snapshot.openRequests = requests.map(cloneOpenRequest);
    }
    openRequest(request) {
        this.snapshot.openRequests = this.session.getOpenRequestsForTurn(this.snapshot.id);
        this.snapshot.currentOutputKind = request.kind === 'question' ? 'question' : request.kind === 'tool_approval' ? 'tool_approval' : request.kind;
        this.snapshot.currentMessage = {
            type: this.snapshot.currentOutputKind,
            content: request.kind === 'question' ? request.prompt : request.kind === 'tool_approval' ? request.toolName : request.kind,
            requestId: request.id
        };
        this.snapshot.history.push({
            kind: 'request_opened',
            request: cloneOpenRequest(request),
            message: { ...this.snapshot.currentMessage },
            timestamp: nowIso()
        });
        this.emitUpdate('request_opened');
    }
    closeRequest(request) {
        this.snapshot.openRequests = this.session.getOpenRequestsForTurn(this.snapshot.id);
        this.snapshot.history.push({
            kind: 'request_closed',
            request: cloneOpenRequest(request),
            timestamp: nowIso()
        });
        this.emitUpdate('request_closed');
    }
    addAssistantMessage(message) {
        const content = message.message?.content || message.content || [];
        const textBlocks = content
            .filter((block) => block.type === 'text' && typeof block.text === 'string')
            .map((block) => block.text)
            .join('');
        if (textBlocks) {
            this.snapshot.text = textBlocks;
            this.snapshot.currentOutputKind = 'text';
            this.snapshot.currentMessage = {
                type: 'text',
                content: textBlocks
            };
        }
        this.snapshot.history.push({
            kind: 'assistant_message',
            content: textBlocks,
            message: { ...this.snapshot.currentMessage },
            timestamp: nowIso()
        });
        this.emitUpdate('assistant_message');
    }
    complete(result) {
        this.snapshot.status = result.isError ? 'error' : 'completed';
        this.snapshot.result = { ...result };
        this.snapshot.completedAt = nowIso();
        this.snapshot.currentOutputKind = result.isError ? 'error' : 'complete';
        this.snapshot.currentMessage = {
            type: this.snapshot.currentOutputKind,
            content: result.error || result.result
        };
        this.snapshot.history.push({
            kind: result.isError ? 'error' : 'completed',
            result: { ...result },
            message: { ...this.snapshot.currentMessage },
            timestamp: this.snapshot.completedAt
        });
        this.emitUpdate(result.isError ? 'error' : 'completed');
        this.resolveDone(cloneSnapshot(this.snapshot));
        this.closeIterators();
    }
    fail(error) {
        this.snapshot.status = 'error';
        this.snapshot.completedAt = nowIso();
        this.snapshot.currentOutputKind = 'error';
        this.snapshot.currentMessage = {
            type: 'error',
            content: error.message
        };
        this.snapshot.history.push({
            kind: 'error',
            content: error.message,
            message: { ...this.snapshot.currentMessage },
            timestamp: this.snapshot.completedAt
        });
        this.emitUpdate('error');
        this.rejectDone(error);
        this.closeIterators();
    }
    emitUpdate(kind) {
        const update = {
            kind,
            turnId: this.snapshot.id,
            snapshot: cloneSnapshot(this.snapshot)
        };
        const waiter = this.updateWaiters.shift();
        if (waiter) {
            waiter(update);
        }
        else {
            this.updateQueue.push(update);
        }
        this.emit('update', update);
    }
    closeIterators() {
        while (this.updateWaiters.length > 0) {
            const waiter = this.updateWaiters.shift();
            waiter?.(null);
        }
    }
}
