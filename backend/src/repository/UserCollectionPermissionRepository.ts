import { EntityRepository, Repository } from "typeorm";
import { ForbiddenError } from "apollo-server";

import { Permission, CollectionIdentifierInput, SetUserCollectionPermissionsInput } from "../generated/graphql";
import { UserCollectionPermission } from "../entity/UserCollectionPermission";
import { User } from "../entity/User";

import { UserRepository } from "./UserRepository";
import { CollectionRepository } from "./CollectionRepository";

@EntityRepository(UserCollectionPermission)
export class UserCollectionPermissionRepository extends Repository<UserCollectionPermission> {
    findCollectionPermissions({
        collectionId,
        userId,
        relations = []
    }: {
        collectionId: number;
        userId: number;
        relations?: string[];
    }) {
        const ALIAS = "userCollectionPermission";
        return this.manager
            .getRepository(UserCollectionPermission)
            .createQueryBuilder(ALIAS)
            .addRelations(ALIAS, relations)
            .where({ collectionId, userId })
            .getOne();
    }
    public async grantAllPermissionsForUser(userId: number, collectionId: number): Promise<UserCollectionPermission> {
        return this.setPermissionsForUser(userId, collectionId, [Permission.VIEW, Permission.EDIT, Permission.MANAGE]);
    }

    public async setPermissionsForUser(
        userId: number,
        collectionId: number,
        permissions: Permission[]
    ): Promise<UserCollectionPermission> {
        const permissionEntity = new UserCollectionPermission();
        permissionEntity.collectionId = collectionId;
        permissionEntity.userId = userId;
        permissionEntity.permissions = permissions;
        return this.save(permissionEntity);
    }

    public async hasPermission(userId: number, collectionId: number, permission: Permission): Promise<boolean> {
        const permissionsEntity = await this.findByUserAndCollectionId(userId, collectionId);
        if (!permissionsEntity) {
            return false;
        }

        return permissionsEntity.permissions.some((p) => p === permission);
    }

    public async findByUserId(userId: number): Promise<UserCollectionPermission[]> {
        return this.createQueryBuilder().where({ userId: userId }).getMany();
    }

    public async findByUserAndCollectionId(
        userId: number,
        collectionId: number
    ): Promise<UserCollectionPermission | undefined> {
        return this.createQueryBuilder().where({ userId: userId, collectionId: collectionId }).getOne();
    }

    public async setUserCollectionPermissions({
        identifier,
        value,
        relations
    }: {
        identifier: CollectionIdentifierInput;
        value: SetUserCollectionPermissionsInput;
        relations?: string[];
    }): Promise<void> {
        await this.manager.nestedTransaction(async (transaction) => {
            const user = await transaction.getCustomRepository(UserRepository).getUserByUsername(value.username);

            if (!user) {
                throw new Error(`USER_NOT_FOUND - ${value.username}`);
            }

            const collectionEntity = await transaction
                .getCustomRepository(CollectionRepository)
                .findCollectionBySlugOrFail(identifier.collectionSlug);

            const permissions = await this.findByUserAndCollectionId(user.id, collectionEntity.id);

            // If User does not exist in UserCollectionTable, it creates new record
            if (permissions == undefined) {
                try {
                    await transaction
                        .createQueryBuilder()
                        .insert()
                        .into(UserCollectionPermission)
                        .values({
                            collectionId: collectionEntity.id,
                            userId: user.id,
                            permissions: value.permissions
                        })
                        .execute();
                } catch (e) {
                    console.log(e);
                }
            }

            // Updates permissions if user exists already in UserCollectiontable
            if (permissions != undefined && value.permissions.length) {
                try {
                    await transaction
                        .createQueryBuilder()
                        .update(UserCollectionPermission)
                        .set({ permissions: value.permissions })
                        .where({ collectionId: collectionEntity.id, userId: user.id })
                        .execute();
                } catch (e) {
                    console.log(e);
                }
            }
        });
    }

    deleteUserCollectionPermissions({
        identifier,
        username
    }: {
        identifier: CollectionIdentifierInput;
        username: string;
        relations?: string[];
    }): void {
        this.manager.nestedTransaction(async (transaction) => {
            const user = await transaction.getCustomRepository(UserRepository).findOneOrFail({ username });

            const collectionEntity = await transaction
                .getCustomRepository(CollectionRepository)
                .findCollectionBySlugOrFail(identifier.collectionSlug);

            await transaction.delete(UserCollectionPermission, { collectionId: collectionEntity.id });
        });
    }
}
