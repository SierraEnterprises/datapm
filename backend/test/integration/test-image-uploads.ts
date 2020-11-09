import { createAnonymousClient, createUser } from "./test-utils";
import { expect } from "chai";
import { ApolloClient, NormalizedCacheObject } from "@apollo/client/core";
import * as fs from "fs";
import request = require("superagent");
import { SetMyAvatarImageDocument, SetMyCoverImageDocument, DeleteMeDocument } from "./registry-client";
import * as crypto from "crypto";
import { TEMP_STORAGE_URL } from "./setup";
import { Readable } from "stream";

describe("Image Upload Tests", async () => {
    const anonymousUser = createAnonymousClient();
    let userAClient: ApolloClient<NormalizedCacheObject>;

    before(async () => {});

    it("Create user", async () => {
        userAClient = await createUser(
            "FirstUserName",
            "FirstUserLastName",
            "first-user-username",
            "first-user@test.datapm.io",
            "passwordA!"
        );
        expect(userAClient).to.exist;
    });

    it("setMyAvatarImage_WithValidImage_UploadsImageAndStoresMetadataInDbAndIsPublic", async () => {
        const imageContent = fs.readFileSync("test/other-files/ba.jpg", "base64");

        const uploadResult = await userAClient.mutate({
            mutation: SetMyAvatarImageDocument,
            variables: {
                image: { base64: imageContent }
            }
        });

        expect(uploadResult).to.exist;
        expect(uploadResult.errors).to.not.exist;
        expect(uploadResult.data).to.exist;
    });

    it("Avatar image not found", async function () {
        let errorFound = false;
        try {
            const imageServingResult = await request.get("localhost:4000/images/user/invalid-username/avatar");
        } catch (err) {
            expect(err.message).to.equal("Not Found");
            errorFound = true;
        }

        expect(errorFound).to.be.true;
    });

    it("Download avatar image", async function () {
        const imageServingResult = await request.get("localhost:4000/images/user/first-user-username/avatar");

        expect(imageServingResult.body).to.exist;
        expect(imageServingResult.type).to.equal("image/jpeg");
    });

    it("setMyCoverImage_WithValidImage_UploadsImageAndStoresMetadataInDbAndIsPublic", async () => {
        const imageContent = fs.readFileSync("test/other-files/ba.jpg", "base64");

        const uploadResult = await userAClient.mutate({
            mutation: SetMyCoverImageDocument,
            variables: {
                image: { base64: imageContent }
            }
        });
        expect(uploadResult).to.exist;
        expect(uploadResult.errors).to.not.exist;
        expect(uploadResult.data).to.exist;

        expect(
            fs.existsSync(TEMP_STORAGE_URL.replace("file://", "") + "/user/first-user-username/user_avatar"),
            "avatar file should be present on file system"
        ).true;

        expect(
            fs.existsSync(TEMP_STORAGE_URL.replace("file://", "") + "/user/first-user-username/user_cover"),
            "cover file should be present on file system"
        ).true;
    });

    it("Download cover image", async function () {
        let imageServingResult = await request.get("http://localhost:4000/images/user/first-user-username/cover");

        expect(imageServingResult.body).to.exist;
        expect(imageServingResult.type).to.equal("image/jpeg");

        // TODO the image fetching is working, but when invoked by superagent, the server responds with 0 byte files
        // so we can't test that the correct image is returned.

        // const imageWithData = await request
        //    .get("http://localhost:4000/images/user/first-user-username/cover")
        //    .buffer(true)
        //    .parse(request.parse.image);

        //console.log(JSON.stringify(imageWithData.body, null, 1));
        //let hash = crypto.createHash("sha256").update(imageWithData.body, "utf8").digest("hex");
        // expect(hash).equal("asfdasdfasfd");
    });

    it("setMyAvatarImage_WithUnsupportedImageFormat_ReturnsErrorWithInvalidFormatErrorCode", async () => {
        const imageContent = "data:image/svg+xml;base64," + fs.readFileSync("test/other-files/ba.svg", "base64");

        const uploadResult = await userAClient.mutate({
            mutation: SetMyAvatarImageDocument,
            variables: {
                image: { base64: imageContent }
            }
        });
        expect(uploadResult).to.exist;
        expect(uploadResult.errors).to.exist;
        expect(uploadResult.errors).length(1);
        if (uploadResult.errors) {
            expect(uploadResult.errors[0]).to.exist;
            expect(uploadResult.errors[0].message).to.equal("IMAGE_FORMAT_NOT_SUPPORTED");
        }
    });

    it("setMyAvatarImage_WithHugeImage_ReturnsErrorWithImageTooLargeErrorCode", async () => {
        const imageSizeInBytes = 10_500_000; // Limit is 10_000_000 or 10MB
        const base64CharactersToExceedLimit = (imageSizeInBytes * 4) / 3; // Base64 adds some overhead (~30%) to the content size

        const contentToAdd = "A";
        let multipliedImageContent = "";
        for (let i = 0; i < base64CharactersToExceedLimit; i++) {
            multipliedImageContent += contentToAdd;
        }
        multipliedImageContent += "==";

        const uploadResult = await userAClient.mutate({
            mutation: SetMyAvatarImageDocument,
            variables: {
                image: { base64: multipliedImageContent }
            }
        });

        expect(uploadResult).to.exist;
        expect(uploadResult.errors).to.exist;
        expect(uploadResult.errors).length(1);
        if (uploadResult.errors) {
            expect(uploadResult.errors[0]).to.exist;
            expect(uploadResult.errors[0].message).to.equal("IMAGE_TOO_LARGE");
        }
    }).timeout(10000);

    it("Remove avatar and cover image file when deleting user", async function () {
        const response = await userAClient.mutate({
            mutation: DeleteMeDocument
        });

        expect(response.errors == null).true;

        expect(
            fs.existsSync(TEMP_STORAGE_URL.replace("file://", "") + "/user/first-user-username/user_avatar"),
            "avatar file should be not present"
        ).false;

        expect(
            fs.existsSync(TEMP_STORAGE_URL.replace("file://", "") + "/user/first-user-username/user_cover"),
            "avatar file should be not present"
        ).false;
    });
});
