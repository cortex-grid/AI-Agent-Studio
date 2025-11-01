
import { cn } from "@/lib/utils";

export type MessageRole = "user" | "assistant" | "system";

export interface ChatMessageProps {
  content: string;
  role: MessageRole;
  isStreaming?: boolean;
  agent_used?: string | null;
  thread_id?: string | null;
}

export function ChatMessage({ content, role, isStreaming, agent_used, thread_id }: ChatMessageProps) {
  return (
    <div
      className={cn(
        "py-5 px-5 md:px-8 lg:px-12 flex items-start gap-4 w-full",
        role === "user" ? "bg-chatbot-user" : "bg-chatbot-assistant"
      )}
    >
      <div
        className={cn(
          "shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
          role === "user" ? "bg-blue-600 text-white" : "bg-emerald-500 text-white"
        )}
      >
        {role === "user" ? (
          <span className="text-sm font-semibold">U</span>
        ) : (
          <span className="text-sm font-semibold">AI</span>
        )}
      </div>
      
      <div className="flex-1 min-w-0 markdown-content">
        {!isStreaming ? (
          <div>
            <div>{content}</div>
            {(agent_used || thread_id) && (
              <div className="text-xs text-gray-400 mt-2">
                {agent_used && <span className="mr-2">Agent: {agent_used}</span>}
                {thread_id && <span>Thread: {thread_id}</span>}
              </div>
            )}
          </div>
        ) : (
          <div>
            {content}
            <span className="typing-indicator"></span>
          </div>
        )}
      </div>
    </div>
  );
}
