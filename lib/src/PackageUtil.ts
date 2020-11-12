import { SemVer } from "semver";
import { Schema, PackageFile } from "./main";

export enum Compability {
    Identical = 0,
    MinorChange = 1,
    CompatibleChange = 2,
    BreakingChange = 3
}

export interface Comparison {
    compatibility: Compability;
    differences: Difference[];
}

export interface Difference {
    type: DifferenceType;
    pointer: string;
}

export enum DifferenceType {
    REMOVE_SCHEMA = "REMOVE_SCHEMA",
    ADD_SCHEMA = "ADD_SCHEMA",
    CHANGE_PACKAGE_DISPLAY_NAME = "CHANGE_PACKAGE_DISPLAY_NAME",
    CHANGE_PACKAGE_DESCRIPTION = "CHANGE_PACKAGE_DESCRIPTION",
    CHANGE_SOURCE = "CHANGE_SOURCE",
    CHANGE_PARSER = "CHANGE_PARSER",
    ADD_PROPERTY = "ADD_PROPERTY",
    REMOVE_PROPERTY = "REMOVE_PROPERTY",
    CHANGE_PROPERTY_TYPE = "CHANGE_PROPERTY_TYPE",
    CHANGE_PROPERTY_FORMAT = "CHANGE_PROPERTY_FORMAT",
    CHANGE_PROPERTY_DESCRIPTION = "CHANGE_PROPERTY_DESCRIPTION",
    CHANGE_GENERATED_BY = "CHANGE_GENERATED_BY",
    CHANGE_UPDATED_DATE = "CHANGE_UPDATED_DATE",
    CHANGE_VERSION = "CHANGE_VERSION"
}

export function leastCompatible(a: Compability, b: Compability) {
    if (a == b) return a;

    if (a < b) return b;

    return a;
}

function u(condition: boolean, newValue: Compability, existingValue: Compability): Compability {
    if (!condition) {
        return leastCompatible(newValue, existingValue);
    }

    return Compability.BreakingChange;
}

/** Compare to provided package files, and find the Difference values between the objects
 */
export function comparePackages(packageA: PackageFile, packageB: PackageFile): Difference[] {
    let response: Difference[] = [];

    // do not consider packageSlug
    if (packageA.description != packageB.description)
        response.push({
            type: DifferenceType.CHANGE_PACKAGE_DESCRIPTION,
            pointer: "#"
        });

    if (packageA.displayName != packageB.displayName)
        response.push({
            type: DifferenceType.CHANGE_PACKAGE_DISPLAY_NAME,
            pointer: "#"
        });

    // Do not consider generated by
    if (packageA.generatedBy != packageB.generatedBy)
        response.push({ type: DifferenceType.CHANGE_GENERATED_BY, pointer: "#" });

    // Do not consider updated date
    if (packageA.updatedDate != packageA.updatedDate)
        response.push({ type: DifferenceType.CHANGE_UPDATED_DATE, pointer: "#" });

    response = response.concat(compareSchemas(packageA.schemas, packageB.schemas));

    return response;
}

/** Given two sets of schemas, compares forward compatibility only */
export function compareSchemas(priorSchemas: Schema[], newSchemas: Schema[]): Difference[] {
    let response: Difference[] = [];
    for (const schemaA of priorSchemas) {
        let found = false;

        for (const schemaB of newSchemas) {
            if (schemaA.title != schemaB.title) continue;

            found = true;

            // Math.min not a typo - looking for "most compatibile schema comparison",
            // because we're not defining which prior and new schema must be compared
            response = response.concat(compareSchema(schemaA, schemaB, "#"));
        }

        if (!found)
            response.push({
                type: DifferenceType.REMOVE_SCHEMA,
                pointer: ""
            });
    }

    return response;
}

/** Compare two individual schemas, returning the least
 * compatiblility of their features.
 */
