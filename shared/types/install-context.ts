export type InstallRoute =
  | "hermes_create_new"
  | "hermes_existing"
  | "openclaw_create_new"
  | "openclaw_existing"
  | string;

export interface InstallContextAgent {
  agent_name?: string;
  agent_id?: string;
  api_endpoint?: string;
  api_key?: string;
  profile_name?: string;
  is_main?: boolean | string;
  avatar_url?: string;
  account_id?: string;
  allowed_users?: string | string[];
  home_channel?: string;
  home_channel_name?: string;
}

export interface InstallContextInstallBlock {
  route?: InstallRoute;
  package_url?: string;
  package_path?: string;
  staging_dir?: string;
  soul_md?: string;
  soul_md_path?: string;
  hermes_home?: string;
  install_dir?: string;
  cron?: unknown;
}

export interface InstallContext {
  install_id: string;
  route?: InstallRoute;
  install_route?: InstallRoute;
  install?: InstallContextInstallBlock;
  main_agent?: InstallContextAgent;
  target_agent?: InstallContextAgent;
  session_id?: string;
  current_chat_session_id?: string;
  [key: string]: unknown;
}

export const HERMES_ROUTES = new Set<InstallRoute>([
  "hermes_create_new",
  "hermes_existing",
]);

export function normalizeRoute(rawRoute: unknown): InstallRoute {
  const route = String(rawRoute ?? "").trim();
  if (route === "openclaw_create_new") return "hermes_create_new";
  if (route === "openclaw_existing") return "hermes_existing";
  return route;
}

export function requiredForRoute(route: InstallRoute): string[] {
  if (route === "hermes_create_new" || route === "hermes_existing") {
    return ["install_id", "main_agent"];
  }
  return ["install_id"];
}
