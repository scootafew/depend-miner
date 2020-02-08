import { Injectable, HttpService } from '@nestjs/common';
import { map, catchError } from 'rxjs/operators';
import { adapters } from './repo.adapters';
import { Observable, empty } from 'rxjs';
import { Repository } from './repo.model';
import { AxiosError } from 'axios';

@Injectable()
export class RepoService {

  GITHUB_API_TOKEN = process.env.GITHUB_API_TOKEN;

  options = {
    baseURL: "https://api.github.com",
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `token ${this.GITHUB_API_TOKEN}`
    }
  }

  constructor(private readonly http: HttpService) { }

  fetchRepository(user: string, repo: string, source: string): Observable<Repository> {
    return this.http.get(`/repos/${user}/${repo}`, this.options)
      .pipe(
        map(res => adapters.get(source + "Repository").adapt(res.data)),
        catchError((err: AxiosError) => {
          if (err.response?.status == 404) {
            return empty();
          }
          throw err;
        })
      );
  }

  searchRepositories(query: string, source: string, sort?: string, order?: string): Observable<Repository> {
    return this.http.get(`/search/repositories`, {
      ...this.options,
      params: {
        'q': query,
        ...(sort ? { 'sort': sort } : {}),
        ...(order ? { 'order': order } : {}),
        'per_page': '2',
        'page': '1'
      }
    }).pipe(
      map(res => res.data.items.map((r: any) => adapters.get(source).adapt(r)))
    )
  }

  searchCode(query: string) {
    return this.http.get(`search/code?q=${query}`)
    .pipe(
      map(res => console.log(res))
    )
  }

}
