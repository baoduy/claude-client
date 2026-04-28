"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaudeQuestionSession = void 0;
const turn_handle_js_1 = require("./turn-handle.js");
class ClaudeQuestionSession {
    client;
    request;
    answers = new Map();
    currentIndex;
    constructor(client, request) {
        this.client = client;
        this.request = (0, turn_handle_js_1.cloneOpenRequest)(request);
        this.currentIndex = Math.min(Math.max(request.currentQuestionIndex || 0, 0), Math.max(this.request.questions.length - 1, 0));
    }
    get requestId() {
        return this.request.id;
    }
    current() {
        return {
            requestId: this.request.id,
            request: (0, turn_handle_js_1.cloneOpenRequest)(this.request),
            currentIndex: this.currentIndex,
            answers: this.getAnswers()
        };
    }
    getCurrentQuestion() {
        return this.request.questions[this.currentIndex]
            ? (0, turn_handle_js_1.cloneQuestionPrompt)(this.request.questions[this.currentIndex])
            : null;
    }
    getAnswers() {
        const values = {};
        for (const question of this.request.questions) {
            const answer = this.answers.get(question.id);
            if (answer !== undefined) {
                values[question.id] = Array.isArray(answer) ? [...answer] : answer;
            }
        }
        return values;
    }
    setAnswer(questionKey, answer) {
        const { question } = (0, turn_handle_js_1.resolveQuestionPrompt)(this.request.questions, questionKey);
        this.answers.set(question.id, Array.isArray(answer) ? [...answer] : answer);
        return this;
    }
    setCurrentAnswer(answer) {
        const question = this.getCurrentQuestion();
        if (!question) {
            throw new Error('No current question available.');
        }
        return this.setAnswer(question.id, answer);
    }
    next() {
        if (this.currentIndex < this.request.questions.length - 1) {
            this.currentIndex += 1;
        }
        return this.getCurrentQuestion();
    }
    previous() {
        if (this.currentIndex > 0) {
            this.currentIndex -= 1;
        }
        return this.getCurrentQuestion();
    }
    async submit() {
        await this.client.answerQuestion(this.request.id, this.getAnswers());
    }
}
exports.ClaudeQuestionSession = ClaudeQuestionSession;
