import { Component, OnInit, OnDestroy } from "@angular/core";
import { ActivatedRoute, ParamMap, Router } from "@angular/router";
import { FormControl } from "@angular/forms";
import { takeUntil, startWith, map, filter, debounceTime, switchMap } from "rxjs/operators";
import { Subject, Observable, BehaviorSubject } from "rxjs";

import { AuthenticationService } from "../../services/authentication.service";
import { DialogService } from "../../services/dialog.service";
import { AutoCompleteGQL, AutoCompleteResult, User } from "src/generated/graphql";
import { MatDialog } from "@angular/material/dialog";
import { LoginDialogComponent } from "./login-dialog/login-dialog.component";
import { SignUpDialogComponent } from "./sign-up-dialog/sign-up-dialog.component";
import { ForgotPasswordDialogComponent } from "./forgot-password-dialog/forgot-password-dialog.component";

enum State {
    INIT,
    LOADING,
    ERROR,
    SUCCESS,
    ERROR_NOT_UNIQUE
}

interface Option {
    package?: string;
    collection?: string;
}
@Component({
    selector: "sd-header",
    templateUrl: "./header.component.html",
    styleUrls: ["./header.component.scss"]
})
export class HeaderComponent implements OnInit, OnDestroy {
    state = State.INIT;

    currentUser: User;
    searchControl: FormControl;
    private subscription = new Subject();

    autoCompleteResult: AutoCompleteResult;

    constructor(
        private matDialog: MatDialog,
        private dialog: DialogService,
        private router: Router,
        private route: ActivatedRoute,
        private authenticationService: AuthenticationService,
        private autocomplete: AutoCompleteGQL
    ) {
        this.searchControl = new FormControl("");
    }

    ngOnInit(): void {
        this.searchControl.valueChanges
            .pipe(
                debounceTime(500),
                switchMap((value) => {
                    if (value.length < 2) {
                        this.autoCompleteResult = null;
                        return [];
                    }
                    return this.autocomplete.fetch({ startsWith: value });
                })
            )
            .subscribe((result) => {
                if (result.errors != null) this.autoCompleteResult = null;
                else this.autoCompleteResult = result.data.autoComplete;
            });

        this.route.queryParamMap.pipe(takeUntil(this.subscription)).subscribe((queryParams: ParamMap) => {
            this.searchControl.setValue(queryParams.get("q") || "");
        });
        this.authenticationService.currentUser.pipe(takeUntil(this.subscription)).subscribe((user: User) => {
            this.currentUser = user;
            if (user) {
                this.state = State.SUCCESS;
            }
        });
        this.dialog.actions.pipe(takeUntil(this.subscription)).subscribe((action: string) => {
            switch (action) {
                case "login":
                    this.matDialog.open(LoginDialogComponent, {
                        disableClose: true
                    });
                    break;
                case "forgotPassword":
                    this.matDialog.open(ForgotPasswordDialogComponent, {
                        disableClose: true
                    });
                    break;
                case "signup":
                    const signupDialogRef = this.matDialog.open(SignUpDialogComponent, {
                        disableClose: true
                    });
                    signupDialogRef.afterClosed().subscribe((result?: string) => {
                        if (result === "forgotPassword") {
                            this.dialog.openForgotPasswordDialog();
                        }
                    });
                    break;
                case "closeAll":
                    this.matDialog.closeAll();
                    break;
                default:
                    break;
            }
        });
    }

    autoComplete(val: string) {
        this.autocomplete.fetch({ startsWith: val }).subscribe(({ data }) => {
            if (!data) return;
            this.autoCompleteResult = data.autoComplete;
        });
    }

    ngOnDestroy(): void {
        this.subscription.unsubscribe();
    }

    openLoginDialog() {
        this.dialog.openLoginDialog();
    }

    openSignUpDialog() {
        this.dialog.openSignupDialog();
    }

    search() {
        this.router.navigate(["/search"], { queryParams: { q: this.searchControl.value } });
    }

    goHome() {
        this.router.navigate(["/"]);
    }

    goToMyDetails() {
        this.router.navigate([this.currentUser?.username]);
    }

    logout() {
        this.authenticationService.logout();
        setTimeout(() => (this.currentUser = null), 500);
        this.router.navigate(["/"]);
    }

    autoCompleteOptionSelected(event) {
        this.router.navigate(["/" + event.option.value]);
        this.searchControl.setValue("");
        this.autoCompleteResult = null;
    }
}
