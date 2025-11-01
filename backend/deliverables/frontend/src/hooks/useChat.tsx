
import { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Message, Chat } from '@/types/chat';

const API_URL = (import.meta.env.VITE_API_URL as string) || 'http://localhost:8000';

const initialMessages: Message[] = [
  {
    id: uuidv4(),
    content: "I'm CortexGrid Agent, a platform to comunicate with Microsoft Agent Framework Agents by CortexGrid. How can I help you today?",
    role: "assistant",
    createdAt: new Date(),
  },
];

const initialChats: Chat[] = [
  {
    id: uuidv4(),
    title: "Welcome to CortexGrid Agent",
    messages: initialMessages,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

export function useChat() {
  const [chats, setChats] = useState<Chat[]>(initialChats);
  const [currentChatId, setCurrentChatId] = useState<string>(initialChats[0].id);
  const [isProcessing, setIsProcessing] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState<{id: string, content: string} | null>(null);
  const [threadMap, setThreadMap] = useState<Record<string, string | null>>({});

  const currentChat = chats.find(chat => chat.id === currentChatId) || chats[0];
  
  const addMessage = useCallback((content: string, role: "user" | "assistant" | "system", meta?: { thread_id?: string | null; agent_used?: string | null }) => {
    const newMessage: Message = {
      id: uuidv4(),
      content,
      role,
      createdAt: new Date(),
      thread_id: meta?.thread_id ?? undefined,
      agent_used: meta?.agent_used ?? undefined,
    };
    
    setChats(prevChats => 
      prevChats.map(chat => 
        chat.id === currentChatId 
          ? {
              ...chat,
              messages: [...chat.messages, newMessage],
              updatedAt: new Date(),
              // If it's the first user message, set the title based on the message
              title: chat.messages.filter(m => m.role === "user").length === 0 && role === "user"
                ? content.slice(0, 30) + (content.length > 30 ? "..." : "")
                : chat.title
            }
          : chat
      )
    );
    
    return newMessage.id;
  }, [currentChatId]);
  
  const sendMessage = useCallback(async (
    userMessage: string,
    options?: { thread_id?: string | null; target_agent?: string | null }
  ) => {
    setIsProcessing(true);

    // Add user message locally immediately
    addMessage(userMessage, 'user');

    // Start streaming placeholder
    const responseId = uuidv4();
    setStreamingMessage({ id: responseId, content: '' });

    try {
  const payload: any = { message: userMessage };
  // prefer explicit thread_id in options, otherwise use stored thread id for current chat
  const effectiveThreadId = options?.thread_id ?? threadMap[currentChatId] ?? null;
  if (effectiveThreadId) payload.thread_id = effectiveThreadId;
      if (options?.target_agent) payload.target_agent = options.target_agent;

      const res = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Chat API error: ${res.status} ${text}`);
      }

      const data = await res.json();

      // data: { response: string, thread_id?: string, agent_used?: string }
      const assistantContent = data.response || 'No response';

      // Simulate a quick streaming effect by revealing the response in chunks
      const chars = assistantContent.split('');
      for (let i = 0; i < chars.length; i++) {
        // small delay to give user streaming feel
        // keep delays small so UI remains snappy
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 6));
        setStreamingMessage((prev) => ({
          id: responseId,
          content: prev ? prev.content + chars[i] : chars[i],
        }));
      }

      // After streaming complete, add assistant message
        addMessage(assistantContent, 'assistant', { thread_id: data.thread_id, agent_used: data.agent_used });

      // Persist thread_id returned by backend for this chat so follow-ups continue the thread
      if (data.thread_id) {
        setThreadMap(prev => ({ ...prev, [currentChatId]: data.thread_id }));
      }
      // Return API response to caller for further use
      return {
        thread_id: data.thread_id,
        agent_used: data.agent_used,
        response: assistantContent,
      };
    } catch (err) {
      // On error, show a simple assistant message indicating failure
      const errMsg = (err as Error).message || 'Failed to contact chat backend.';
      setStreamingMessage(null);
  addMessage(`Error: ${errMsg}`, 'assistant');
      throw err;
    } finally {
      setStreamingMessage(null);
      setIsProcessing(false);
    }
  }, [addMessage, threadMap, currentChatId, setThreadMap]);

  // Helper to get agents list
  const fetchAgents = useCallback(async () => {
    const res = await fetch(`${API_URL}/api/agents`);
    if (!res.ok) throw new Error('Failed to fetch agents');
    return res.json();
  }, []);

  const fetchHealth = useCallback(async () => {
    const res = await fetch(`${API_URL}/api/health`);
    if (!res.ok) throw new Error('Health check failed');
    return res.json();
  }, []);
  
  const createNewChat = useCallback(() => {
    const newChatId = uuidv4();
    
    const welcomeMessage: Message = {
      id: uuidv4(),
      content: "I'm CortexGrid Agent, a platform to comunicate with Microsoft Agent Framework Agents by CortexGrid. How can I help you today?",
      role: "assistant",
      createdAt: new Date(),
    };
    
    const newChat: Chat = {
      id: newChatId,
      title: "New Chat",
      messages: [welcomeMessage],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    setChats(prevChats => [...prevChats, newChat]);
    setCurrentChatId(newChatId);
    return newChatId;
  }, []);
  
  const switchChat = useCallback((chatId: string) => {
    setCurrentChatId(chatId);
  }, []);
  
  const getChatHistory = useCallback(() => {
    return chats.map(chat => ({
      id: chat.id,
      title: chat.title,
      preview: chat.messages
        .filter(m => m.role === "assistant")
        .pop()?.content.slice(0, 50) + "...",
      date: chat.updatedAt.toLocaleDateString(),
    }));
  }, [chats]);
  
  return {
    currentChat,
    currentChatMessages: currentChat.messages,
    isProcessing,
    streamingMessage,
    sendMessage,
    fetchAgents,
    fetchHealth,
    createNewChat,
    switchChat,
    chatHistory: getChatHistory(),
  };
}
