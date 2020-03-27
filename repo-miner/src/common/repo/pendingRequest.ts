import { RateLimitType } from "./rateLimit.model";

export class PendingRequest {
  url: string;
  rateLimitType: RateLimitType

  constructor(url: string, rateLimitType: RateLimitType) {
    this.url = url;
    this.rateLimitType = rateLimitType;
  }
}