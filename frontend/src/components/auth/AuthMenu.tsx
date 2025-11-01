import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Mail, Github, LogOut, UserRound, Loader2 } from "lucide-react";

export const AuthMenu = () => {
  const { user, loading, signInWithGithub, signInWithAzure, signInWithEmail, signOut, isConfigured } = useAuth();
  const [email, setEmail] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  if (!isConfigured) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <UserRound className="h-4 w-4" />
        <span>Auth not configured</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading...</span>
      </div>
    );
  }

  if (user) {
    return (
      <div className="flex items-center gap-3">
        <Avatar className="h-9 w-9">
          <AvatarFallback className="bg-primary text-primary-foreground">
            {user.email?.[0]?.toUpperCase() ?? "U"}
          </AvatarFallback>
        </Avatar>
        <div className="hidden md:flex flex-col text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{user.user_metadata?.full_name ?? user.email}</span>
          <span>{user.email}</span>
        </div>
        <Button variant="outline" size="sm" onClick={() => void signOut()}>
          <LogOut className="h-4 w-4 mr-2" />
          Sign out
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => void signInWithGithub()}>
        <Github className="h-4 w-4 mr-2" />
        GitHub
      </Button>
      <Button variant="outline" size="sm" onClick={() => void signInWithAzure()}>
        <UserRound className="h-4 w-4 mr-2" />
        Microsoft
      </Button>
      <form
        className="flex items-center gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!email) return;
          try {
            setSendingEmail(true);
            await signInWithEmail(email);
          } finally {
            setSendingEmail(false);
          }
        }}
      >
        <div className="relative">
          <Mail className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="email"
            required
            className="pl-9 pr-3 py-1 rounded-md border border-border bg-muted/50 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <Button variant="secondary" size="sm" type="submit" disabled={sendingEmail}>
          {sendingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : "Magic link"}
        </Button>
      </form>
    </div>
  );
};
