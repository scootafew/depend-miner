export interface GithubRateLimit {
  limit: number;
  remaining: number;
  reset: number;
}

export interface GithubResourceRateLimits {
  core: GithubRateLimit;
  search: GithubRateLimit;
  graphql: GithubRateLimit;
  integration_manifest: GithubRateLimit;
}

export interface GithubRateLimitResponse {
  rate: GithubRateLimit;
  resources: GithubResourceRateLimits;
}

export enum RateLimitType {
  Core = "core",
  Search = "search"
}