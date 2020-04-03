import { Injectable } from '@nestjs/common';
import { Queue, Job } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { Repository, Artifact, JobType, ArtifactJob, AnalyseJob } from '@app/models';
import { GithubService } from 'src/common/repo/github.service';

@Injectable()
export class AnalyseService {

  constructor(
    @InjectQueue('analyse') private readonly analyseQueue: Queue,
    @InjectQueue('repositoryFetch') private readonly repositoryFetchQueue: Queue,
    @InjectQueue('dependentsSearch') private readonly dependentsSearchQueue: Queue<ArtifactJob>,
    @InjectQueue('dependencySearch') private readonly dependencySearchQueue: Queue,
    private readonly repoService: GithubService
    ) { }

  async processRepository(repo: Repository, emptyQueue?: boolean) {
    if (emptyQueue) { this.emptyQueues() };
    console.log(`Processing repository ${repo.fullName}`);

    // add job to queue with lifo so this job will be processed as soon as worker is free
    this.analyseQueue.add(JobType.Repository, AnalyseJob.fromRepo(repo, 0), {lifo: true})
      .then(() => console.log(`Added repo: ${repo.fullName} to queue ${this.analyseQueue.name}`))
      .catch(err => console.log(err));

    // begin search for depencies and dependents
    // this.getDependencies(repo);
    // this.getDependents(repo);
  }

  async processArtifact(artifactString: string, emptyQueue?: boolean) {
    if (emptyQueue) { this.emptyQueues() };
    let artifact = Artifact.fromString(artifactString);

    // add job to queue with lifo so this job will be processed as soon as worker is free
    this.analyseQueue.add(JobType.Artifact, AnalyseJob.fromArtifact(artifact, 0), {lifo: true})
      .then(() => console.log(`Added artifact: ${artifact.toString()} to queue ${this.analyseQueue.name}`))
      .catch(err => console.log(err));

    this.getDependentsForArtifact(artifact);
  }

  private async addToQueue(queue: Queue, repo: Repository, lifo: boolean = false) {
    queue.add(JobType.Repository, {repo: repo}, {lifo: lifo})
      .then(() => console.log(`Added repo: ${repo.fullName} to queue ${queue.name}`))
      .catch(err => console.log(err));
  }

  async getRepository(user: string, repo: string): Promise<Repository> {
    return this.repoService.getRepository(user, repo, "GitHub").toPromise();
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
    this.addToQueue(this.dependencySearchQueue, repo);
  }

  async getDependentsForRepo(repo: Repository) {
    this.dependentsSearchQueue.add(JobType.Artifact, {artifact: repo.latestArtifact, searchDepth: 0})
      .then(() => console.log(`Added repo: ${repo.fullName} to queue ${this.dependentsSearchQueue.name}`))
      .catch(err => console.log(err));
  }

  async getDependentsForArtifact(artifact: Artifact) {
    this.dependentsSearchQueue.add(JobType.Artifact, {artifact: artifact, searchDepth: 0})
      .then(() => console.log(`Added artifact: ${artifact.toString()} to queue ${this.dependentsSearchQueue.name}`))
      .catch(err => console.log(err));
  }

  async emptyQueues() {
    await this.analyseQueue.empty();
    this.analyseQueue.getActive().then((jobs: Job[]) => jobs.forEach(job => job.remove()));
    await this.repositoryFetchQueue.empty();
    this.repositoryFetchQueue.getActive().then((jobs: Job[]) => jobs.forEach(job => job.remove()));
    await this.dependencySearchQueue.empty();
    this.dependencySearchQueue.getActive().then((jobs: Job[]) => jobs.forEach(job => job.remove()));
    await this.dependentsSearchQueue.empty();
    this.dependentsSearchQueue.getActive().then((jobs: Job[]) => jobs.forEach(job => job.remove()));
  }
}
