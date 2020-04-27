import { Observable, throwError, timer } from "rxjs";
import { mergeMap, finalize } from "rxjs/operators";
import { Histogram } from "prom-client";

export const genericRetryStrategy = ({
  maxRetryAttempts = 3,
  scalingDuration = 1000,
  excludedStatusCodes = [],
  endpoint = "",
  retryMetric = null
}: {
  maxRetryAttempts?: number,
  scalingDuration?: number,
  excludedStatusCodes?: number[],
  endpoint?: string,
  retryMetric?: Histogram<any>
} = {}) => (attempts: Observable<any>) => {
  return attempts.pipe(
    mergeMap((error, i) => {
      const retryAttempt = i + 1;
      // if maximum number of retries have been met
      // or response is a status code we don't wish to retry, throw error
      if (retryAttempt > maxRetryAttempts || excludedStatusCodes.find(e => e === error.response?.status)) {
        return throwError(error);
      }

      if (retryMetric) {
        retryMetric.observe({endpoint: endpoint ? endpoint : "unknown"}, retryAttempt);
      }

      // If rate limit abuse mechanism triggered, wait longer
      if (error.response?.status == 403) {
        console.log(`Attempt ${retryAttempt}: retrying in ${retryAttempt * 18000}ms`);
        // retry after 3min, 6min, etc...
        return timer(retryAttempt * 18000);
      }

      console.log(`Attempt ${retryAttempt}: retrying in ${retryAttempt * scalingDuration}ms`);
      // retry after 1s, 2s, etc...
      return timer(retryAttempt * scalingDuration);
    }),
    finalize(() => console.log('Retry strategy complete!'))
  );
};