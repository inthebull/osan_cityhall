// 모델 이름은 여기서만 정한다.
export const MODELS = {
  answer: process.env.CLAUDE_MODEL_ANSWER ?? "claude-sonnet-5-5",
} as const;
