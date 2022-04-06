import {
    Difference,
    DifferenceType,
    DPMConfiguration,
    PackageFile,
    PublishMethod,
    RegistryReference
} from "datapm-lib";
import { SemVer } from "semver";
import { CreateVersionInput } from "../generated/graphql";
import { obtainCredentials } from "./CredentialsUtil";
import { identifierToString } from "./IdentifierUtil";
import { getRegistryClientWithConfig } from "./RegistryClient";
import { exit } from "yargs";
import { DataPMConnectorDescription } from "../connector/file-based/datapm-registry/DataPMConnectorDescription";
import numeral from "numeral";
import { JobContext, Task } from "../task/Task";
import { fetchMultiple } from "../task/FetchPackageJob";
import internal from "stream";

type CredentialsBySourceSlug = Map<string, DPMConfiguration>;

export const DifferenceTypeMessages: Record<DifferenceType, string> = {
    [DifferenceType.REMOVE_SCHEMA]: "Removed Schema",
    [DifferenceType.ADD_SCHEMA]: "Added Schema",
    [DifferenceType.CHANGE_PACKAGE_DISPLAY_NAME]: "Changed Package Display Name",
    [DifferenceType.CHANGE_PACKAGE_DESCRIPTION]: "Changed Package Description",
    [DifferenceType.CHANGE_SOURCE]: "Changed Source",
    [DifferenceType.CHANGE_SOURCE_CONFIGURATION]: "Changed Source Configuration",
    [DifferenceType.CHANGE_STREAM_UPDATE_METHOD]: "Changed Source Update Method",
    [DifferenceType.CHANGE_STREAM_STATS]: "Changed Stream Stats",
    [DifferenceType.CHANGE_STREAM_UPDATE_HASH]: "Changed Stream Update Hash",
    [DifferenceType.CHANGE_STREAM_STATS]: "Changed Stream Stats",
    [DifferenceType.ADD_PROPERTY]: "Added Property",
    [DifferenceType.REMOVE_PROPERTY]: "Removed Property",
    [DifferenceType.CHANGE_SOURCE_URIS]: "Changed Source URIs",
    [DifferenceType.REMOVE_HIDDEN_PROPERTY]: "Removed Hidden Property",
    [DifferenceType.CHANGE_CONTACT_EMAIL]: "Change Contact Email",
    [DifferenceType.REMOVE_STREAM_SET]: "Remove Stream Set",
    [DifferenceType.REMOVE_SOURCE]: "Removed Source",
    [DifferenceType.REMOVE_HIDDEN_SCHEMA]: "Removed Hidden Schema",
    [DifferenceType.CHANGE_PROPERTY_TYPE]: "Changed Property Type",
    [DifferenceType.CHANGE_PROPERTY_FORMAT]: "Changed Property Format",
    [DifferenceType.CHANGE_PROPERTY_UNIT]: "Changed Property Unit",
    [DifferenceType.CHANGE_PROPERTY_DESCRIPTION]: "Changed Property Description",
    [DifferenceType.CHANGE_GENERATED_BY]: "Changed Generated By",
    [DifferenceType.CHANGE_UPDATED_DATE]: "Changed Updated Date",
    [DifferenceType.CHANGE_VERSION]: "Changed Version",
    [DifferenceType.CHANGE_README_MARKDOWN]: "Changed Readme Markdown",
    [DifferenceType.CHANGE_LICENSE_MARKDOWN]: "Changed License Markdown",
    [DifferenceType.CHANGE_README_FILE]: "Changed Readme File",
    [DifferenceType.CHANGE_LICENSE_FILE]: "Changed License File",
    [DifferenceType.CHANGE_WEBSITE]: "Changed Website",
    [DifferenceType.CHANGE_CONTACT_EMAIL]: "Changed Contact Email",
    [DifferenceType.HIDE_PROPERTY]: "Property Hidden",
    [DifferenceType.UNHIDE_PROPERTY]: "Property Unhidden",
    [DifferenceType.CHANGE_SOURCE_CONNECTION]: "Changed Source Connection Configuration",
    [DifferenceType.CHANGE_SOURCE_CREDENTIALS]: "Changed Source Credentials"
};

