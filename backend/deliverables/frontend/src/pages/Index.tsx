
import { useState, useRef, useEffect } from "react";
import { ChatSidebar } from "@/components/sidebar/ChatSidebar";
import { ChatInput } from "@/components/chat/ChatInput";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { Button } from "@/components/ui/button";
import { useChat } from "@/hooks/useChat";
import { useIsMobile } from "@/hooks/use-mobile";

const Index = () => {
  const {
    currentChat,
    currentChatMessages,
    streamingMessage,
    isProcessing,
    sendMessage,
    createNewChat,
    switchChat,
    chatHistory,
  } = useChat();
  
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  
  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentChatMessages, streamingMessage]);
  
  // On mobile, auto-close sidebar
  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [isMobile]);

  return (
    <div className="flex h-screen bg-[#343541] text-gray-100 overflow-hidden">
      {/* Sidebar */}
      {sidebarOpen && (
        <div className="h-full flex-shrink-0">
          <ChatSidebar
            history={chatHistory}
            onSelectChat={switchChat}
            onNewChat={createNewChat}
            selectedChatId={currentChat.id}
          />
        </div>
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <header className="border-b border-gray-800 py-2 px-4 flex items-center justify-between bg-[#343541]">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-gray-300"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              {sidebarOpen ? (
                <path d="M18 6L6 18M6 6l12 12" />
              ) : (
                <path d="M3 12h18M3 6h18M3 18h18" />
              )}
            </svg>
          </Button>
          <div className="flex-1 text-center font-medium text-gray-300">
            {currentChat.title}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="text-gray-300">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 4V20M12 4L8 8M12 4L16 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Button>
            <Button variant="ghost" size="icon" className="text-gray-300">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path fillRule="evenodd" clipRule="evenodd" d="M3 12C3 10.9 3.9 10 5 10C6.1 10 7 10.9 7 12C7 13.1 6.1 14 5 14C3.9 14 3 13.1 3 12ZM10 12C10 10.9 10.9 10 12 10C13.1 10 14 10.9 14 12C14 13.1 13.1 14 12 14C10.9 14 10 13.1 10 12ZM17 12C17 10.9 17.9 10 19 10C20.1 10 21 10.9 21 12C21 13.1 20.1 14 19 14C17.9 14 17 13.1 17 12Z" fill="currentColor" />
              </svg>
            </Button>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto bg-[#343541]">
          {currentChatMessages.length === 0 && !streamingMessage ? (
            <div className="h-full flex flex-col items-center justify-center">
              <h1 className="text-4xl font-bold mb-2">CortexGrid Agent</h1>
              <p className="text-gray-400 text-center max-w-md mb-8">
                What can I help with?
              </p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto">
              {currentChatMessages.map((message) => (
                <ChatMessage
                  key={message.id}
                  content={message.content}
                  role={message.role}
                  agent_used={(message as any).agent_used}
                  thread_id={(message as any).thread_id}
                />
              ))}
              
              {/* Streaming message */}
              {streamingMessage && (
                <ChatMessage
                  content={streamingMessage.content}
                  role="assistant"
                  isStreaming={true}
                />
              )}
              
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-4 bg-[#343541] border-t border-gray-800">
          <ChatInput
            onSendMessage={(msg: string) => {
              // fire-and-forget; sendMessage persists thread ids in the hook
              sendMessage(msg).catch((err) => {
                // eslint-disable-next-line no-console
                console.error('Send message failed', err);
              });
            }}
            disabled={isProcessing}
          />
        </div>
      </div>
    </div>
  );
};

export default Index;
