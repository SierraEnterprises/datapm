import { Component, Inject, OnInit } from "@angular/core";
import { MatDialogRef, MAT_DIALOG_DATA } from "@angular/material/dialog";

export interface DeleteConfirmationData {
    catalogSlug: string;
}

@Component({
    selector: "app-delete-confirmation",
    templateUrl: "./delete-confirmation.component.html",
    styleUrls: ["./delete-confirmation.component.scss"]
})
export class DeleteConfirmationComponent implements OnInit {
    confirmVal: string = "";
    type: string;
    constructor(
        @Inject(MAT_DIALOG_DATA) public data: DeleteConfirmationData,
        private dialogRef: MatDialogRef<DeleteConfirmationComponent>
    ) {}

    ngOnInit(): void {
        if (this.data.hasOwnProperty("catalogSlug")) this.type = "catalog";
        if (this.data.hasOwnProperty("collectionSlug")) this.type = "collection";
    }

    confirm() {
        this.dialogRef.close(true);
    }
}