export function differenceToString(difference: Difference): string {
    let pointer = difference.pointer.split("/").pop();

    if (difference.type.toString().includes("_PROPERTY")) {
        const parts = difference.pointer.match(/.*\/properties\/(.*)/);
        if (parts) {
            pointer = parts[1];
        }
    }

    let message = `${DifferenceTypeMessages[difference.type]}`;

    if (pointer != null && pointer.length > 0) message += ` ${pointer}`;

    return message;
}

export enum PublishSchemaSteps {
    CONNECT = "connect",
    FIND_EXISTING_PACKAGE = "find_existing_package",
    UPDATING_PACKAGE_LISTING = "updating_package_listing",
    UPDATED_PACKAGE_LISTING = "updated_package_listing",
    FOUND_EXISTING_PACKAGE = "found_existing_package",
    NO_EXISTING_PACKAGE_FOUND = "no_existing_package_found",

    CREATE_PACKAGE = "publish_package_file",
    CREATE_PACKAGE_SUCCESS = "publish_package_file_success",
    CREATE_VERSION = "publish_version",
    CREATE_VERSION_SUCCESS = "publish_version_success",
    VERSION_EXISTS_SUCCESS = "version_exists_success"
}

export interface PublishProgress {
    updateStep(step: PublishSchemaSteps, registry: RegistryReference): Promise<void>;
}

/** Returns boolean of whether the package file was changed during the saving process */
export async function publishPackageFile(
    jobContext: JobContext,
    packageFile: PackageFile,
    targetRegistries: RegistryReference[]
): Promise<boolean> {
    const credentialsBySourceSlug: CredentialsBySourceSlug = new Map();

    let packageFileChanged = false;

    for (const source of packageFile.sources) {
        const credentials = await obtainCredentials(jobContext, source);
        credentialsBySourceSlug.set(source.slug, credentials);
    }

    await attemptPublishPackageFile(jobContext, packageFile, targetRegistries, credentialsBySourceSlug)
        .catch(async (error) => {
            if (error.networkError) {
                if (error.networkError.result) {
                    if (error.networkError.result.errors[0].message.indexOf("API_KEY_NOT_FOUND") !== -1) {
                        jobContext.print("ERROR", "Failed to publish: Your API KEY is out of date.");
                        jobContext.print("INFO", "Genarate a new API Key in this registry's web console");
                    } else {
                        jobContext.print("ERROR", `Failed to publish: ${error.networkError.result.errors[0].message}`);
                    }
                } else
                    jobContext.print(
                        "ERROR",
                        `Failed to publish: ${error.networkError.bodyText || error.networkError.message}`
                    );

                throw error;
            }

            if (error.message === "README_FILE_NOT_FOUND") {
                jobContext.print(
                    "ERROR",
                    `Could not find the README file with the relative path of ${packageFile.readmeFile}`
                );
                throw error;
            }

            if (error.message === "LICENSE_FILE_NOT_FOUND") {
                jobContext.print(
                    "ERROR",
                    `Could not find the LICENSE file with the relative path of ${packageFile.licenseFile}`
                );
                throw error;
            }

            if (error.extensions?.code === "HIGHER_VERSION_REQUIRED") {
                jobContext.print(
                    "WARN",
                    `Because of the changes in this file, the version number must be at least ${error.extensions?.minNextVersion}`
                );

                packageFile.version = error.extensions?.minNextVersion;
                packageFileChanged = true;

                try {
                    await attemptPublishPackageFile(jobContext, packageFile, targetRegistries, credentialsBySourceSlug);
                } catch (error) {
                    jobContext.print("ERROR", `Error publishing version after version change. ${error.messasge}`);
                    throw error;
                }
                jobContext.print("SUCCESS", "Published to registry after version update");
            } else {
                throw error;
            }
        })
        .then(() => {
            jobContext.print("SUCCESS", "Published package file to registry");
        })
        .catch((error) => {
            jobContext.print("ERROR", `Failed to publish: ${error.message}`);
            process.exit(1);
        });

    const registryForDataPublishing = targetRegistries.filter(
        (registry) => registry.publishMethod === PublishMethod.SCHEMA_AND_DATA
    );

    if (registryForDataPublishing.length > 0) {
        jobContext.print("INFO", "Publishing data...");

        for (const targetRegistry of registryForDataPublishing) {
            try {
                const results = await publishData(jobContext, packageFile, targetRegistry);

                const totalRecordCount = Object.values(results).reduce((acc, result) => acc + result, 0);

                jobContext.print(
                    "SUCCESS",
                    `Finished uploading ${numeral(totalRecordCount).format("0,0")} records to ` +
                        targetRegistry.url +
                        "/" +
                        targetRegistry.catalogSlug +
                        "/" +
                        packageFile.packageSlug
                );
            } catch (error) {
                jobContext.print("ERROR", `Failed to publish data: ${error.message}`);
                exit(1, error);
            }
        }
    }

    return packageFileChanged;
}

