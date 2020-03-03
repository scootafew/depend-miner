import { Repository } from "../repo.model";

interface Adapter<T> {
  adapt(json: string): T
}

class GitHubRepoAdapter implements Adapter<Repository> {

  adapt(json: any): Repository {
    let repo = new Repository();
    
    repo.source = "GitHub";
    repo.fullName = json.full_name;
    repo.owner = json.owner?.login;
    repo.name = json.name;
    repo.url = json.html_url;
    repo.cloneUrl = json.clone_url;

    console.log("Helloooo")

    return repo;
  }
}

let adapters: Map<string, Adapter<Repository>> = new Map<string, Adapter<Repository>>([
  ["GitHubRepository", new GitHubRepoAdapter()]
])

export { adapters };