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
import { OidcClientService, type OidcClaims } from '@/core/OidcClientService.js';
import { OidcLinkApiService } from '@/core/OidcLinkApiService.js';
import { SigninService } from './SigninService.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

type OidcSigninState = {
	codeVerifier: string;
	nonce: string;
};

type OidcTicket = {
	userId: string;
};

type OidcLinkState = {
	codeVerifier: string;
	nonce: string;
	userId: string;
};

@Injectable()
export class OidcSigninApiService {
	private logger: Logger;

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
		private oidcClientService: OidcClientService,
		private oidcLinkApiService: OidcLinkApiService,
	) {
		this.logger = this.loggerService.getLogger('OidcSignin');
	}

	private get frontendCallbackUri(): string {
		return new URL('/oidc/callback', this.config.url).toString();
	}

	private get settingsCallbackUri(): string {
		return new URL('/settings/security', this.config.url).toString();
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
	private redirectToSettings(reply: FastifyReply, params: Record<string, string>): void {
		const url = new URL(this.settingsCallbackUri);
		for (const [key, value] of Object.entries(params)) {
			url.searchParams.set(key, value);
		}
		reply.code(302).redirect(url.toString());
	}

	@bindThis
	public async login(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
		if (!this.oidcClientService.isConfigured) {
			reply.code(404);
			return;
		}

		const configuration = await this.oidcClientService.getConfiguration();
		const state = oidc.randomState();
		const nonce = oidc.randomNonce();
		const codeVerifier = oidc.randomPKCECodeVerifier();
		const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

		await this.redisClient.set(
			`oidc:signin:state:${state}`,
			JSON.stringify({ codeVerifier, nonce } satisfies OidcSigninState),
			'EX',
			60 * 10,
		);

		const redirectTo = this.oidcClientService.buildAuthorizationUrl(configuration, {
			state,
			nonce,
			codeChallenge,
		});

		reply.code(302).redirect(redirectTo.toString());
	}

	@bindThis
	public async callback(request: FastifyRequest, reply: FastifyReply): Promise<void> {
		try {
			if (!this.oidcClientService.isConfigured) {
				this.redirectToFrontend(reply, { error: 'not_configured' });
				return;
			}

			const currentUrl = new URL(request.url, this.config.url);
			const state = currentUrl.searchParams.get('state');
			if (state == null) {
				this.redirectToFrontend(reply, { error: 'invalid_state' });
				return;
			}

			const signinKey = `oidc:signin:state:${state}`;
			const signinStateJson = await this.redisClient.get(signinKey);
			if (signinStateJson != null) {
				await this.redisClient.del(signinKey);
				await this.signinCallback(reply, currentUrl, state, signinStateJson);
				return;
			}

			const linkState = await this.oidcLinkApiService.readState(state);
			if (linkState != null) {
				await this.oidcLinkApiService.deleteState(state);
				await this.linkCallback(reply, currentUrl, state, linkState);
				return;
			}

			this.redirectToFrontend(reply, { error: 'invalid_state' });
		} catch (err) {
			this.logger.warn(`OIDC callback failed: ${err instanceof Error ? err.message : String(err)}`);
			this.redirectToFrontend(reply, { error: 'signin_failed' });
		}
	}

	@bindThis
	private async signinCallback(reply: FastifyReply, currentUrl: URL, state: string, stateJson: string): Promise<void> {
		const savedState = JSON.parse(stateJson) as OidcSigninState;

		const claims = await this.oidcClientService.authorizationCodeGrant(currentUrl, {
			expectedState: state,
			expectedNonce: savedState.nonce,
			pkceCodeVerifier: savedState.codeVerifier,
		});

		if (claims == null) {
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
	}

	@bindThis
	private async linkCallback(reply: FastifyReply, currentUrl: URL, state: string, linkState: OidcLinkState): Promise<void> {
		try {
			const claims = await this.oidcClientService.authorizationCodeGrant(currentUrl, {
				expectedState: state,
				expectedNonce: linkState.nonce,
				pkceCodeVerifier: linkState.codeVerifier,
			});

			if (claims == null) {
				this.redirectToSettings(reply, { oidcLink: 'invalid_claims' });
				return;
			}

			const user = await this.usersRepository.findOneBy({
				id: linkState.userId,
				host: IsNull(),
			}) as MiLocalUser | null;

			if (user == null || user.isSuspended) {
				this.redirectToSettings(reply, { oidcLink: 'failed' });
				return;
			}

			const existingLink = await this.userOidcLinksRepository.findOneBy({
				issuer: claims.iss as string,
				subject: claims.sub,
			});

			if (existingLink != null && existingLink.userId !== user.id) {
				this.redirectToSettings(reply, { oidcLink: 'already_linked' });
				return;
			}

			if (existingLink == null) {
				await this.userOidcLinksRepository.insertOne({
					id: this.idService.gen(),
					userId: user.id,
					issuer: claims.iss as string,
					subject: claims.sub,
					createdAt: new Date(),
					updatedAt: new Date(),
				});
			}

			this.redirectToSettings(reply, { oidcLink: 'success' });
		} catch (err) {
			this.logger.warn(`OIDC link callback failed: ${err instanceof Error ? err.message : String(err)}`);
			this.redirectToSettings(reply, { oidcLink: 'failed' });
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
