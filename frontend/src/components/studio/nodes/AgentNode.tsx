import { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Bot, Brain, Crown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const OpenAIIcon = () => (
  <svg width="14" height="14" viewBox="0 0 320 320" fill="none" xmlns="http://www.w3.org/2000/svg" className="inline-block mr-1">
    <path d="m297.06 130.97c7.26-21.79 4.76-45.66-6.85-65.48-17.46-30.4-52.56-46.04-86.84-38.68-15.25-17.18-37.16-26.95-60.13-26.81-35.04-.08-66.13 22.48-76.91 55.82-22.51 4.61-41.94 18.7-53.31 38.67-17.59 30.32-13.58 68.54 9.92 94.54-7.26 21.79-4.76 45.66 6.85 65.48 17.46 30.4 52.56 46.04 86.84 38.68 15.24 17.18 37.16 26.95 60.13 26.8 35.06.09 66.16-22.49 76.94-55.86 22.51-4.61 41.94-18.7 53.31-38.67 17.57-30.32 13.55-68.51-9.94-94.51zm-120.28 168.11c-14.03.02-27.62-4.89-38.39-13.88.49-.26 1.34-.73 1.89-1.07l63.72-36.8c3.26-1.85 5.26-5.32 5.24-9.07v-89.83l26.93 15.55c.29.14.48.42.52.74v74.39c-.04 33.08-26.83 59.9-59.91 59.97zm-128.84-55.03c-7.03-12.14-9.56-26.37-7.15-40.18.47.28 1.3.79 1.89 1.13l63.72 36.8c3.23 1.89 7.23 1.89 10.47 0l77.79-44.92v31.1c.02.32-.13.63-.38.83l-64.41 37.19c-28.69 16.52-65.33 6.7-81.92-21.95zm-16.77-139.09c7-12.16 18.05-21.46 31.21-26.29 0 .55-.03 1.52-.03 2.2v73.61c-.02 3.74 1.98 7.21 5.23 9.06l77.79 44.91-26.93 15.55c-.27.18-.61.21-.91.08l-64.42-37.22c-28.63-16.58-38.45-53.21-21.95-81.89zm221.26 51.49-77.79-44.92 26.93-15.54c.27-.18.61-.21.91-.08l64.42 37.19c28.68 16.57 38.51 53.26 21.94 81.94-7.01 12.14-18.05 21.44-31.2 26.28v-75.81c.03-3.74-1.96-7.2-5.2-9.06zm26.8-40.34c-.47-.29-1.3-.79-1.89-1.13l-63.72-36.8c-3.23-1.89-7.23-1.89-10.47 0l-77.79 44.92v-31.1c-.02-.32.13-.63.38-.83l64.41-37.16c28.69-16.55 65.37-6.7 81.91 22 6.99 12.12 9.52 26.31 7.15 40.1zm-168.51 55.43-26.94-15.55c-.29-.14-.48-.42-.52-.74v-74.39c.02-33.12 26.89-59.96 60.01-59.94 14.01 0 27.57 4.92 38.34 13.88-.49.26-1.33.73-1.89 1.07l-63.72 36.8c-3.26 1.85-5.26 5.31-5.24 9.06l-.04 89.79zm14.63-31.54 34.65-20.01 34.65 20v40.01l-34.65 20-34.65-20z" fill="#6366F1"/>
  </svg>
);

const AzureIcon = () => (
<svg xmlns="http://www.w3.org/2000/svg" id="uuid-6b8380c3-0ee5-4c44-92a2-f185c82db6ba" width="18" height="18" viewBox="0 0 18 18"><defs><linearGradient id="uuid-05876c72-8f26-40da-996e-a488172ec072" x1="-603.563" y1="-218.378" x2="-606.6" y2="-206.22" gradientTransform="translate(617.126 -205.758) scale(1 -1)" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#712575"/><stop offset=".09" stop-color="#9a2884"/><stop offset=".18" stop-color="#bf2c92"/><stop offset=".27" stop-color="#da2e9c"/><stop offset=".34" stop-color="#eb30a2"/><stop offset=".4" stop-color="#f131a5"/><stop offset=".5" stop-color="#ec30a3"/><stop offset=".61" stop-color="#df2f9e"/><stop offset=".72" stop-color="#c92d96"/><stop offset=".83" stop-color="#aa2a8a"/><stop offset=".95" stop-color="#83267c"/><stop offset="1" stop-color="#712575"/></linearGradient><linearGradient id="uuid-c4a2f627-d730-447e-9152-62009c64c361" x1="-602.412" y1="-206.025" x2="-602.412" y2="-223.175" gradientTransform="translate(617.126 -205.758) scale(1 -1)" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#da7ed0"/><stop offset=".08" stop-color="#b17bd5"/><stop offset=".19" stop-color="#8778db"/><stop offset=".3" stop-color="#6276e1"/><stop offset=".41" stop-color="#4574e5"/><stop offset=".54" stop-color="#2e72e8"/><stop offset=".67" stop-color="#1d71eb"/><stop offset=".81" stop-color="#1471ec"/><stop offset="1" stop-color="#1171ed"/></linearGradient><linearGradient id="uuid-5a4cf215-4932-4f12-8af1-1b6833df259c" x1="-603.438" y1="-206.414" x2="-614.807" y2="-224.644" gradientTransform="translate(617.126 -205.758) scale(1 -1)" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#da7ed0"/><stop offset=".05" stop-color="#b77bd4"/><stop offset=".11" stop-color="#9079da"/><stop offset=".18" stop-color="#6e77df"/><stop offset=".25" stop-color="#5175e3"/><stop offset=".33" stop-color="#3973e7"/><stop offset=".42" stop-color="#2772e9"/><stop offset=".54" stop-color="#1a71eb"/><stop offset=".68" stop-color="#1371ec"/><stop offset="1" stop-color="#1171ed"/></linearGradient></defs><path d="m12.061.012c.534,0,1.008.401,1.178.984s1.166,4.19,1.166,4.19v7.166h-3.607l.073-12.352h1.19v.012Z" fill="url(#uuid-05876c72-8f26-40da-996e-a488172ec072)" fill-rule="evenodd" stroke-width="0"/><path d="m17.356,5.611c0-.255-.206-.449-.449-.449h-2.126c-1.494,0-2.709,1.215-2.709,2.709v4.494h2.575c1.494,0,2.709-1.215,2.709-2.709v-4.045Z" fill="url(#uuid-c4a2f627-d730-447e-9152-62009c64c361)" stroke-width="0"/><path d="m12.061.012c-.413,0-.741.328-.741.741l-.073,13.64c0,1.992-1.615,3.607-3.607,3.607H1.093c-.316,0-.522-.304-.425-.595L5.915,2.429C6.425.984,7.785.012,9.316.012h2.757-.012Z" fill="url(#uuid-5a4cf215-4932-4f12-8af1-1b6833df259c)" fill-rule="evenodd" stroke-width="0"/></svg>
);

export const AgentNode = memo(({ data, selected }: NodeProps) => {
  const isTeamManager = data.kind === "teamManager" || data.subtype === "team-manager";
  const isTeamDirector = data.kind === "teamDirector" || data.subtype === "team-director";
  const Icon = isTeamDirector ? Crown : isTeamManager ? Brain : Bot;
  const roleBadge = isTeamDirector ? "Team Director" : isTeamManager ? "Team Manager" : null;
  const provider = (data?.provider as string) || "openai";

  // Choose shape classes based on node kind
  // Team Director uses a distinct pill with square-ish corners (rounded-2xl) to differentiate from the
  // fully-rounded Team Manager pill.
  const baseShapeClass = isTeamDirector
    ? "rounded-2xl min-w-[260px] px-6 py-3"
    : isTeamManager
    ? "rounded-full min-w-[220px] px-4 py-2"
    : "rounded-lg min-w-[200px]";

  // Border / selection styling: give Team Director a distinctive amber accent
  const borderClass = selected
    ? "border-primary shadow-glow"
    : isTeamDirector
    ? "border-amber-300 hover:border-amber-400"
    : provider === "azure"
    ? "border-sky-400 hover:border-sky-500"
    : "border-border hover:border-primary/50";

  return (
    <Card
      className={`${baseShapeClass} bg-card border-2 transition-all ${borderClass} ${isTeamDirector ? "relative" : ""}`}
    >
      {isTeamDirector && (
        // left accent stripe to visually distinguish Team Director
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-400 rounded-l-md" />
      )}
      <Handle 
        type="target" 
        position={Position.Top}
        className="w-3 h-3 !bg-primary"
      />
      
  <div className={isTeamManager || isTeamDirector ? (isTeamDirector ? "py-2 pr-6 pl-6" : "py-2 pr-6 pl-4") : "p-4"}>
        <div className={`flex items-start gap-3 ${isTeamManager || isTeamDirector ? "items-center" : "mb-3"}`}>
          {/** Icon wrapper: make Team Director visually distinct (larger square badge) */}
          {(() => {
            const iconWrapperClass = isTeamDirector ? "w-12 h-12 rounded-lg" : isTeamManager ? "w-10 h-10 rounded-full" : "w-10 h-10 rounded-lg";
            const iconBgClass = isTeamDirector ? "bg-amber-100 text-amber-600" : isTeamManager ? "bg-secondary/20 text-secondary" : "bg-primary/20 text-primary";
            const iconSizeClass = isTeamDirector ? "w-6 h-6" : "w-5 h-5";
            return (
              <div className={`${iconWrapperClass} flex items-center justify-center flex-shrink-0 ${iconBgClass}`}>
                <Icon className={iconSizeClass + (isTeamDirector ? " text-amber-600" : isTeamManager ? " text-secondary" : " text-primary")} />
              </div>
            );
          })()}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm mb-1">{data.label}</h3>
            <div className="flex items-center gap-2 flex-wrap">
              {roleBadge && (
                <Badge variant="secondary" className="text-[10px] uppercase tracking-wide bg-muted text-muted-foreground border-muted">
                  {roleBadge}
                </Badge>
              )}
              {data.model && (
                <Badge variant="outline" className="text-xs">
                  {data.model}
                </Badge>
              )}

              {/* Provider badge to visually indicate Azure vs OpenAI */}
              <Badge
                variant="outline"
                className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center ${
                  provider === "azure" ? "bg-sky-100 text-sky-700 border-sky-200" : "bg-indigo-100 text-indigo-700 border-indigo-200"
                }`}
              >
                {provider === "azure" ? <AzureIcon /> : <OpenAIIcon />}
                <span className="whitespace-nowrap">{provider === "azure" ? "Azure" : "OpenAI"}</span>
              </Badge>
            </div>
          </div>
        </div>
        
        {data.description && !(isTeamManager || isTeamDirector) && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {data.description}
          </p>
        )}
      </div>

      <Handle 
        type="source" 
        position={Position.Bottom}
        className="w-3 h-3 !bg-primary"
      />
    </Card>
  );
});

AgentNode.displayName = "AgentNode";
