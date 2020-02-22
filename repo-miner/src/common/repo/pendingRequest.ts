import { Subject } from "rxjs";

export class PendingRequest {
  url: string;
  subscription: Subject<any>;

  constructor(url: string, subscription: Subject<any>) {
    this.url = url;
    this.subscription = subscription;
  }
}