async function publishData(
    jobContext: JobContext,
    packageFile: PackageFile,
    targetRegistry: RegistryReference
): Promise<{ [key: string]: number }> {
    const dataPMConnectorDescription = new DataPMConnectorDescription();

    const dataPMSinkDescription = await dataPMConnectorDescription.getSinkDescription();

    if (dataPMSinkDescription == null) {
        throw new Error("DATAPM_SINK_DESCRIPTION_NOT_FOUND");
    }

    const dataPMSink = await dataPMSinkDescription.loadSinkFromModule();

    return await fetchMultiple(
        jobContext,
        packageFile,
        {
            catalogSlug: targetRegistry.catalogSlug,
            packageSlug: packageFile.packageSlug,
            packageMajorVersion: new SemVer(packageFile.version).major
        },
        dataPMSink,
        {
            url: targetRegistry.url
        },
        {},
        {
            catalogSlug: targetRegistry.catalogSlug,
            packageSlug: packageFile.packageSlug,
            majorVersion: new SemVer(packageFile.version).major
        },
        true,
        false
    );
}

async function attemptPublishPackageFile(
    jobContext: JobContext,
    packageFile: PackageFile,
    targetRegistries: RegistryReference[],
    credentialsBySourceSlug: CredentialsBySourceSlug
): Promise<void> {
    let task: Task | undefined;

    await uploadPackageFile(jobContext, packageFile, targetRegistries, credentialsBySourceSlug, {
        updateStep: async (step: PublishSchemaSteps, registryRef: RegistryReference) => {
            switch (step) {
                case PublishSchemaSteps.FIND_EXISTING_PACKAGE:
                    task = await jobContext.startTask("Finding existing package...");
                    break;

                case PublishSchemaSteps.FOUND_EXISTING_PACKAGE:
                    await task?.end(
                        "SUCCESS",
                        "Found the existing package - " +
                            identifierToString({
                                registryURL: registryRef.url,
                                catalogSlug: registryRef.catalogSlug,
                                packageSlug: packageFile.packageSlug
                            })
                    );
                    break;

                case PublishSchemaSteps.UPDATING_PACKAGE_LISTING:
                    task = await jobContext.startTask("Updating package description and name");
                    break;

                case PublishSchemaSteps.UPDATED_PACKAGE_LISTING:
                    await task?.end("SUCCESS", "Updated package listing");
                    break;

                case PublishSchemaSteps.NO_EXISTING_PACKAGE_FOUND:
                    await task?.end("SUCCESS", "Existing package not found.");
                    break;

                case PublishSchemaSteps.CREATE_PACKAGE:
                    task = await jobContext.startTask(
                        `Creating new package listing ${registryRef.catalogSlug}/${packageFile.packageSlug}`
                    );
                    break;

                case PublishSchemaSteps.CREATE_PACKAGE_SUCCESS:
                    await task?.end(
                        "SUCCESS",
                        `Created new package listing ${registryRef.catalogSlug}/${packageFile.packageSlug}`
                    );
                    break;

                case PublishSchemaSteps.CREATE_VERSION:
                    task = await jobContext.startTask(`Publishing version ${packageFile.version}`);
                    break;

                case PublishSchemaSteps.CREATE_VERSION_SUCCESS:
                    await task?.end("SUCCESS", `Published version ${packageFile.version}`);
                    break;

                case PublishSchemaSteps.VERSION_EXISTS_SUCCESS:
                    await task?.end("SUCCESS", `Updated existing version ${packageFile.version}`);
                    break;
            }
        }
    });
}

