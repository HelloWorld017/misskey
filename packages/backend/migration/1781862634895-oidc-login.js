/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class OidcLogin1781862634895 {
    name = 'OidcLogin1781862634895'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "enableOidc" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "oidcIssuer" character varying(1024)`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "oidcClientId" character varying(1024)`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "oidcClientSecret" character varying(1024)`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "oidcScope" character varying(512) NOT NULL DEFAULT 'openid profile email'`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "oidcProviderName" character varying(128) NOT NULL DEFAULT 'OpenID Connect'`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "oidcAutoRegister" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "oidcRequireVerifiedEmail" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(`ALTER TABLE "meta" ADD "oidcUsernameClaim" character varying(128) NOT NULL DEFAULT 'preferred_username'`);
        await queryRunner.query(`CREATE TABLE "user_oidc_link" ("id" character varying(32) NOT NULL, "userId" character varying(32) NOT NULL, "issuer" character varying(1024) NOT NULL, "subject" character varying(1024) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_user_oidc_link_id" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_b5c624733932df5c2eece82dd8" ON "user_oidc_link" ("userId")`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_748941d0d8b45e6d14cf3451dc" ON "user_oidc_link" ("issuer", "subject")`);
        await queryRunner.query(`ALTER TABLE "user_oidc_link" ADD CONSTRAINT "FK_b5c624733932df5c2eece82dd8c" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_profile" ADD "disablePasswordLogin" boolean NOT NULL DEFAULT false`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user_oidc_link" DROP CONSTRAINT "FK_b5c624733932df5c2eece82dd8c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_748941d0d8b45e6d14cf3451dc"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b5c624733932df5c2eece82dd8"`);
        await queryRunner.query(`DROP TABLE "user_oidc_link"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "oidcUsernameClaim"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "oidcRequireVerifiedEmail"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "oidcAutoRegister"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "oidcProviderName"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "oidcScope"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "oidcClientSecret"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "oidcClientId"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "oidcIssuer"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "enableOidc"`);
        await queryRunner.query(`ALTER TABLE "user_profile" DROP COLUMN "disablePasswordLogin"`);
    }
}
