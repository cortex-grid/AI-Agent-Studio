
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Clock, Settings, Search, BoxIcon, Sparkles } from "lucide-react";

export interface ChatHistory {
  id: string;
  title: string;
  preview: string;
  date: string;
}

interface ChatSidebarProps {
  history: ChatHistory[];
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  className?: string;
  selectedChatId?: string;
}

export function ChatSidebar({
  history,
  onSelectChat,
  onNewChat,
  className,
  selectedChatId,
}: ChatSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (isCollapsed) {
    return (
      <div className="h-full flex flex-col bg-[#202123] w-16 border-r border-gray-800">
        <div className="flex-1 flex flex-col items-center gap-2 py-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsCollapsed(false)}
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
              className="h-6 w-6"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </Button>
          <Button
            onClick={onNewChat}
            variant="outline"
            size="icon"
            className="mt-2 bg-transparent text-white border border-gray-700 hover:bg-gray-800"
          >
            <Plus className="h-5 w-5" />
            <span className="sr-only">New Chat</span>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-full flex flex-col bg-[#202123] ${className} w-[260px]`}>
      <div className="p-2">
        <Button
          onClick={onNewChat}
          variant="outline"
          className="w-full justify-start gap-2 bg-transparent text-white border border-gray-700 hover:bg-gray-800"
        >
          <Plus className="h-5 w-5" />
          <span>New chat</span>
        </Button>
      </div>
      
      <ScrollArea className="flex-1 px-2">
        <div className="space-y-6 py-2">
          <CategorySection
            title="CortexGrid Agents"
            icon={<Sparkles className="h-4 w-4" />}
            items={[
              { id: 'agents-main', title: 'CortexGrid Agent', onClick: () => {} },
            ]}
          />

          <CategorySection
            title="Projects"
            icon={<BoxIcon className="h-4 w-4" />}
            items={[
              { id: 'new-project', title: 'New project', onClick: () => {}, icon: <Plus className="h-4 w-4 text-gray-400" /> },
            ]}
          />

          <CategorySection
            title="Yesterday"
            icon={<Clock className="h-4 w-4" />}
            items={[
              { id: 'nlp-explanation', title: 'NLP Explanation', onClick: () => {} },
              { id: 'what-is-nlp', title: 'What is NLP', onClick: () => {} },
            ]}
          />

          <CategorySection
            title="Previous 7 Days"
            icon={<Clock className="h-4 w-4" />}
            items={[
              { id: 'muscle-gain', title: 'Muscle Gain Plan', onClick: () => {} },
            ]}
          />
        </div>
      </ScrollArea>
      
      <div className="p-2 border-t border-gray-800">
        <Button
          variant="ghost" 
          className="w-full justify-start text-sm text-gray-300 hover:bg-gray-800"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="mr-2">
            <path d="M15 5L15 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path>
            <path d="M9 15L15 19L21 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path>
            <path d="M3 5H9V13C9 13.5523 9.44772 14 10 14H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path>
          </svg>
          View plans
          <span className="ml-auto text-xs bg-gray-700 px-1.5 py-0.5 rounded">New</span>
        </Button>
      </div>
    </div>
  );
}

interface CategorySectionProps {
  title: string;
  icon: React.ReactNode;
  items: {
    id: string;
    title: string;
    onClick: () => void;
    icon?: React.ReactNode;
    count?: number;
    truncate?: boolean;
  }[];
}

function CategorySection({ title, icon, items }: CategorySectionProps) {
  return (
    <div className="space-y-1">
      <h3 className="flex items-center gap-2 text-xs font-medium text-gray-500 px-2">
        {icon}
        {title}
      </h3>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <Button
              variant="ghost"
              onClick={item.onClick}
              className="w-full justify-start text-sm text-gray-300 hover:bg-gray-800"
            >
              {item.icon || <div className="w-4 h-4 mr-2 rounded-full bg-gray-300"></div>}
              <span className={item.truncate ? "truncate" : ""}>{item.title}</span>
              {item.count && (
                <span className="ml-auto text-xs text-gray-500">{item.count}</span>
              )}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
