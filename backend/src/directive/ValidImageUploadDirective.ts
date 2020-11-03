import { SchemaDirectiveVisitor, ValidationError } from "apollo-server";
import { GraphQLField, defaultFieldResolver, GraphQLArgument, GraphQLObjectType, GraphQLInterfaceType } from "graphql";
import { Context } from "../context";
import { FileUpload } from "graphql-upload";
import { IMAGE_UPLOAD_ERROR_TYPE } from "../generated/graphql";

export class ValidateImageUploadDirective extends SchemaDirectiveVisitor {
    visitArgumentDefinition(
        argument: GraphQLArgument,
        details: {
            field: GraphQLField<any, any>;
            objectType: GraphQLObjectType | GraphQLInterfaceType;
        }
    ): GraphQLArgument | void | null {
        const { resolve = defaultFieldResolver } = details.field;
        const self = this;
        details.field.resolve = async function (source, args, context: Context, info) {
            const imageUpload: FileUpload | undefined = args.image || args.value?.image || undefined;
            const image = await imageUpload;
            self.validateImage(image);
            return resolve.apply(this, [source, args, context, info]);
        };
    }

    private validateImage(image: FileUpload | undefined): void {
        if (!image) {
            throw new ValidationError(IMAGE_UPLOAD_ERROR_TYPE.IMAGE_NOT_INITIALIZED);
        }

        if (!ValidateImageUploadDirective.isValidMimeType(image.mimetype)) {
            throw new ValidationError(IMAGE_UPLOAD_ERROR_TYPE.IMAGE_FORMAT_NOT_SUPPORTED);
        }
    }

    public static isValidMimeType(mimeType: string): boolean {
        switch (mimeType) {
            case "image/jpeg":
            case "image/jpg":
            case "image/bmp":
            case "image/png":
                return true;
            default:
                return false;
        }
    }
}
