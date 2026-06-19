/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { UserOidcLinksRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	tags: ['account'],
	requireCredential: true,
	kind: 'read:account',

	res: {
		type: 'array',
		items: {
			type: 'object',
			properties: {
				id: {
					type: 'string',
					format: 'misskey:id',
				},
				issuer: {
					type: 'string',
				},
				createdAt: {
					type: 'string',
					format: 'date-time',
				},
			},
			required: ['id', 'issuer', 'createdAt'],
		},
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
		@Inject(DI.userOidcLinksRepository)
		private userOidcLinksRepository: UserOidcLinksRepository,
	) {
		super(meta, paramDef, async (_ps, me) => {
			const links = await this.userOidcLinksRepository.find({
				where: { userId: me.id },
				select: { id: true, issuer: true, createdAt: true },
				order: { createdAt: 'DESC' },
			});

			return links.map(link => ({
				id: link.id,
				issuer: link.issuer,
				createdAt: link.createdAt.toISOString(),
			}));
		});
	}
}
