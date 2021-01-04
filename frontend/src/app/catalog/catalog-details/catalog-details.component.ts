import { Component, OnInit } from "@angular/core";
import { Catalog, GetCatalogGQL, Package, Permission } from "src/generated/graphql";
import { ActivatedRoute } from "@angular/router";
import { MatDialog } from "@angular/material/dialog";
import { EditCatalogComponent } from "src/app/shared/edit-catalog/edit-catalog.component";
import { PageState } from "src/app/models/page-state";
import { DialogService } from "../../services/dialog.service";

@Component({
    selector: "app-catalog-details",
    templateUrl: "./catalog-details.component.html",
    styleUrls: ["./catalog-details.component.scss"]
})
export class CatalogDetailsComponent implements OnInit {
    public catalogSlug = "";
    public catalog: Catalog;
    public state: PageState | "CATALOG_NOT_FOUND" | "NOT_AUTHENTICATED" = "INIT";
    public currentTab = 0;

    constructor(
        private getCatalogGQL: GetCatalogGQL,
        private dialog: MatDialog,
        private route: ActivatedRoute,
        private dialogService: DialogService
    ) {}

    ngOnInit(): void {
        this.catalogSlug = this.route.snapshot.paramMap.get("catalogSlug");
        this.state = "LOADING";
        this.getCatalogGQL.fetch({ identifier: { catalogSlug: this.catalogSlug } }).subscribe(({ data, errors }) => {
            if (errors) {
                if (errors[0].message === "CATALOG_NOT_FOUND") {
                    this.state = "CATALOG_NOT_FOUND";
                } else if (errors.find((e) => e.message.includes("NOT_AUTHENTICATED"))) {
                    this.state = "NOT_AUTHENTICATED";
                } else {
                    this.state = "ERROR";
                }
                return;
            }

            this.catalog = data.catalog as Catalog;
            this.state = "SUCCESS";
            console.log(this.catalog);
        });
    }

    editCatalog() {
        this.dialog
            .open(EditCatalogComponent, {
                data: this.catalog
            })
            .afterClosed()
            .subscribe((newCatalog: Catalog) => {
                if (newCatalog) {
                    this.catalog = newCatalog;
                }
            });
    }

    loginClicked() {
        this.dialogService.openLoginDialog();
    }

    removePackage(p: Package) {
        // this.removePackageFromCollectionGQL
        //     .mutate({
        //         collectionIdentifier: {
        //             collectionSlug: this.collectionSlug
        //         },
        //         packageIdentifier: {
        //             catalogSlug: p.identifier.catalogSlug,
        //             packageSlug: p.identifier.packageSlug
        //         }
        //     })
        //     .subscribe(() => {
        //         this.getCollectionDetails();
        //     });
    }

    public get canManage() {
        return this.catalog && this.catalog.myPermissions?.includes(Permission.MANAGE);
    }

    public get canEdit() {
        return this.catalog && this.catalog.myPermissions?.includes(Permission.EDIT);
    }
}
