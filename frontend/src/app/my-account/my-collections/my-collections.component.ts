import { Component, OnInit } from "@angular/core";
import { MatDialog } from "@angular/material/dialog";
import { STATUS_CODES } from "http";
import {
    Collection,
    CreateCollectionGQL,
    DeleteCollectionGQL,
    MyCollectionsGQL,
    UpdateCollectionGQL
} from "src/generated/graphql";
import { CreateCollectionComponent } from "../create-collection/create-collection.component";
import { DeleteConfirmationComponent } from "../delete-confirmation/delete-confirmation.component";
import { FewPackagesAlertComponent } from "../few-packages-alert/few-packages-alert.component";

enum State {
    INIT,
    LOADING,
    ERROR,
    SUCCESS
}

@Component({
    selector: "my-collections",
    templateUrl: "./my-collections.component.html",
    styleUrls: ["./my-collections.component.scss"]
})
export class MyCollectionsComponent implements OnInit {
    public collections: Collection[] = [];
    columnsToDisplay = ["name", "public", "actions"];
    State = State;
    state = State.INIT;

    constructor(
        private myCollections: MyCollectionsGQL,
        private createCollectionGQL: CreateCollectionGQL,
        private updateCollectionGQL: UpdateCollectionGQL,
        private deleteCollectionGQL: DeleteCollectionGQL,
        private dialog: MatDialog
    ) {}

    ngOnInit(): void {
        this.loadMyCollections();
    }

    openCreateDialog() {
        this.dialog
            .open(CreateCollectionComponent)
            .afterClosed()
            .subscribe((data: any) => {
                this.createCollectionGQL
                    .mutate({
                        value: {
                            name: data.name,
                            collectionSlug: data.name.toLowerCase()
                        }
                    })
                    .subscribe(() => {
                        this.loadMyCollections();
                    });
            });
    }

    private loadMyCollections(): void {
        // Need to set a dynamic limit for future / pagination
        this.state = State.LOADING;
        this.myCollections.fetch({ offSet: 0, limit: 5 }).subscribe(
            (a) => {
                this.collections = a.data.myCollections.collections as Collection[];
                this.state = State.SUCCESS;
            },
            () => {
                this.state = State.ERROR;
            }
        );
    }

    updateCollectionVisibility(collection: Collection, checked: boolean): void {
        this.updateCollectionGQL
            .mutate({
                identifier: {
                    collectionSlug: collection.identifier.collectionSlug
                },
                value: {
                    isPublic: checked
                }
            })
            .subscribe((response) => {
                if (response.errors) {
                    const error = response.errors.find((e) => e.message === "TOO_FEW_PACKAGES");
                    if (error) {
                        this.dialog.open(FewPackagesAlertComponent);
                    }
                    collection.isPublic = !checked;
                    return;
                }

                const newCollection = response.data.updateCollection as Collection;
                this.collections = this.collections.map((collection) =>
                    collection.identifier.collectionSlug === newCollection.identifier.collectionSlug
                        ? newCollection
                        : collection
                );
            });
    }

    deleteCollection(collection: Collection): void {
        this.dialog
            .open(DeleteConfirmationComponent, {
                data: {
                    collectionSlug: collection.identifier.collectionSlug
                }
            })
            .afterClosed()
            .subscribe((confirmed: boolean) => {
                if (confirmed) {
                    this.deleteCollectionGQL
                        .mutate({
                            identifier: {
                                collectionSlug: collection.identifier.collectionSlug
                            }
                        })
                        .subscribe(() => {
                            this.collections = this.collections.filter(
                                (c) => c.identifier.collectionSlug !== collection.identifier.collectionSlug
                            );
                        });
                }
            });
    }

    private showTooFewPackagesModal() {}
}
