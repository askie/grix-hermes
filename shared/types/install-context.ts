export type InstallRoute =
  | "create_new"
  | "existing"
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
  "create_new",
  "existing",
]);

export function normalizeRoute(rawRoute: unknown): InstallRoute {
  return String(rawRoute ?? "").trim();
}

export function requiredForRoute(route: InstallRoute): string[] {
  if (route === "create_new" || route === "existing") {
    return ["install_id", "main_agent"];
  }
  return ["install_id"];
}
