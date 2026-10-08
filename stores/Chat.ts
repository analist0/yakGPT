import type { ChatSummary } from "./Compaction";
import type { Plan } from "./Agent";
import { Message } from "./Message";

export interface Chat {
  id: string;
  title?: string | undefined;
  messages: Message[];
  chosenCharacter?: string | undefined;
  // Earlier messages summarized by context compaction (stores/Compaction.ts)
  summary?: ChatSummary;
  // The agent's task list (update_plan tool)
  plan?: Plan;
  createdAt?: Date | undefined;
  promptTokensUsed?: number;
  completionTokensUsed?: number;
  costIncurred?: number;
}
