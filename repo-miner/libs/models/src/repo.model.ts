export class Repository {

  public source: string;
  public fullName: string;
  public owner: string;
  public name: string;
  public url: string;
  public cloneUrl: string;
  public isFork: boolean;
  public stars: number;
  public size: number;

  public latestArtifact: Artifact;

  constructor() { }
}

class Owner {
  public name: string;

  constructor() {}
}

export class Artifact {
  
  constructor(
    public groupId: string,
    public artifactId: string,
    public version: string,
  ) { }

  toString() {
    return `${this.groupId}:${this.artifactId}:${this.version}`
  }
  
}