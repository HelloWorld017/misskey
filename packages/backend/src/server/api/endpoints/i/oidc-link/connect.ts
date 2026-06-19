/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { OidcClientService } from '@/core/OidcClientService.js';
import { OidcLinkApiService } from '@/core/OidcLinkApiService.js';

export const meta = {
	tags: ['account'],
	requireCredential: true,
	kind: 'write:account',
	secure: true,

	errors: {
		notConfigured: {
			message: 'OIDC is not configured.',
			code: 'OIDC_NOT_CONFIGURED',
			id: '92a92e91-7f4e-479f-b80b-59f3ab4b2709',
		},
	},

	res: {
		type: 'object',
		optional: false,
		nullable: false,
		properties: {
			url: {
				type: 'string',
			},
		},
		required: ['url'],
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private oidcClientService: OidcClientService,
		private oidcLinkApiService: OidcLinkApiService,
	) {
		super(meta, paramDef, async (_ps, me) => {
			if (!this.oidcClientService.isConfigured) {
				throw new ApiError(meta.errors.notConfigured);
			}

			const url = await this.oidcLinkApiService.start(me.id);
			return { url };
		});
	}
}
