export class Repository {

  public fullName: string;
  public owner: string;
  public name: string;
  public url: string;

  public latestArtifact: Artifact;

  constructor() {}
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
  
}