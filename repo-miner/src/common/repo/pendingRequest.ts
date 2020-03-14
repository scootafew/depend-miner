import { Subject } from "rxjs";
import { RateLimitType } from "./rateLimit.model";

export class PendingRequest {
  url: string;
  rateLimitType: RateLimitType
  subscription?: Subject<any>;

  constructor(url: string, rateLimitType: RateLimitType, subscription?: Subject<any>) {
    this.url = url;
    this.rateLimitType = rateLimitType;
    this.subscription = subscription ? subscription : null;
  }
}