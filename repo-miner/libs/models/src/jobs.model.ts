import { Repository, Artifact } from "./repo.model";

export class AnalyseJob {
  
  private constructor(
    public name: string,
    public uri: string,
    public searchDepth: number
  ) { }

  static fromRepo(repo: Repository, searchDepth: number) {
    return new this(repo.fullName, repo.cloneUrl, searchDepth)
  }

  static fromArtifact(artifact: Artifact, searchDepth: number) {
    return new this(artifact.toString(), artifact.toString(), searchDepth)
  }
}

export interface SearchJob {
  searchDepth: number
}

export interface RepositoryJob extends SearchJob {
  repo: Repository
}

export interface ArtifactJob extends SearchJob {
  artifact: Artifact,
}

export enum JobType {
  Repository = "repository",
  Artifact = "artifact"
}