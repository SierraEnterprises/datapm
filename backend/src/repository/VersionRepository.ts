import { EntityRepository, EntityManager } from "typeorm";
import { Version } from "../entity/Version";
import { VersionIdentifierInput, CreateVersionInput, PackageIdentifierInput } from "../generated/graphql";
import { PackageRepository } from "./PackageRepository";
import { Package } from "../entity/Package";
import Maybe from "graphql/tsutils/Maybe";
import { SemVer } from "semver";



@EntityRepository()
export class VersionRepository {

  constructor(private manager: EntityManager) {}

  async save(identifier: PackageIdentifierInput, value: CreateVersionInput) {

    return await this.manager.nestedTransaction(async (transaction) => {
      const packageEntity = await transaction.getCustomRepository(PackageRepository)
        .findOrFail({identifier});


        let semVer = new SemVer(value.packageFile.version);

       let version = transaction
        .getRepository(Version)
        .create({
          packageId: packageEntity.id,
          majorVersion:  semVer.major,
          minorVersion: semVer.minor,
          patchVersion: semVer.patch,
          description: value.packageFile.description || undefined,
          createdAt: new Date(),
          updatedAt: new Date(value.packageFile.updatedDate),
          packageFile: value.packageFile
        });

        return  await transaction.save(version);

    });

    
  }

  async findLatestVersion({
    identifier,
    relations = []
  }: {
    identifier: PackageIdentifierInput;
    relations?: string[]
  }): Promise<Maybe<Version>> {

    const ALIAS = "findLatestVersion";

    const packageRef = await this.manager
      .getCustomRepository(PackageRepository)
      .findPackageOrFail({identifier});
      

    return this.manager
      .getRepository(Version)
      .createQueryBuilder(ALIAS)
      .where({packageId: packageRef.id})
      .orderBy({
         "findLatestVersion.majorVersion": "DESC",
        "findLatestVersion.minorVersion": "DESC",
        "findLatestVersion.patchVersion": "DESC"
      })
      .addRelations(ALIAS,relations)
      .getOne();
  }


  async findOneOrFail({
    identifier,
    relations = []
  }: {
    identifier: VersionIdentifierInput;
    relations?: string[]
  }): Promise<Version> {

    let packageEntity = await this.manager.getCustomRepository(PackageRepository).findOrFail({identifier})

    let version = await this.manager
      .getRepository(Version)
      .findOneOrFail({where: 
        { packageId: packageEntity.id, 
          majorVersion: identifier.versionMajor, 
          minorVersion: identifier.versionMinor, 
          patchVersion: identifier.versionPatch
        }, relations: relations});
  
    if (!version) {
      throw new Error(`Version ${identifier.versionMajor}.${identifier.versionMinor}.${identifier.versionPatch} for package ${packageEntity.id} not found`);
    }
  
    return version;
  }

  async findVersions({
    packageId,
    relations = [],
  }: {
    packageId: number;
    relations?: string[];
  }): Promise<Version[]> {
    const ALIAS = "versionsByPackageId";
    const versions = await this.manager
      .getRepository(Version)
      .createQueryBuilder(ALIAS)
      .where({ packageId, isActive: true})
      .addRelations(ALIAS,relations)
      .getMany();
    
    return versions;
  }

  disableVersions(
    versions: Version[]
  ): void {
    this.manager.nestedTransaction(async (transaction) => {

      for await (const p of versions) {
        await transaction
          .createQueryBuilder()
          .update(Version)
          .set({
            isActive: false
          })
          .whereInIds(versions.map(v => v.id))
          .execute();
      }
    
    });
  }

}