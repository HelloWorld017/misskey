/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import type { UserOidcLinksRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	tags: ['account'],
	requireCredential: true,
	kind: 'write:account',
	secure: true,

	errors: {
		noSuchLink: {
			message: 'No such OIDC link.',
			code: 'NO_SUCH_OIDC_LINK',
			id: '840ac402-6e94-44d1-b377-a3b9ff1525ca',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		linkId: {
			type: 'string',
			format: 'misskey:id',
		},
	},
	required: ['linkId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.userOidcLinksRepository)
		private userOidcLinksRepository: UserOidcLinksRepository,
	) {
		super(meta, paramDef, async (ps, me) => {
			const result = await this.userOidcLinksRepository.delete({
				id: ps.linkId,
				userId: me.id,
			});

			if (result.affected === 0) {
				throw new ApiError(meta.errors.noSuchLink);
			}

			return;
		});
	}
}