export function compareSchema(priorSchema: Schema, newSchema: Schema, pointer: string = "#"): Difference[] {
    let response: Difference[] = [];

    // Do not consider title comparison - assumes intent to compare
    // priorSchema.title != newSchema.title

    pointer += "/" + newSchema.title;

    if (priorSchema.description != newSchema.description)
        response.push({
            type: DifferenceType.CHANGE_PROPERTY_DESCRIPTION,
            pointer
        });

    if (Array.isArray(priorSchema.type) && Array.isArray(newSchema.type)) {
        if (!priorSchema.type.every((v) => newSchema.type?.indexOf(v) != -1))
            response.push({ type: DifferenceType.CHANGE_PROPERTY_TYPE, pointer });
    } else if (!Array.isArray(priorSchema.type) && !Array.isArray(newSchema.type)) {
        if (priorSchema.type != newSchema.type) response.push({ type: DifferenceType.CHANGE_PROPERTY_TYPE, pointer });
    } else {
        response.push({ type: DifferenceType.CHANGE_PROPERTY_TYPE, pointer });
    }

    if (priorSchema.type == "string" && priorSchema.format != newSchema.format)
        response.push({ type: DifferenceType.CHANGE_PROPERTY_FORMAT, pointer });

    if (priorSchema.type == "object") {
        if (priorSchema.properties == null)
            throw new Error("Prior Schema property type is object, but has no properties");

        if (newSchema.properties == null) throw new Error("New Schema property type is object, but has no properties");

        // forward comparison of properties
        for (const priorKey of Object.keys(priorSchema.properties)) {
            const propertyPointer = pointer + "/properties";
            const newKeys = Object.keys(newSchema.properties!);

            if (newKeys.indexOf(priorKey) == -1) {
                response.push({
                    type: DifferenceType.REMOVE_PROPERTY,
                    pointer: pointer
                });
                break;
            }

            const priorProperty = priorSchema.properties[priorKey];

            const newProperty = newSchema.properties[priorKey];

            response = response.concat(compareSchema(priorProperty, newProperty, propertyPointer));
        }

        // Compare in reverse, as a compatible change
        for (const newKey of Object.keys(newSchema.properties)) {
            const priorKeys = Object.keys(priorSchema.properties);
            const propertyPointer = pointer + "/properties/" + newKey;

            if (priorKeys.indexOf(newKey) == -1) {
                response.push({
                    type: DifferenceType.ADD_PROPERTY,
                    pointer: propertyPointer
                });
            }
        }
    }

    if (priorSchema.source == null && newSchema.source != null) {
        response.push({ type: DifferenceType.CHANGE_SOURCE, pointer: pointer });
    } else if (newSchema.source == null && priorSchema.source != null) {
        response.push({ type: DifferenceType.CHANGE_SOURCE, pointer: pointer });
    } else if (priorSchema.source != null && newSchema.source != null) {
        if (priorSchema.source.protocol != newSchema.source.protocol) {
            response.push({ type: DifferenceType.CHANGE_SOURCE, pointer: pointer });
        } else {
            const configComparison = compareConfigObjects(
                priorSchema.source.configuration,
                newSchema.source.configuration
            );

            if (!configComparison) response.push({ type: DifferenceType.CHANGE_SOURCE, pointer: pointer });
        }
    }

    if (priorSchema.parser == null && newSchema.parser != null) {
        response.push({ type: DifferenceType.CHANGE_PARSER, pointer: pointer });
    } else if (newSchema.parser == null && priorSchema.parser != null) {
        response.push({ type: DifferenceType.CHANGE_PARSER, pointer: pointer });
    } else if (priorSchema.parser != null && newSchema.parser != null) {
        if (priorSchema.parser.configuration != newSchema.parser.configuration) {
            response.push({ type: DifferenceType.CHANGE_PARSER, pointer: pointer });
        } else {
            const configComparison = compareConfigObjects(
                priorSchema.parser.configuration,
                newSchema.parser.configuration
            );

            if (!configComparison) response.push({ type: DifferenceType.CHANGE_PARSER, pointer: pointer });
        }
    }

    return response;
}

/** Retuns whether the two objects are identical or not */
export function compareConfigObjects(priorObject: any, newObject: any): boolean {
    if (priorObject == null && newObject == null) return true;

    const newKeys: string[] = Object.keys(newObject);

    for (const priorKey of Object.keys(priorObject)) {
        if (newKeys.indexOf(priorKey) == -1) return false;

        const priorValue = priorObject[priorKey];

        const newValue = newObject[priorKey];

        if (typeof priorValue != typeof newValue) return false;

        if (typeof priorValue == "object")
            if (!compareConfigObjects(priorValue, newValue)) return false;
            else if (priorValue != newValue) return false;
    }

    return true;
}

/** Given a set of differences from a schema comparison, return the compatibility */
export function diffCompatibility(diffs: Difference[]): Compability {
    let returnValue = Compability.Identical;

    diffs.forEach((d) => {
        switch (d.type) {
            case DifferenceType.REMOVE_PROPERTY:
            case DifferenceType.REMOVE_SCHEMA:
            case DifferenceType.CHANGE_PROPERTY_FORMAT:
            case DifferenceType.CHANGE_PROPERTY_TYPE:
                returnValue = Compability.BreakingChange;
                break;

            case DifferenceType.ADD_PROPERTY:
            case DifferenceType.ADD_SCHEMA:
                returnValue = Math.max(returnValue, Compability.CompatibleChange);
                break;

            case DifferenceType.CHANGE_PACKAGE_DESCRIPTION:
            case DifferenceType.CHANGE_PACKAGE_DISPLAY_NAME:
            case DifferenceType.CHANGE_PARSER:
            case DifferenceType.CHANGE_PROPERTY_DESCRIPTION:
            case DifferenceType.CHANGE_SOURCE:
                returnValue = Math.max(returnValue, Compability.MinorChange);
                break;

            case DifferenceType.CHANGE_VERSION:
            case DifferenceType.CHANGE_GENERATED_BY:
            case DifferenceType.CHANGE_UPDATED_DATE:
                //nothing to do
                break;

            default:
                throw new Error("Diff type " + d.type + " not mapped");
        }
    });

    return returnValue;
}

export function nextVersion(currentVersion: SemVer, diffCompatibility: Compability): SemVer {
    const copy = new SemVer(currentVersion.version);

    switch (diffCompatibility) {
        case Compability.BreakingChange:
            return copy.inc("major");

        case Compability.CompatibleChange:
            return copy.inc("minor");

        case Compability.MinorChange:
            return copy.inc("patch");

        case Compability.Identical:
            return copy;

        default:
            throw new Error("Unrecognized compability " + diffCompatibility);
    }
}

export function compatibilityToString(compatibility: Compability): string {
    switch (compatibility) {
        case Compability.BreakingChange:
            return "breaking";
        case Compability.CompatibleChange:
            return "compatibile";
        case Compability.MinorChange:
            return "minor";
        case Compability.Identical:
            return "no";
        default:
            throw new Error("Compatibility " + compatibility + " not recognized");
    }
}

/** Validate catalog slug */
export function validateCatalogSlug(slug: String | undefined): boolean {
    const regExp = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

    if (slug === undefined) return false;

    return !!slug.match(regExp);
}

/** Validate package slug */
export function validatePackageSlug(slug: String | undefined): boolean {
    const regExp = /^[a-z0-9]+(?:(?:(?:[._]|__|[-]*)[a-z0-9]+)+)?$/;

    if (slug === undefined) return false;

    return !!slug.match(regExp);
}