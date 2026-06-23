/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as oidc from 'openid-client';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import type { MiMeta } from '@/models/_.js';

export type OidcClaims = oidc.IDToken & Record<string, unknown>;

@Injectable()
export class OidcClientService {
	private configurationCache: {
		issuer: string;
		clientId: string;
		clientSecret: string | null;
		configuration: oidc.Configuration;
	} | null = null;

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.meta)
		private meta: MiMeta,
	) {}

	public get redirectUri(): string {
		return new URL('/api/oidc/callback', this.config.url).toString();
	}

	public get isConfigured(): boolean {
		return this.meta.enableOidc && this.meta.oidcIssuer != null && this.meta.oidcClientId != null;
	}

	public async getConfiguration(): Promise<oidc.Configuration> {
		if (!this.isConfigured) {
			throw new Error('OIDC is not configured');
		}

		const issuer = this.meta.oidcIssuer;
		const clientId = this.meta.oidcClientId;
		const clientSecret = this.meta.oidcClientSecret || null;
		if (issuer == null || clientId == null) {
			throw new Error('OIDC issuer or clientId is not configured');
		}

		if (
			this.configurationCache &&
			this.configurationCache.issuer === issuer &&
			this.configurationCache.clientId === clientId &&
			this.configurationCache.clientSecret === clientSecret
		) {
			return this.configurationCache.configuration;
		}

		const configuration = await oidc.discovery(
			new URL(issuer),
			clientId,
			clientSecret ? { client_secret: clientSecret } : undefined,
			clientSecret ? oidc.ClientSecretPost(clientSecret) : oidc.None(),
			{ timeout: 10 },
		);

		this.configurationCache = {
			issuer,
			clientId,
			clientSecret,
			configuration,
		};

		return configuration;
	}

	public buildAuthorizationUrl(
		configuration: oidc.Configuration,
		params: { state: string; nonce: string; codeChallenge: string },
	): URL {
		return oidc.buildAuthorizationUrl(configuration, {
			redirect_uri: this.redirectUri,
			scope: this.meta.oidcScope,
			state: params.state,
			nonce: params.nonce,
			code_challenge: params.codeChallenge,
			code_challenge_method: 'S256',
		});
	}

	public async authorizationCodeGrant(
		currentUrl: URL,
		params: {
			expectedState?: string;
			expectedNonce?: string;
			pkceCodeVerifier?: string;
		},
	): Promise<OidcClaims | undefined> {
		const configuration = await this.getConfiguration();
		const tokenResponse = await oidc.authorizationCodeGrant(configuration, currentUrl, {
			expectedState: params.expectedState,
			expectedNonce: params.expectedNonce,
			pkceCodeVerifier: params.pkceCodeVerifier,
			idTokenExpected: true,
		});

		const claims = tokenResponse.claims() as OidcClaims | undefined;
		if (claims == null || typeof claims.sub !== 'string' || typeof claims.iss !== 'string') {
			return undefined;
		}

		return claims;
	}
}
