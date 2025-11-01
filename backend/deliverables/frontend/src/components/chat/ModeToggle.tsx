
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, FileText, Globe } from "lucide-react";

type Mode = "assistant" | "creative" | "precise" | "web-search" | "upload" | "deep-research";

interface ModeOption {
  id: Mode;
  name: string;
  icon: React.ElementType;
  description: string;
}

const modes: ModeOption[] = [
  {
    id: "assistant",
    name: "GPT-4",
    icon: Sparkles,
    description: "Our most capable model for general-purpose chat and creative tasks."
  },
  {
    id: "precise",
    name: "GPT-4o mini high",
    icon: Sparkles,
    description: "Our most technically capable model for complex tasks."
  },
  {
    id: "creative",
    name: "GPT-4o",
    icon: Sparkles,
    description: "Our most innovative and creative model."
  },
  {
    id: "web-search",
    name: "Web Search",
    icon: Globe,
    description: "Search the web for up-to-date information."
  },
  {
    id: "upload",
    name: "Upload",
    icon: FileText,
    description: "Upload documents for analysis."
  }
];

export function ModeToggle() {
  const [selectedMode, setSelectedMode] = React.useState<Mode>("precise");
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="flex justify-center">
      <div className="inline-flex items-center gap-1 p-1 rounded-xl">
        {!expanded ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(true)}
              className="text-sm font-medium flex items-center gap-1 py-1 px-3 text-gray-300"
            >
              <Sparkles className="h-4 w-4 text-gray-400" />
              <span>ChatGPT o4-mini-high</span>
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="16" 
                height="16" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
                className="h-4 w-4 ml-1"
              >
                <path d="m6 9 6 6 6-6"/>
              </svg>
            </Button>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-1 p-1">
            {modes.map((mode) => (
              <Button
                key={mode.id}
                variant={selectedMode === mode.id ? "default" : "ghost"}
                size="sm"
                onClick={() => {
                  setSelectedMode(mode.id);
                  setExpanded(false);
                }}
                className={`text-sm px-3 py-1 flex items-center gap-1 ${
                  selectedMode === mode.id
                    ? "bg-gray-700 text-white"
                    : "text-gray-300"
                }`}
              >
                <mode.icon className="h-4 w-4" />
                <span>{mode.name}</span>
              </Button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(false)}
              className="text-gray-300 px-2"
            >
              ✕
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
