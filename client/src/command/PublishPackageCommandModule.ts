import chalk from "chalk";
import ora from "ora";
import { PackageIdentifier, PublishJob, PublishJobArguments, identifierToString } from "datapm-client-lib";
import { printDataPMVersion } from "../util/DatapmVersionUtil";
import { CLIJobContext } from "./CommandTaskUtil";
import { exit } from "process";

export enum PublishDataSteps {
    STARTING_UPLOAD = "starting_upload",
    UPLOADING_DATA = "uploading_data",
    FINISHED_UPLOAD = "finished_upload"
}

export class PublishPackageCommandModule {
    async handleCommand(argv: PublishJobArguments): Promise<void> {
        printDataPMVersion(argv);

        const oraRef = ora({
            color: "yellow",
            spinner: "dots"
        });

        const jobContext = new CLIJobContext(oraRef, argv);

        const publishJob = new PublishJob(jobContext, argv);

        const publishJobResult = await publishJob.execute();

        if (publishJobResult.exitCode !== 0) {
            exit(publishJobResult.exitCode);
        }

        if (publishJobResult.result == null) {
            throw new Error("Publish job result is null");
        }
        const targetRegistries = publishJobResult.result.targetRegistries;
        const packageFile = publishJobResult.result.packageFile;

        if (targetRegistries.length) {
            const urls = targetRegistries.map((registryRef) => {
                const packageIdentifier: PackageIdentifier = {
                    registryURL: registryRef.url,
                    catalogSlug: registryRef.catalogSlug,
                    packageSlug: packageFile.packageSlug
                };
                return identifierToString(packageIdentifier);
            });

            jobContext.print("NONE", "");
            jobContext.print(
                "NONE",
                chalk.yellow(
                    `Use the command${targetRegistries.length > 1 ? "s" : ""} below to view the new package version`
                )
            );
            urls.forEach((url) => {
                console.log(chalk.green(`datapm info ${url}`));
            });

            jobContext.print("NONE", "");
            jobContext.print(
                "NONE",
                chalk.yellow(
                    `Share the command${targetRegistries.length > 1 ? "s" : ""} below to fetch the data in this package`
                )
            );
            urls.forEach((url) => {
                console.log(chalk.green(`datapm fetch ${url}`));
            });

            jobContext.print("NONE", "");
            jobContext.print("NONE", chalk.yellow("You can update the package file schema with the following command"));
            jobContext.print("NONE", chalk.green(`datapm update ${argv.reference}`));
        }

        jobContext.print("NONE", "");
        process.exit(0);
    }
}
