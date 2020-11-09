import { Component, OnDestroy } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { Subject } from "rxjs";
import { takeUntil } from "rxjs/operators";

@Component({
    selector: "package",
    templateUrl: "./package.component.html",
    styleUrls: ["./package.component.scss"]
})
export class PackageComponent implements OnDestroy {
    public routes = [];
    public selectedTab = 0;

    private subscription = new Subject();

    constructor(private router: Router, private route: ActivatedRoute) {}

    ngOnInit() {
        const catalogSlug = this.route.snapshot.paramMap.get("catalogSlug");
        const packageSlug = this.route.snapshot.paramMap.get("packageSlug");
        const prefix = `${catalogSlug}/${packageSlug}`;

        this.routes = [
            { linkName: "details", url: prefix },
            { linkName: "schema", url: prefix + "/schema" },
            { linkName: "version", url: prefix + "/version" }
        ];

        this.selectTab(0);
    }

    ngOnDestroy(): void {
        this.subscription.unsubscribe();
    }

    public selectTab(index) {
        this.router.navigate([this.routes[index].url]);
        this.selectedTab = index;
    }
}