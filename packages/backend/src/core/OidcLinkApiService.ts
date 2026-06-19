/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import * as oidc from 'openid-client';
import { DI } from '@/di-symbols.js';
import { OidcClientService } from './OidcClientService.js';

type OidcLinkState = {
	codeVerifier: string;
	nonce: string;
	userId: string;
};

@Injectable()
export class OidcLinkApiService {
	constructor(
		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		private oidcClientService: OidcClientService,
	) {}

	public async start(userId: string): Promise<string> {
		if (!this.oidcClientService.isConfigured) {
			throw new Error('OIDC is not configured');
		}

		const configuration = await this.oidcClientService.getConfiguration();
		const state = oidc.randomState();
		const nonce = oidc.randomNonce();
		const codeVerifier = oidc.randomPKCECodeVerifier();
		const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

		await this.redisClient.set(
			`oidc:link:state:${state}`,
			JSON.stringify({ codeVerifier, nonce, userId } satisfies OidcLinkState),
			'EX',
			60 * 10,
		);

		const url = this.oidcClientService.buildAuthorizationUrl(configuration, {
			state,
			nonce,
			codeChallenge,
		});

		return url.toString();
	}

	public async readState(state: string): Promise<OidcLinkState | null> {
		const json = await this.redisClient.get(`oidc:link:state:${state}`);
		if (json == null) return null;
		return JSON.parse(json) as OidcLinkState;
	}

	public async deleteState(state: string): Promise<void> {
		await this.redisClient.del(`oidc:link:state:${state}`);
	}
}
