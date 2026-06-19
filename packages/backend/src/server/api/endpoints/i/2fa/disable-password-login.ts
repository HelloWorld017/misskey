/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import type { UserOidcLinksRepository, UserProfilesRepository } from '@/models/_.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '../../../error.js';

export const meta = {
	requireCredential: true,

	secure: true,

	errors: {
		noOidcLink: {
			message: 'No OIDC link. Disabling password login requires an alternative login method.',
			code: 'NO_OIDC_LINK',
			id: 'e4a1c7b2-9d3f-4e8a-b6c5-1f2d3e4f5a6b',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		value: { type: 'boolean' },
	},
	required: ['value'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.userOidcLinksRepository)
		private userOidcLinksRepository: UserOidcLinksRepository,

		private userEntityService: UserEntityService,
		private globalEventService: GlobalEventService,
	) {
		super(meta, paramDef, async (ps, me) => {
			if (ps.value === true) {
				const oidcLinkCount = await this.userOidcLinksRepository.countBy({ userId: me.id });
				if (oidcLinkCount === 0) {
					throw new ApiError(meta.errors.noOidcLink);
				}
			}

			await this.userProfilesRepository.update(me.id, {
				disablePasswordLogin: ps.value,
			});

			this.globalEventService.publishMainStream(me.id, 'meUpdated', await this.userEntityService.pack(me.id, me, {
				schema: 'MeDetailed',
				includeSecrets: true,
			}));
		});
	}
}
