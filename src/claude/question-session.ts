import {
    cloneOpenRequest,
    cloneQuestionPrompt,
    resolveQuestionPrompt
} from './turn-handle.js';
import type {
    ClaudeQuestionSessionSnapshot,
    QuestionAnswerInput,
    QuestionAnswerValue,
    QuestionPrompt,
    QuestionRequest
} from './turn-handle.js';

/**
 * Minimal contract a ClaudeQuestionSession needs from its host client.
 * Both ClaudeClient and StructuredClaudeClient satisfy this structurally.
 */
export interface QuestionAnswerSubmitter {
    answerQuestion(id: string, answers: QuestionAnswerInput): Promise<void>;
}

export class ClaudeQuestionSession {
    private readonly request: QuestionRequest;
    private readonly answers = new Map<string, QuestionAnswerValue>();
    private currentIndex: number;

    constructor(private readonly client: QuestionAnswerSubmitter, request: QuestionRequest) {
        this.request = cloneOpenRequest(request) as QuestionRequest;
        this.currentIndex = Math.min(
            Math.max(request.currentQuestionIndex || 0, 0),
            Math.max(this.request.questions.length - 1, 0)
        );
    }

    get requestId(): string {
        return this.request.id;
    }

    current(): ClaudeQuestionSessionSnapshot {
        return {
            requestId: this.request.id,
            request: cloneOpenRequest(this.request) as QuestionRequest,
            currentIndex: this.currentIndex,
            answers: this.getAnswers()
        };
    }

    getCurrentQuestion(): QuestionPrompt | null {
        return this.request.questions[this.currentIndex]
            ? cloneQuestionPrompt(this.request.questions[this.currentIndex])
            : null;
    }

    getAnswers(): Record<string, QuestionAnswerValue> {
        const values: Record<string, QuestionAnswerValue> = {};
        for (const question of this.request.questions) {
            const answer = this.answers.get(question.id);
            if (answer !== undefined) {
                values[question.id] = Array.isArray(answer) ? [...answer] : answer;
            }
        }
        return values;
    }

    setAnswer(questionKey: string | number, answer: QuestionAnswerValue): this {
        const { question } = resolveQuestionPrompt(this.request.questions, questionKey);
        this.answers.set(question.id, Array.isArray(answer) ? [...answer] : answer);
        return this;
    }

    setCurrentAnswer(answer: QuestionAnswerValue): this {
        const question = this.getCurrentQuestion();
        if (!question) {
            throw new Error('No current question available.');
        }

        return this.setAnswer(question.id, answer);
    }

    next(): QuestionPrompt | null {
        if (this.currentIndex < this.request.questions.length - 1) {
            this.currentIndex += 1;
        }
        return this.getCurrentQuestion();
    }

    previous(): QuestionPrompt | null {
        if (this.currentIndex > 0) {
            this.currentIndex -= 1;
        }
        return this.getCurrentQuestion();
    }

    async submit(): Promise<void> {
        await this.client.answerQuestion(this.request.id, this.getAnswers());
    }
}
