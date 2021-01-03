import { SchemaDirectiveVisitor, AuthenticationError, ForbiddenError, UserInputError } from "apollo-server";
import {
    GraphQLObjectType,
    GraphQLField,
    defaultFieldResolver,
    GraphQLArgument,
    GraphQLInterfaceType,
    EnumValueNode
} from "graphql";
import { Context } from "../context";
import { User } from "../entity/User";
import { CatalogIdentifierInput, Permission } from "../generated/graphql";
import { UserCatalogPermissionRepository } from "../repository/CatalogPermissionRepository";
import { CatalogRepository } from "../repository/CatalogRepository";

export async function resolveCatalogPermissions(context: Context, identifier: CatalogIdentifierInput, user?: User) {
    const catalog = await context.connection
        .getCustomRepository(CatalogRepository)
        .findCatalogBySlugOrFail(identifier.catalogSlug);

    const permissions: Permission[] = [];

    if (catalog.isPublic) permissions.push(Permission.VIEW);

    if (user == null) return permissions;

    const userPermission = await context.connection
        .getCustomRepository(UserCatalogPermissionRepository)
        .findCatalogPermissions({
            catalogId: catalog.id,
            userId: user.id
        });

    userPermission?.permissions.forEach((p) => {
        if (!permissions.includes(p)) permissions.push(p);
    });

    return permissions;
}
export class HasCatalogPermissionDirective extends SchemaDirectiveVisitor {
    visitObject(object: GraphQLObjectType) {
        const fields = object.getFields();
        for (let field of Object.values(fields)) {
            this.visitFieldDefinition(field);
        }
    }

    visitArgumentDefinition(
        argument: GraphQLArgument,
        details: {
            field: GraphQLField<any, any>;
            objectType: GraphQLObjectType | GraphQLInterfaceType;
        }
    ): GraphQLArgument | void | null {
        const { resolve = defaultFieldResolver } = details.field;
        const self = this;
        const permission = (argument
            .astNode!.directives!.find((d) => d.name.value == "hasCatalogPermission")!
            .arguments!.find((a) => a.name.value == "permission")!.value as EnumValueNode).value as Permission;
        details.field.resolve = async function (source, args, context: Context, info) {
            const identifier: CatalogIdentifierInput = args[argument.name];
            await self.validatePermission(context, identifier.catalogSlug, permission);
            return resolve.apply(this, [source, args, context, info]);
        };
    }

    visitFieldDefinition(field: GraphQLField<any, any>) {
        const { resolve = defaultFieldResolver } = field;
        const permission: Permission = this.args.permission;
        const self = this;
        field.resolve = async function (source, args, context: Context, info) {
            const catalogSlug: string | undefined =
                args.catalogSlug ||
                (args.value && args.value.catalogSlug) ||
                (args.identifier && args.identifier.catalogSlug) ||
                undefined;

            if (catalogSlug === undefined) throw new Error("No catalog slug defined in the request");

            await self.validatePermission(context, catalogSlug, permission);

            return resolve.apply(this, [source, args, context, info]);
        };
    }

    async validatePermission(context: Context, catalogSlug: string, permission: Permission) {
        const permissions = await resolveCatalogPermissions(context, { catalogSlug }, context.me);

        if (permissions.includes(permission)) return;

        if (context.me == null) throw new AuthenticationError(`NOT_AUTHENTICATED`);

        throw new ForbiddenError("NOT_AUTHORIZED");
    }
}