export async function uploadPackageFile(
    jobContext: JobContext,
    packageFile: PackageFile,
    targetRegistries: RegistryReference[],
    credentialsBySourceSlug: CredentialsBySourceSlug,
    context: PublishProgress
): Promise<Map<RegistryReference, boolean>> {
    const returnValue: Map<RegistryReference, boolean> = new Map();

    for (const registryRef of targetRegistries) {
        await context.updateStep(PublishSchemaSteps.FIND_EXISTING_PACKAGE, registryRef);

        const registry = getRegistryClientWithConfig(jobContext, registryRef);

        try {
            const existingPackage = await registry.getPackage({
                catalogSlug: registryRef.catalogSlug,
                packageSlug: packageFile.packageSlug
            });

            if (existingPackage.errors) {
                throw existingPackage.errors[0];
            }

            await context.updateStep(PublishSchemaSteps.FOUND_EXISTING_PACKAGE, registryRef);

            await context.updateStep(PublishSchemaSteps.UPDATING_PACKAGE_LISTING, registryRef);

            await registry.updatePackage(
                {
                    catalogSlug: registryRef.catalogSlug,
                    packageSlug: packageFile.packageSlug
                },
                {
                    description: packageFile.description,
                    displayName: packageFile.displayName
                }
            );

            await context.updateStep(PublishSchemaSteps.UPDATED_PACKAGE_LISTING, registryRef);
        } catch (error) {
            if (!error.message.includes("PACKAGE_NOT_FOUND")) {
                throw error;
            }

            await context.updateStep(PublishSchemaSteps.NO_EXISTING_PACKAGE_FOUND, registryRef);

            await context.updateStep(PublishSchemaSteps.CREATE_PACKAGE, registryRef);

            await registry.createPackage({
                catalogSlug: registryRef.catalogSlug,
                packageSlug: packageFile.packageSlug,
                description: packageFile.description,
                displayName: packageFile.displayName
            });
            await context.updateStep(PublishSchemaSteps.CREATE_PACKAGE_SUCCESS, registryRef);
        }

        await context.updateStep(PublishSchemaSteps.CREATE_VERSION, registryRef);

        const versions = generateCreateVersion(packageFile, registryRef, credentialsBySourceSlug);

        const serverResponse = await registry.createVersion(versions, {
            catalogSlug: registryRef.catalogSlug,
            packageSlug: packageFile.packageSlug
        });

        if (serverResponse.errors) {
            if (serverResponse.errors.find((error) => error.extensions?.code === "VERSION_EXISTS") !== undefined)
                await context.updateStep(PublishSchemaSteps.VERSION_EXISTS_SUCCESS, registryRef);
            else throw serverResponse.errors[0];
        } else {
            await context.updateStep(PublishSchemaSteps.CREATE_VERSION_SUCCESS, registryRef); // FIXME ONLY SHOW THIS IF THE VERSION HAS ACCTUALLY CHANGED
        }

        returnValue.set(registryRef, true);
    }

    return returnValue;
}

function generateCreateVersion(
    packageFileObject: PackageFile,
    registryReference: RegistryReference,
    _credentialsBySourceSlug: CredentialsBySourceSlug // This will be used for proxy feature
): CreateVersionInput {
    // deep copy the package file
    const packageFile = JSON.parse(JSON.stringify(packageFileObject)) as PackageFile;

    // filter out all othe registries
    packageFile.registries = [registryReference];

    if (registryReference.publishMethod === PublishMethod.SCHEMA_PROXY_DATA) {
        throw new Error("Publishing with credentials not yet implemented");
    }

    const version: CreateVersionInput = {
        packageFile: JSON.stringify(packageFileObject)
    };

    return version;
}
