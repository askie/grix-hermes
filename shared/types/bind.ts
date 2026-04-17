export interface BindRequest {
  profileName: string;
  agentName: string;
  agentId: string;
  apiEndpoint: string;
  apiKey: string;
  isMain: boolean;
  accountId?: string;
  allowedUsers?: string[];
  allowAllUsers?: boolean;
  homeChannel?: string;
  homeChannelName?: string;
  installDir?: string;
  cloneFrom?: string;
  hermesBin?: string;
  nodeBin?: string;
  dryRun?: boolean;
}

export interface BindResult {
  profile_name: string;
  profile_dir: string;
  env_path: string;
  config_path: string;
  install_dir: string;
  is_main: boolean;
  env_values: Record<string, string>;
  config_changed: boolean;
  profile_created: boolean;
  dry_run: boolean;
}

export interface GrixAgentCreationResult {
  profile_name: string;
  agent_name: string;
  agent_id: string;
  api_endpoint: string;
  api_key: string;
  is_main: boolean;
  account_id?: string;
  avatar_url?: string;
  raw?: unknown;
}
