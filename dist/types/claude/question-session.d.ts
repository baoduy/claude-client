import type { ClaudeQuestionSessionSnapshot, QuestionAnswerInput, QuestionAnswerValue, QuestionPrompt, QuestionRequest } from './turn-handle.js';
/**
 * Minimal contract a ClaudeQuestionSession needs from its host client.
 * Both ClaudeClient and StructuredClaudeClient satisfy this structurally.
 */
export interface QuestionAnswerSubmitter {
    answerQuestion(id: string, answers: QuestionAnswerInput): Promise<void>;
}
export declare class ClaudeQuestionSession {
    private readonly client;
    private readonly request;
    private readonly answers;
    private currentIndex;
    constructor(client: QuestionAnswerSubmitter, request: QuestionRequest);
    get requestId(): string;
    current(): ClaudeQuestionSessionSnapshot;
    getCurrentQuestion(): QuestionPrompt | null;
    getAnswers(): Record<string, QuestionAnswerValue>;
    setAnswer(questionKey: string | number, answer: QuestionAnswerValue): this;
    setCurrentAnswer(answer: QuestionAnswerValue): this;
    next(): QuestionPrompt | null;
    previous(): QuestionPrompt | null;
    submit(): Promise<void>;
}
