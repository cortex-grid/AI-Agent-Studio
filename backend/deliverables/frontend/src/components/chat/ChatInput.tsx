
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useState, useRef, KeyboardEvent } from "react";
import { Send, Plus, Search, ImageIcon, Mic, MoreHorizontal } from "lucide-react";
import { ModeToggle } from "./ModeToggle";

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ 
  onSendMessage, 
  disabled = false,
  placeholder = "Ask anything"
}: ChatInputProps) {
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSendMessage = () => {
    if (message.trim() && !disabled) {
      onSendMessage(message.trim());
      setMessage("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  };

  return (
    <div className="w-full mx-auto max-w-3xl mb-4 px-4">
      <div className="flex flex-col gap-3">
        <div className="relative flex w-full items-center">
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className="min-h-[50px] max-h-[200px] pr-16 py-3 pl-10 resize-none rounded-xl border border-gray-700 bg-[#40414f]/30 text-white"
            rows={1}
          />
          
          <div className="absolute left-3 top-3">
            <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-400">
              <Plus className="h-5 w-5" />
            </Button>
          </div>
          
          <div className="absolute right-2 bottom-1.5 flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="text-gray-400 hover:text-gray-200 h-8 w-8 rounded-lg"
              title="Search"
            >
              <Search className="h-4 w-4" />
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              className="text-gray-400 hover:text-gray-200 h-8 w-8 rounded-lg"
              title="Deep research"
            >
              <div className="flex items-center">
                <Search className="h-4 w-4" />
                <span className="text-xs ml-0.5">+</span>
              </div>
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              className="text-gray-400 hover:text-gray-200 h-8 w-8 rounded-lg"
              title="Create image"
            >
              <ImageIcon className="h-4 w-4" />
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              className="text-gray-400 hover:text-gray-200 h-8 w-8 rounded-lg"
              title="More options"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              className="text-gray-400 hover:text-gray-200 h-8 w-8 rounded-lg"
              title="Voice input"
            >
              <Mic className="h-4 w-4" />
            </Button>
            
            <Button
              size="icon"
              type="submit"
              onClick={handleSendMessage}
              disabled={!message.trim() || disabled}
              className={`bg-blue-600 text-white h-8 w-8 rounded-lg hover:bg-blue-700 ${!message.trim() && "opacity-50"}`}
            >
              <Send className="h-4 w-4" />
              <span className="sr-only">Send message</span>
            </Button>
          </div>
        </div>
        
        <div className="text-center text-xs text-gray-500">
          Agents can make mistakes. Consider checking important information.
        </div>
      </div>
    </div>
  );
}
