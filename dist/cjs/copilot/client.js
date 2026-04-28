"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CopilotClient = void 0;
const events_1 = require("events");
const crypto_1 = require("crypto");
const transport_js_1 = require("./transport.js");
const turn_handle_js_1 = require("./turn-handle.js");
const errors_js_1 = require("./errors.js");
class CopilotClient extends events_1.EventEmitter {
    config;
    transport;
    _status = 'idle';
    _currentTurn = null;
    _history = [];
    _messageQueue = [];
    constructor(config, internals) {
        super();
        this.config = config;
        this.transport = new transport_js_1.CopilotTransport({ config, GhClientCtor: internals?.GhClientCtor });
    }
    async start() {
        await this.transport.start();
        this.setStatus('idle');
        this.emit('ready');
    }
    async close() {
        await this.transport.stop();
        this._currentTurn = null;
    }
    get sessionId() {
        return this.transport.sessionId;
    }
    getStatus() {
        return this._status;
    }
    isProcessing() {
        return this._status === 'running';
    }
    getCurrentTurn() {
        return this._currentTurn;
    }
    getHistory() {
        return this._history.slice();
    }
    /** Internal: status transitions emit `status_change`. */
    setStatus(status, action = null) {
        if (this._status === status)
            return;
        this._status = status;
        this.emit('status_change', status, action);
    }
    send(prompt) {
        if (this._currentTurn) {
            throw new Error('A turn is already in flight. Call interrupt() first or await turn.done.');
        }
        const turnId = (0, crypto_1.randomUUID)();
        const initial = {
            turnId,
            status: 'running',
            text: '',
            reasoningText: '',
            toolCalls: [],
            usage: null,
            startedAt: Date.now(),
            endedAt: null,
            error: null,
        };
        const handle = new turn_handle_js_1.CopilotTurnHandle(initial);
        this._currentTurn = handle;
        this.setStatus('running');
        // Wire SDK events → handle updates + client events. Microtask so callers can subscribe first.
        queueMicrotask(() => this.runTurn(prompt, handle).catch(err => {
            this.emit('error', err);
        }));
        return handle;
    }
    async sendMessage(text) {
        const turn = this.send(text);
        await turn.done;
    }
    queueMessage(text) {
        if (this._status === 'running') {
            this._messageQueue.push(text);
        }
        else {
            this.sendMessage(text).catch(err => this.emit('error', err));
        }
    }
    async runTurn(prompt, handle) {
        const session = this.transport.session;
        if (!session) {
            handle.fail(new errors_js_1.CopilotTurnError('No active Copilot session — call start() first.'));
            this.setStatus('error');
            this._currentTurn = null;
            return;
        }
        // Subscribe to SDK events BEFORE sending. SDK 0.3.0: session.on(handler) returns unsubscribe.
        const unsubscribe = session.on?.((event) => {
            this.handleSdkEvent(event, handle);
        });
        try {
            // sendAndWait returns AssistantMessageEvent | undefined; content is at response.data.content
            const response = await session.sendAndWait({ prompt });
            const finalText = handle.current().text || response?.data?.content || response?.content || '';
            const finalSnapshot = {
                ...handle.current(),
                text: finalText,
                status: 'completed',
                endedAt: Date.now(),
            };
            handle.complete(finalSnapshot);
            this.emit('result', finalSnapshot);
            this._history.push(finalSnapshot);
        }
        catch (err) {
            // If handle was already terminated (e.g., via interrupt()), skip re-failing and re-emitting.
            if (handle.current().status !== 'error') {
                const wrapped = err instanceof Error
                    ? new errors_js_1.CopilotTurnError(err.message)
                    : new errors_js_1.CopilotTurnError(String(err));
                handle.fail(wrapped);
                this.emit('error', wrapped);
            }
            this._history.push(handle.current());
        }
        finally {
            if (typeof unsubscribe === 'function')
                unsubscribe();
            this._currentTurn = null;
            this.setStatus(handle.current().status === 'error' ? 'error' : 'idle');
            this.processNextQueued();
        }
    }
    handleSdkEvent(event, handle) {
        if (!event || typeof event !== 'object')
            return;
        const type = event.type;
        switch (type) {
            case 'assistant.streaming_delta':
            case 'assistant.message_delta': {
                const delta = event.delta ?? event.text ?? '';
                if (delta) {
                    const snapshot = { ...handle.current(), text: handle.current().text + delta };
                    handle.push({ kind: 'output', delta, snapshot });
                    this.emit('output_delta', delta);
                }
                // Some message_delta events also carry usage info
                if (event.usage) {
                    const usage = {
                        inputTokens: event.usage.inputTokens ?? 0,
                        outputTokens: event.usage.outputTokens ?? 0,
                    };
                    const snapshot = { ...handle.current(), usage };
                    handle.push({ kind: 'usage', usage, snapshot });
                    this.emit('usage_update', usage);
                }
                break;
            }
            case 'tool.execution_complete': {
                const toolUseId = event.toolUseId ?? event.id;
                const content = event.output ?? event.content ?? '';
                const isError = event.isError === true || event.success === false;
                const snapshot = { ...handle.current() };
                handle.push({ kind: 'tool_result', toolUseId, content, isError, snapshot });
                this.emit('tool_result', { toolUseId, content, isError });
                break;
            }
            case 'session.idle':
            case 'session.error':
                // Terminal events — handled by sendAndWait's resolution/rejection; nothing to push here.
                break;
            default:
                // Unrecognized event — ignore. Adapter is forward-compat with new SDK event types.
                break;
        }
    }
    processNextQueued() {
        if (this._status !== 'idle')
            return;
        const next = this._messageQueue.shift();
        if (next !== undefined) {
            void this.sendMessage(next).catch(err => this.emit('error', err));
        }
    }
    async interrupt() {
        const turn = this._currentTurn;
        if (!turn)
            return;
        const session = this.transport.session;
        try {
            if (typeof session?.abort === 'function')
                await session.abort();
        }
        catch {
            // swallow — the rejection below covers it
        }
        turn.fail(new errors_js_1.CopilotInterruptedError());
    }
}
exports.CopilotClient = CopilotClient;
