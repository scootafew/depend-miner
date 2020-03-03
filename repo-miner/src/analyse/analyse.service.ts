import { Injectable } from '@nestjs/common';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { Repository, Artifact } from '@app/models';
import { RepoService } from 'src/common/repo/repo.service';
import { map, flatMap } from 'rxjs/operators';
import { GitHubCodeSearchResultItem } from 'src/common/repo/codeSearchResult';

@Injectable()
export class AnalyseService {

  constructor(
    @InjectQueue('analyse') private readonly analyseQueue: Queue,
    private readonly repoService: RepoService
    ) { }

  async processRepository(repo: Repository, emptyQueue?: boolean) {
    if (emptyQueue) { this.emptyQueue() };
    console.log(`Processing repository ${repo.fullName}`);

    // add job to queue with lifo so this job will be processed as soon as worker is free
    this.addToQueue(repo, true);

    // begin search for depencies and dependents
    this.getDependencies(repo);
    this.getDependents(repo);
  }

  async addToQueue(repo: Repository, lifo: boolean = false) {
    this.analyseQueue.add({repo: repo}, {lifo: lifo})
      .then(() => console.log(`Added repo: ${repo.fullName} to queue ${this.analyseQueue.name}`))
      .catch(err => console.log(err));
  }

  async getRepository(user: string, repo: string, latestArtifact?: Artifact): Promise<Repository> {
    return this.repoService.getRepository(user, repo, "GitHub")
      .pipe(
        map(repo => this.setLatestReleaseArtifact(repo, latestArtifact))
      ).toPromise();
  }

  setLatestReleaseArtifact(repo: Repository, artifact?: Artifact) {
    console.log(`Setting latest artifact on ${repo.fullName}`);
    if (artifact) {
      repo.latestArtifact = artifact;
    }
    return repo;
  }

  async getDependencies(repo: Repository) {
    console.log(`Getting dependencies for ${repo.fullName}`);


  }

  async getDependents(repo: Repository) {
    console.log("Getting dependents for: ", repo.latestArtifact);

    this.repoService.searchCode(this.buildQueryString(repo)).pipe(
      flatMap(item => this.repoService.getRepositoryInBackground(item.repository.owner.login, item.repository.name, "GitHub"))
    ).subscribe(repo => this.addToQueue(repo))
  }

  log(item: GitHubCodeSearchResultItem) {
    console.log(`${item.repository.owner.login}/${item.repository.name}`)
  }

  buildQueryString(repo: Repository) {
    const { artifactId, version } = repo.latestArtifact;
    return `<artifactId>${artifactId}</artifactId> filename:pom extension:xml`;
    // return `<artifactId>${artifactId}</artifactId> <version>${version}</version> filename:pom extension:xml`;
  }

  // async addToQueue() {
  //   for (let i = 0; i < 10; i++) {
  //     await this.analyseQueue.add({job: i})
  //     .then(() => console.log(`Added job: ${i}`))
  //     .catch(err => console.log(err));
  //   }
  //   let queueLength = await this.analyseQueue.count();
  //   console.log(`${queueLength} jobs in queue...`);
  // }

  emptyQueue() {
    this.analyseQueue.empty();
  }
}
