import {MigrationInterface, QueryRunner} from "typeorm";

const SQL = `
    ALTER TABLE collection ADD COLUMN name_tokens TSVECTOR;
    ALTER TABLE collection ADD COLUMN description_tokens TSVECTOR;

    UPDATE collection SET name_tokens = to_tsvector(name), description_tokens = to_tsvector(description);

    CREATE OR REPLACE FUNCTION updateCollectionTokens() RETURNS TRIGGER AS '
        BEGIN
            IF NEW.name IS NOT NULL THEN
                NEW.name_tokens := to_tsvector(NEW.name);
            ELSE
                NEW.name_tokens := NULL;
            END IF;

            IF NEW.description IS NOT NULL THEN
                NEW.description_tokens := to_tsvector(NEW.description);
            ELSE
                NEW.description_tokens := NULL;
            END IF;
        RETURN NEW;
        END'
    LANGUAGE 'plpgsql';
`;

export class CollectionsSearchColumns1600757487059 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        queryRunner.query(SQL);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
    }

}
