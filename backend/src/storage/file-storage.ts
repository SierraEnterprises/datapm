import { DPMStorage } from "./dpm-storage";
import { Readable } from "stream";
import { DpmStorageStreamHolder } from "./dpm-storage-stream-holder";
import { StorageErrors } from "./files/file-storage-service";
import sanitize from "sanitize-filename";

const fs = require("fs-extra");

export class FileStorage implements DPMStorage {
    public static readonly SCHEMA_URL_PREFIX = "file";

    private readonly SCHEMA_URL: string;
    private readonly streamHelper = new DpmStorageStreamHolder();

    public constructor(url: string) {
        this.start(url);
        this.SCHEMA_URL = url;
    }

    public start(url: string): void {
        if (!fs.existsSync(url)) {
            fs.mkdirSync(url, { recursive: true });
        }

        if (!FileStorage.hasReadWriteAccessInDirectory(url)) {
            throw new Error("Has Read/Write access to the filesystem in directory " + url);
        }
    }

    public itemExists(namespace: string, itemId: string): Promise<boolean> {
        const sanitizedItemId = sanitize(itemId);
        const path = this.buildPath(namespace, sanitizedItemId);
        console.log("checking path", path);
        const itemExistsInPath = this.itemExistsInAbsolutePath(path);
        return Promise.resolve(itemExistsInPath);
    }

    public deleteItem(namespace: string, itemId: string): Promise<void> {
        const sanitizedItemId = sanitize(itemId);
        const path = this.buildPath(namespace, sanitizedItemId);

        if (!fs.existsSync(path)) {
            return Promise.resolve();
        }

        fs.unlinkSync(path);
        return Promise.resolve();
    }

    public async getItem(namespace: string, itemId: string): Promise<Readable> {
        const sanitizedItemId = sanitize(itemId);
        const path = this.buildPath(namespace, sanitizedItemId);

        if (!fs.existsSync(path)) {
            throw new Error(StorageErrors.FILE_DOES_NOT_EXIST);
        }

        const readStream = fs.createReadStream(path);
        this.streamHelper.registerReadStream(readStream);
        return Promise.resolve(readStream);
    }

    public async writeItem(namespace: string, itemId: string, byteStream: Readable, transformer?: any): Promise<void> {
        this.createItemDirectoryIfMissing(namespace);
        const sanitizedItemId = sanitize(itemId);
        const path = this.buildPath(namespace, sanitizedItemId);
        const writeStream = fs.createWriteStream(path);
        return this.streamHelper.copyToStream(byteStream, writeStream, transformer);
    }

    public async moveFile(oldFilePath: string, newFilePath: string, callback?: any): Promise<void> {
        const oldFileFinalPath = this.buildBasePath(oldFilePath);
        if (!this.itemExistsInAbsolutePath(oldFileFinalPath)) {
            throw new Error(StorageErrors.FILE_DOES_NOT_EXIST);
        }

        const newFileFinalPath = this.buildBasePath(newFilePath);
        return fs.move(oldFileFinalPath, newFileFinalPath, { overwrite: true }, callback);
    }

    public stop(): boolean {
        return this.streamHelper.destroyOpenStreams();
    }

    private static hasReadWriteAccessInDirectory(url: string): boolean {
        try {
            fs.accessSync(url, fs.constants.W_OK);
            fs.accessSync(url, fs.constants.R_OK);
            return true;
        } catch (exception) {
            return false;
        }
    }

    private createItemDirectoryIfMissing(namespace: string): void {
        const path = `${this.SCHEMA_URL}/${namespace}`;
        if (!fs.existsSync(path)) {
            fs.mkdirSync(path, { recursive: true });
        }
    }

    private itemExistsInAbsolutePath(path: string): boolean {
        return fs.existsSync(path);
    }

    private buildPath(namespace: string, itemId: string): string {
        return `${this.buildBasePath(namespace)}/${itemId}`;
    }

    private buildBasePath(namespace: string): string {
        return `${this.SCHEMA_URL}/${namespace}`;
    }
}
