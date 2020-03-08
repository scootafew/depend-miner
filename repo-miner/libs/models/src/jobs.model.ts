import { Repository, Artifact } from "./repo.model";

export class AnalyseJob {
  
  private constructor(
    public name: string,
    public args: string[],
    public searchDepth: number,
    public type: JobType
  ) { }

  static fromRepo(repo: Repository, searchDepth: number) {
    let jobArgs = [repo.cloneUrl, ...(repo.pathToPomWithDependency ? repo.pathToPomWithDependency : [])];
    return new this(repo.fullName, jobArgs, searchDepth, JobType.Repository)
  }

  static fromArtifact(artifact: Artifact, searchDepth: number) {
    return new this(artifact.toString(), [artifact.toString()], searchDepth, JobType.Artifact)
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