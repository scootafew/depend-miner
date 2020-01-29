import axios from 'axios';

export class GitHubConnector {

  API_TOKEN = '351b1b95793f9c3cf71af0540b0c147aa6e08e36';

  apiClient = axios.create({
    baseURL: "https://api.github.com",
    responseType: "json",
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `token ${this.API_TOKEN}`
    }
  })

  constructor() { }

  async fetchRepository(user: string, repo: string) {
    await this.apiClient.get(`/repos/${user}/${repo}`)
      .then(response => {
        console.log(response.data)
      })
      .catch(err => {
        console.log(err.response);
      })
  }

  async searchRepositories(query: string, sort?: string, order?: string) {
    await this.apiClient.get(`/search/repositories`, {
      params: {
        'q': query,
        ...(sort ? { 'sort': sort } : {}),
        ...(order ? { 'order': order } : {}),
        'per_page': '2',
        'page': '1'
      }
    }).then(response => {
        console.log(response)
      }).catch(err => {
        console.log(err.response);
      })
  }
}