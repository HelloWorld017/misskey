/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { IsNull } from 'typeorm';
import * as oidc from 'openid-client';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import type { MiMeta, UserOidcLinksRepository, UserProfilesRepository, UsersRepository } from '@/models/_.js';
import type { MiLocalUser } from '@/models/User.js';
import { IdService } from '@/core/IdService.js';
import { SignupService } from '@/core/SignupService.js';
import { bindThis } from '@/decorators.js';
import Logger from '@/logger.js';
import { LoggerService } from '@/core/LoggerService.js';
import { SigninService } from './SigninService.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

type OidcState = {
	codeVerifier: string;
	nonce: string;
};

type OidcTicket = {
	userId: string;
};

type OidcClaims = oidc.IDToken & Record<string, unknown>;

@Injectable()
export class OidcSigninApiService {
	private logger: Logger;
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

		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.userOidcLinksRepository)
		private userOidcLinksRepository: UserOidcLinksRepository,

		private idService: IdService,
		private signupService: SignupService,
		private signinService: SigninService,
		private loggerService: LoggerService,
	) {
		this.logger = this.loggerService.getLogger('OidcSignin');
	}

	private get redirectUri(): string {
		return new URL('/api/oidc/callback', this.config.url).toString();
	}

	private get frontendCallbackUri(): string {
		return new URL('/oidc/callback', this.config.url).toString();
	}

	private get isConfigured(): boolean {
		return this.meta.enableOidc && this.meta.oidcIssuer != null && this.meta.oidcClientId != null;
	}

	@bindThis
	private async getConfiguration(): Promise<oidc.Configuration> {
		if (!this.isConfigured) {
			throw new Error('OIDC is not configured');
		}

		const issuer = this.meta.oidcIssuer!;
		const clientId = this.meta.oidcClientId!;
		const clientSecret = this.meta.oidcClientSecret || null;

		if (this.configurationCache && this.configurationCache.issuer === issuer && this.configurationCache.clientId === clientId && this.configurationCache.clientSecret === clientSecret) {
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

	@bindThis
	private redirectToFrontend(reply: FastifyReply, params: Record<string, string>): void {
		const url = new URL(this.frontendCallbackUri);
		for (const [key, value] of Object.entries(params)) {
			url.searchParams.set(key, value);
		}
		reply.code(302).redirect(url.toString());
	}

	@bindThis
	public async login(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
		if (!this.isConfigured) {
			reply.code(404);
			return;
		}

		const configuration = await this.getConfiguration();
		const state = oidc.randomState();
		const nonce = oidc.randomNonce();
		const codeVerifier = oidc.randomPKCECodeVerifier();
		const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

		await this.redisClient.set(
			`oidc:signin:state:${state}`,
			JSON.stringify({ codeVerifier, nonce } satisfies OidcState),
			'EX',
			60 * 10,
		);

		const redirectTo = oidc.buildAuthorizationUrl(configuration, {
			redirect_uri: this.redirectUri,
			scope: this.meta.oidcScope,
			state,
			nonce,
			code_challenge: codeChallenge,
			code_challenge_method: 'S256',
		});

		reply.code(302).redirect(redirectTo.toString());
	}

	@bindThis
	public async callback(request: FastifyRequest, reply: FastifyReply): Promise<void> {
		try {
			if (!this.isConfigured) {
				this.redirectToFrontend(reply, { error: 'not_configured' });
				return;
			}

			const currentUrl = new URL(request.url, this.config.url);
			const state = currentUrl.searchParams.get('state');
			if (state == null) {
				this.redirectToFrontend(reply, { error: 'invalid_state' });
				return;
			}

			const stateKey = `oidc:signin:state:${state}`;
			const stateJson = await this.redisClient.get(stateKey);
			await this.redisClient.del(stateKey);
			if (stateJson == null) {
				this.redirectToFrontend(reply, { error: 'invalid_state' });
				return;
			}

			const savedState = JSON.parse(stateJson) as OidcState;
			const configuration = await this.getConfiguration();
			const tokenResponse = await oidc.authorizationCodeGrant(configuration, currentUrl, {
				expectedState: state,
				expectedNonce: savedState.nonce,
				pkceCodeVerifier: savedState.codeVerifier,
				idTokenExpected: true,
			});

			const claims = tokenResponse.claims() as OidcClaims | undefined;
			if (claims == null || typeof claims.sub !== 'string' || typeof claims.iss !== 'string') {
				this.redirectToFrontend(reply, { error: 'invalid_claims' });
				return;
			}

			const user = await this.findOrCreateUser(claims);
			if (user == null) {
				this.redirectToFrontend(reply, { error: 'account_not_linked' });
				return;
			}

			if (user.isSuspended) {
				this.redirectToFrontend(reply, { error: 'suspended' });
				return;
			}

			const ticket = oidc.randomState();
			await this.redisClient.set(
				`oidc:signin:ticket:${ticket}`,
				JSON.stringify({ userId: user.id } satisfies OidcTicket),
				'EX',
				60,
			);

			this.redirectToFrontend(reply, { ticket });
		} catch (err) {
			this.logger.warn(`OIDC callback failed: ${err instanceof Error ? err.message : String(err)}`);
			this.redirectToFrontend(reply, { error: 'signin_failed' });
		}
	}

	@bindThis
	private async findOrCreateUser(claims: OidcClaims): Promise<MiLocalUser | null> {
		const link = await this.userOidcLinksRepository.findOneBy({
			issuer: claims.iss as string,
			subject: claims.sub,
		});

		if (link != null) {
			return await this.usersRepository.findOneBy({ id: link.userId, host: IsNull() }) as MiLocalUser | null;
		}

		if (!this.meta.oidcAutoRegister) {
			return null;
		}

		if (this.meta.oidcRequireVerifiedEmail && claims.email_verified !== true) {
			return null;
		}

		const username = await this.createAvailableUsername(claims);
		const { account } = await this.signupService.signup({
			username,
			passwordHash: null,
		});

		await this.userOidcLinksRepository.insertOne({
			id: this.idService.gen(),
			userId: account.id,
			issuer: claims.iss as string,
			subject: claims.sub,
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		if (typeof claims.email === 'string' && claims.email_verified === true) {
			await this.userProfilesRepository.update({ userId: account.id }, {
				email: claims.email,
				emailVerified: true,
				emailVerifyCode: null,
			});
		}

		return account as MiLocalUser;
	}

	@bindThis
	private async createAvailableUsername(claims: OidcClaims): Promise<string> {
		const claimName = this.meta.oidcUsernameClaim;
		const raw = typeof claims[claimName] === 'string'
			? claims[claimName]
			: typeof claims.preferred_username === 'string'
				? claims.preferred_username
				: typeof claims.nickname === 'string'
					? claims.nickname
					: typeof claims.email === 'string'
						? claims.email.split('@')[0]
						: `oidc_${claims.sub}`;

		const base = raw.replace(/\W/g, '_').replace(/^_+|_+$/g, '').slice(0, 20) || 'oidcuser';
		for (let i = 0; i < 100; i++) {
			const suffix = i === 0 ? '' : `_${i}`;
			const username = `${base.slice(0, 20 - suffix.length)}${suffix}`;
			const exists = await this.usersRepository.exists({ where: { usernameLower: username.toLowerCase(), host: IsNull() } });
			if (!exists) {
				return username;
			}
		}

		return `oidc_${this.idService.gen().slice(0, 15)}`;
	}

	@bindThis
	public async consume(
		request: FastifyRequest<{
			Body: {
				ticket: string;
			};
		}>,
		reply: FastifyReply,
	) {
		reply.header('Access-Control-Allow-Origin', this.config.url);
		reply.header('Access-Control-Allow-Credentials', 'true');

		const ticket = request.body.ticket;
		if (typeof ticket !== 'string') {
			reply.code(400);
			return;
		}

		const ticketKey = `oidc:signin:ticket:${ticket}`;
		const ticketJson = await this.redisClient.get(ticketKey);
		await this.redisClient.del(ticketKey);

		if (ticketJson == null) {
			reply.code(403);
			return {
				error: {
					message: 'OIDC sign-in ticket is invalid or expired.',
					code: 'INVALID_OIDC_SIGNIN_TICKET',
					id: '8e81c809-38b1-48a5-bb8d-9731c4e27b71',
				},
			};
		}

		const savedTicket = JSON.parse(ticketJson) as OidcTicket;
		const user = await this.usersRepository.findOneBy({
			id: savedTicket.userId,
			host: IsNull(),
		}) as MiLocalUser | null;

		if (user == null || user.isSuspended) {
			reply.code(403);
			return;
		}

		return this.signinService.signin(request, reply, user);
	}
}
