import type { Project, EvaluationScenario } from "@/lib/api";
import { supabase } from "@/lib/supabaseClient";

export const isSupabaseAvailable = () => Boolean(supabase);

export interface StoredProjectSummary {
  id: string;
  name: string;
  updated_at: string;
  thumbnail_url?: string | null;
  project_json?: Project;
}

const canUseLocalStorage = () => typeof window !== "undefined" && !!window.localStorage;
const readFromLocalStorage = <T,>(key: string): Record<string, T> => {
  if (!canUseLocalStorage()) return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, T>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.error(`Failed to parse ${key} from localStorage`, error);
    return {};
  }
};

const writeToLocalStorage = <T,>(key: string, value: Record<string, T>) => {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Failed to persist ${key} to localStorage`, error);
  }
};

const getLocalBucketKey = (bucket: string, userId: string) => `${bucket}:${userId || "anonymous"}`;
const getProjectScopedKey = (bucket: string, userId: string, projectId: string) =>
  `${bucket}:${userId || "anonymous"}:${projectId}`;

export const fetchProjectsForUser = async (userId: string): Promise<StoredProjectSummary[]> => {
  if (supabase) {
    const { data, error } = await supabase
      .from("projects")
      .select("id, name, updated_at, thumbnail_url")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch projects", error);
      return [];
    }

    return data ?? [];
  }

  const bucketKey = getLocalBucketKey("projects", userId);
  const userProjects = readFromLocalStorage<Project>(bucketKey);

  return Object.entries(userProjects).map(([id, project]) => ({
    id,
    name: project.name,
    updated_at: project.settings?.updatedAt ?? new Date().toISOString(),
    project_json: project,
  }));
};

export const saveProjectForUser = async (userId: string, project: Project) => {
  const timestamp = new Date().toISOString();
  const projectWithMeta: Project = {
    ...project,
    settings: {
      ...project.settings,
      updatedAt: timestamp,
    },
  };

  if (supabase) {
    const payload = {
      id: project.id,
      user_id: userId,
      name: project.name,
      project_json: projectWithMeta,
      updated_at: timestamp,
    };
    const { error } = await supabase.from("projects").upsert(payload, { onConflict: "id" });
    if (error) {
      console.error("Failed to persist project", error);
    }
    return;
  }

  const bucketKey = getLocalBucketKey("projects", userId);
  const projects = readFromLocalStorage<Project>(bucketKey);
  projects[project.id] = projectWithMeta;
  writeToLocalStorage(bucketKey, projects);
};

export interface StoredEvaluationSummary {
  id: string;
  name: string;
  updated_at: string;
  target_agent: string;
  description?: string;
}

export const fetchEvaluationScenariosForUser = async (userId: string): Promise<StoredEvaluationSummary[]> => {
  type SupabaseEvaluationRow = {
    id: string;
    name: string;
    updated_at: string;
    scenario_json?: EvaluationScenario | null;
  };

  if (supabase) {
    const { data, error } = await supabase
      .from("evaluation_scenarios")
      .select("id, name, updated_at, scenario_json")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch scenarios", error);
      return [];
    }
    return (data ?? []).map((entry: SupabaseEvaluationRow) => ({
      id: entry.id,
      name: entry.name,
      updated_at: entry.updated_at,
      target_agent: entry.scenario_json?.target_agent ?? "team",
      description: entry.scenario_json?.description,
    }));
  }

  const bucketKey = getLocalBucketKey("evaluations", userId);
  const scenarios = readFromLocalStorage<EvaluationScenario>(bucketKey);
  return Object.values(scenarios).map((scenario) => ({
    id: scenario.id,
    name: scenario.name,
    updated_at: scenario.updated_at,
    target_agent: scenario.target_agent ?? "team",
    description: scenario.description,
  }));
};

export const saveEvaluationScenarioForUser = async (userId: string, scenario: EvaluationScenario) => {
  if (supabase) {
    const payload = {
      id: scenario.id,
      user_id: userId,
      name: scenario.name,
      scenario_json: scenario,
      updated_at: scenario.updated_at ?? new Date().toISOString(),
    };
    const { error } = await supabase.from("evaluation_scenarios").upsert(payload, { onConflict: "id" });
    if (error) {
      console.error("Failed to persist evaluation scenario", error);
    }
    return;
  }

  const bucketKey = getLocalBucketKey("evaluations", userId);
  const scenarios = readFromLocalStorage<EvaluationScenario>(bucketKey);
  scenarios[scenario.id] = scenario;
  writeToLocalStorage(bucketKey, scenarios);
};

export const loadProjectById = async (projectId: string) => {
  if (supabase) {
    const { data, error } = await supabase
      .from("projects")
      .select("project_json")
      .eq("id", projectId)
      .single();

    if (error) {
      console.error("Failed to load project", error);
      return null;
    }

    return (data?.project_json ?? null) as Project | null;
  }

  // If Supabase is unavailable, try local buckets (iterate through all)
  const allBuckets = canUseLocalStorage()
    ? Object.keys(window.localStorage).filter((key) => key.startsWith("projects:"))
    : [];
  for (const key of allBuckets) {
    const projects = readFromLocalStorage<Project>(key);
    const match = projects[projectId];
    if (match) return match;
  }

  return null;
};

export const deleteEvaluationScenarioForUser = async (userId: string, scenarioId: string) => {
  if (supabase) {
    const { error } = await supabase
      .from("evaluation_scenarios")
      .delete()
      .eq("user_id", userId)
      .eq("id", scenarioId);
    if (error) {
      console.error("Failed to delete evaluation scenario", error);
    }
    return;
  }

  const bucketKey = getLocalBucketKey("evaluations", userId);
  const scenarios = readFromLocalStorage<EvaluationScenario>(bucketKey);
  if (scenarioId in scenarios) {
    delete scenarios[scenarioId];
    writeToLocalStorage(bucketKey, scenarios);
  }
};

export const deleteProjectForUser = async (userId: string, projectId: string) => {
  if (supabase) {
    const { error } = await supabase
      .from("projects")
      .delete()
      .eq("user_id", userId)
      .eq("id", projectId);
    if (error) {
      console.error("Failed to delete project", error);
    }
    return;
  }

  const bucketKey = getLocalBucketKey("projects", userId);
  const projects = readFromLocalStorage<Project>(bucketKey);
  if (projectId in projects) {
    delete projects[projectId];
    writeToLocalStorage(bucketKey, projects);
  }
};

export interface StoredConversationMessage {
  id: string;
  project_id: string;
  user_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
  metadata?: Record<string, unknown> | null;
}

const MAX_LOCAL_CONVERSATION = 50;

export const fetchProjectConversation = async (
  userId: string,
  projectId: string,
  limit = 20
): Promise<StoredConversationMessage[]> => {
  if (supabase && userId !== "anonymous") {
    const { data, error } = await supabase
      .from("project_messages")
      .select("id, role, content, created_at, metadata, user_id, project_id")
      .eq("user_id", userId)
      .eq("project_id", projectId)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error) {
      console.error("Failed to fetch project conversation", error);
      return [];
    }

    return (data ?? []) as StoredConversationMessage[];
  }

  const bucketKey = getProjectScopedKey("conversation", userId, projectId);
  const stored = readFromLocalStorage<StoredConversationMessage>(bucketKey);
  const messages = Object.values(stored).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  if (limit > 0 && messages.length > limit) {
    return messages.slice(messages.length - limit);
  }
  return messages;
};

export const appendProjectConversation = async (
  userId: string,
  projectId: string,
  message: Omit<StoredConversationMessage, "id" | "project_id" | "user_id" | "created_at"> & {
    id?: string;
    created_at?: string;
  }
) => {
  const messageId = message.id ?? (typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `msg-${Date.now()}`);
  const timestamp = message.created_at ?? new Date().toISOString();

  if (supabase && userId !== "anonymous") {
    const payload = {
      id: messageId,
      project_id: projectId,
      user_id: userId,
      role: message.role,
      content: message.content,
      metadata: message.metadata ?? null,
      created_at: timestamp,
    };

    const { error } = await supabase.from("project_messages").insert(payload);
    if (error) {
      console.error("Failed to append project conversation message", error);
    }
    return;
  }

  const bucketKey = getProjectScopedKey("conversation", userId, projectId);
  const stored = readFromLocalStorage<StoredConversationMessage>(bucketKey);
  stored[messageId] = {
    id: messageId,
    project_id: projectId,
    user_id: userId,
    role: message.role,
    content: message.content,
    created_at: timestamp,
    metadata: message.metadata ?? null,
  };

  // Trim oldest entries if we exceed cap
  const entries = Object.values(stored).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const trimmed =
    entries.length > MAX_LOCAL_CONVERSATION ? entries.slice(entries.length - MAX_LOCAL_CONVERSATION) : entries;

  const next: Record<string, StoredConversationMessage> = {};
  for (const item of trimmed) {
    next[item.id] = item;
  }

  writeToLocalStorage(bucketKey, next);
};

export const clearProjectConversation = async (userId: string, projectId: string) => {
  if (supabase && userId !== "anonymous") {
    const { error } = await supabase
      .from("project_messages")
      .delete()
      .eq("user_id", userId)
      .eq("project_id", projectId);
    if (error) {
      console.error("Failed to clear project conversation", error);
    }
    return;
  }

  const bucketKey = getProjectScopedKey("conversation", userId, projectId);
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.removeItem(bucketKey);
  } catch (error) {
    console.error("Failed to clear local conversation cache", error);
  }
};

