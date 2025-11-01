import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, Send, Bot, User, Sparkles } from "lucide-react";
import { Node, Edge } from "reactflow";
import type { Project } from "@/lib/api";
import { generateGraphStream } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { appendProjectConversation, fetchProjectConversation } from "@/lib/storage";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface ChatPanelProps {
  project: Project;
  nodes: Node[];
  edges: Edge[];
  initialPrompt?: string | null;
  onInitialPromptConsumed?: () => void;
  onGenerateNodes: (nodes: Node[], edges: Edge[]) => void;
  initialAttachments?: AttachmentPayload[];
  initialToolHints?: string[];
  initialWorkflowPreference?: string | null;
}

interface AttachmentPayload {
  filename: string;
  contentType?: string;
  base64: string;
}

const INTRO_MESSAGE: Message = {
  id: "intro",
  role: "assistant",
  content:
    "Hi! I'm your AI assistant. Describe the agents and tools you want to create, and I'll build them on the canvas for you.",
  timestamp: new Date(),
};

export const ChatPanel = ({
  project,
  nodes,
  edges,
  initialPrompt,
  onInitialPromptConsumed,
  onGenerateNodes,
  initialAttachments,
  initialToolHints,
  initialWorkflowPreference,
}: ChatPanelProps) => {
  const { user } = useAuth();
  const storageUserId = user?.id ?? "anonymous";
  const [messages, setMessages] = useState<Message[]>([INTRO_MESSAGE]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<AttachmentPayload[]>(initialAttachments ?? []);
  const [pendingToolHints, setPendingToolHints] = useState<string[]>(initialToolHints ?? []);
  const [pendingWorkflowPreference, setPendingWorkflowPreference] = useState<string | null>(
    initialWorkflowPreference ?? null
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!project?.id) {
        setHistoryLoaded(true);
        return;
      }
      try {
        const history = await fetchProjectConversation(storageUserId, project.id, 50);
        if (cancelled) return;
        if (history.length === 0) {
          setMessages([INTRO_MESSAGE]);
        } else {
          const mapped = history.map<Message>((msg) => ({
            id: msg.id,
            role: msg.role === "assistant" ? "assistant" : "user",
            content: msg.content,
            timestamp: new Date(msg.created_at),
          }));
          setMessages([INTRO_MESSAGE, ...mapped]);
        }
      } catch (error) {
        console.error("Failed to load conversation history", error);
      } finally {
        if (!cancelled) {
          setHistoryLoaded(true);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [project?.id, storageUserId]);

  const sendPrompt = async (
    promptText: string,
    options?: { attachments?: AttachmentPayload[]; toolHints?: string[]; workflowPreference?: string | null }
  ) => {
    const trimmed = promptText.trim();
    if (!trimmed || !project?.id) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsProcessing(true);

    let assistantId: string | null = null;
    let assistantTemplate: Message | null = null;

    const applyAssistantUpdate = (content: string) => {
      if (!assistantId) return;
      setMessages((prev) => {
        const index = prev.findIndex((msg) => msg.id === assistantId);
        if (index === -1 && assistantTemplate) {
          return [...prev, { ...assistantTemplate, content }];
        }
        if (index === -1) return prev;
        const next = [...prev];
        next[index] = { ...next[index], content };
        return next;
      });
    };

    try {
      await appendProjectConversation(storageUserId, project.id, {
        role: "user",
        content: trimmed,
      });

      const conversationPayload = [
        ...messages.filter((msg) => msg.id !== "intro"),
        userMessage,
      ].map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      const workflowPreference = options?.workflowPreference ?? pendingWorkflowPreference ?? undefined;

      assistantId = `assistant-${Date.now()}`;
      assistantTemplate = {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantTemplate!]);

      let statusLines: string[] = [];
      let streamingText = "";

      const composeContent = () => {
        const statusBlock =
          statusLines.length > 0 ? statusLines.map((line) => `• ${line}`).join("\n") : "";
        const textBlock = streamingText.trim();
        return [statusBlock, textBlock].filter(Boolean).join("\n\n");
      };

      const result = await generateGraphStream(
        {
          message: trimmed,
          currentGraph: {
            nodes,
            edges,
          },
          conversation: conversationPayload,
          attachments: options?.attachments?.map((asset) => ({
            filename: asset.filename,
            contentType: asset.contentType,
            base64: asset.base64,
          })),
          toolHints: options?.toolHints,
          workflowPreference,
        },
        (event) => {
          if (event.type === "status") {
            statusLines = [...statusLines, event.data];
            applyAssistantUpdate(composeContent());
          } else if (event.type === "text") {
            streamingText += event.data.delta;
            applyAssistantUpdate(composeContent());
          } else if (event.type === "result") {
            statusLines = [];
            streamingText = event.data.message;
            applyAssistantUpdate(composeContent());
          }
        }
      );

      streamingText = result.message;
      statusLines = [];
      applyAssistantUpdate(result.message);

      if (result.nodes && result.edges) {
        onGenerateNodes(result.nodes, result.edges);
      }

      await appendProjectConversation(storageUserId, project.id, {
        role: "assistant",
        content: result.message,
      });

      if (workflowPreference) {
        setPendingWorkflowPreference(null);
      }
    } catch (error) {
      console.error("Chat error:", error);
      if (assistantId) {
        applyAssistantUpdate("Sorry, I encountered an error. Please try again.");
      } else {
        const errorMessage: Message = {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isProcessing) return;
    const text = input;
    setInput("");
    await sendPrompt(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    if (initialPrompt) {
      setInput("");
      onInitialPromptConsumed?.();
      const payloadAttachments = pendingAttachments.length > 0 ? pendingAttachments : undefined;
      const payloadTools = pendingToolHints.length > 0 ? pendingToolHints : undefined;
      setPendingAttachments([]);
      setPendingToolHints([]);
      const workflowPreference = pendingWorkflowPreference;
      setPendingWorkflowPreference(null);
      void sendPrompt(initialPrompt, {
        attachments: payloadAttachments,
        toolHints: payloadTools,
        workflowPreference,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);

  return (
    <div className="w-96 border-l border-border bg-sidebar flex flex-col">
      {/* Header */}
      <div className="h-14 border-b border-border px-4 flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <div>
          <h3 className="font-semibold text-sm">AI Assistant</h3>
          <p className="text-xs text-muted-foreground">Build with prompts</p>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        <div ref={scrollRef} className="space-y-4">
          {!historyLoaded && (
            <div className="flex gap-3">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="bg-primary">
                  <Bot className="w-4 h-4" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 rounded-lg px-4 py-3 bg-card border border-border">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            </div>
          )}
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${
                message.role === "user" ? "flex-row-reverse" : "flex-row"
              }`}
            >
              <Avatar className="w-8 h-8 flex-shrink-0">
                <AvatarFallback className={message.role === "assistant" ? "bg-primary" : "bg-accent"}>
                  {message.role === "assistant" ? (
                    <Bot className="w-4 h-4" />
                  ) : (
                    <User className="w-4 h-4" />
                  )}
                </AvatarFallback>
              </Avatar>

              <div
                className={`flex-1 rounded-lg px-4 py-2 ${
                  message.role === "user"
                    ? "bg-primary text-primary-foreground ml-12"
                    : "bg-card border border-border mr-12"
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                <span className="text-xs opacity-50 mt-1 block">
                  {message.timestamp.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>
          ))}

        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t border-border p-4 space-y-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe the agents you want to create..."
          className="min-h-[80px] resize-none"
          disabled={isProcessing}
        />
        <Button
          onClick={handleSend}
          disabled={!input.trim() || isProcessing}
          className="w-full"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Building...
            </>
          ) : (
            <>
              <Send className="w-4 h-4 mr-2" />
              Send
            </>
          )}
        </Button>
      </div>
    </div>
  );
};



