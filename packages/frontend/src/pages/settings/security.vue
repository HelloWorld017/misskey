<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker path="/settings/security" :label="i18n.ts.security" :keywords="['security']" icon="ti ti-lock" :inlining="['2fa']">
	<div class="_gaps_m">
		<MkFeatureBanner icon="/fluent-emoji/1f510.png" color="#ffbf00">
			<SearchText>{{ i18n.ts._settings.securityBanner }}</SearchText>
		</MkFeatureBanner>

		<SearchMarker :keywords="['password']">
			<FormSection first>
				<template #label><SearchLabel>{{ i18n.ts.password }}</SearchLabel></template>

				<SearchMarker>
					<MkButton primary @click="change()">
						<SearchLabel>{{ i18n.ts.changePassword }}</SearchLabel>
					</MkButton>
				</SearchMarker>
			</FormSection>
		</SearchMarker>

		<X2fa/>

		<SearchMarker :keywords="['signin', 'login', 'history', 'log']">
			<FormSection>
				<template #label><SearchLabel>{{ i18n.ts.signinHistory }}</SearchLabel></template>
				<MkPagination :paginator="paginator" withControl :forceDisableInfiniteScroll="true">
					<template #default="{items}">
						<div>
							<div v-for="item in items" :key="item.id" v-panel class="timnmucd">
								<header>
									<i v-if="item.success" class="ti ti-check icon succ"></i>
									<i v-else class="ti ti-circle-x icon fail"></i>
									<code class="ip _monospace">{{ item.ip }}</code>
									<MkTime :time="item.createdAt" class="time"/>
								</header>
							</div>
						</div>
					</template>
				</MkPagination>
			</FormSection>
		</SearchMarker>

		<SearchMarker :keywords="['regenerate', 'refresh', 'reset', 'token']">
			<FormSection>
				<FormSlot>
					<MkButton danger @click="regenerateToken"><i class="ti ti-refresh"></i> <SearchLabel>{{ i18n.ts.regenerateLoginToken }}</SearchLabel></MkButton>
					<template #caption>{{ i18n.ts.regenerateLoginTokenDescription }}</template>
				</FormSlot>
			</FormSection>
		</SearchMarker>

		<SearchMarker :keywords="['oidc', 'openid', 'link', 'connect']">
			<FormSection>
				<template #label><SearchLabel>{{ i18n.ts.oidcAccountLink }}</SearchLabel></template>

				<template v-if="instance.oidc?.enabled">
					<MkInfo>{{ i18n.ts.oidcAccountLinkDescription }}</MkInfo>

					<div v-if="oidcLinkLoading" class="_gaps_s _margin">
						<MkLoading/>
					</div>
					<div v-else-if="oidcLinks.length === 0" class="_gaps_s _margin">
						{{ i18n.ts.oidcNoLinks }}
					</div>
					<div v-else class="_gaps_s _margin">
						<div v-for="link in oidcLinks" :key="link.id" class="_panel _gaps_s oidcLinkItem">
							<div class="_monospace">{{ link.issuer }}</div>
							<div><MkTime :time="link.createdAt"/></div>
							<div>
								<MkButton danger @click="unlink(link)">
									{{ i18n.ts.oidcUnlink }}
								</MkButton>
							</div>
						</div>
					</div>

					<MkButton primary @click="connectOidc">
						<i class="ti ti-link"></i> {{ i18n.ts.oidcLink }}
					</MkButton>
				</template>
				<template v-else>
					<MkInfo warn>{{ i18n.ts.oidcNotConfigured }}</MkInfo>
				</template>
			</FormSection>
		</SearchMarker>
	</div>
</SearchMarker>
</template>

<script lang="ts" setup>
import { computed, markRaw, onMounted, ref } from 'vue';
import X2fa from './2fa.vue';
import FormSection from '@/components/form/section.vue';
import FormSlot from '@/components/form/slot.vue';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkPagination from '@/components/MkPagination.vue';
import MkTime from '@/components/global/MkTime.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import { definePage } from '@/page.js';
import MkFeatureBanner from '@/components/MkFeatureBanner.vue';
import { Paginator } from '@/utility/paginator.js';

const paginator = markRaw(new Paginator('i/signin-history', {
	limit: 5,
}));

type OidcLink = {
	id: string;
	issuer: string;
	createdAt: string;
};

const oidcLinks = ref<OidcLink[]>([]);
const oidcLinkLoading = ref(true);

async function loadOidcLinks(): Promise<void> {
	try {
		const res = await misskeyApi('i/oidc-link/list', {});
		oidcLinks.value = res;
	} finally {
		oidcLinkLoading.value = false;
	}
}

onMounted(async () => {
	void loadOidcLinks();

	const params = new URLSearchParams(window.location.search);
	const oidcLink = params.get('oidcLink');
	if (oidcLink != null) {
		window.history.replaceState({}, '', '/settings/security');
		if (oidcLink === 'success') {
			os.success();
		} else {
			os.alert({
				type: 'error',
				text: i18n.ts.oidcLinkFailedDescription,
			});
		}
	}
});

async function connectOidc(): Promise<void> {
	const res = await misskeyApi('i/oidc-link/connect', {});
	window.location.href = res.url;
}

async function unlink(link: OidcLink): Promise<void> {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts.oidcUnlinkConfirm,
	});
	if (canceled) return;

	await misskeyApi('i/oidc-link/disconnect', {
		linkId: link.id,
	});
	os.success();
	void loadOidcLinks();
}

async function change() {
	const { canceled: canceled2, result: newPassword } = await os.inputText({
		title: i18n.ts.newPassword,
		type: 'password',
		autocomplete: 'new-password',
	});
	if (canceled2 || newPassword == null) return;

	const { canceled: canceled3, result: newPassword2 } = await os.inputText({
		title: i18n.ts.newPasswordRetype,
		type: 'password',
		autocomplete: 'new-password',
	});
	if (canceled3 || newPassword2 == null) return;

	if (newPassword !== newPassword2) {
		os.alert({
			type: 'error',
			text: i18n.ts.retypedNotMatch,
		});
		return;
	}

	const auth = await os.authenticateDialog();
	if (auth.canceled) return;

	os.apiWithDialog('i/change-password', {
		currentPassword: auth.result.password,
		token: auth.result.token,
		newPassword,
	});
}

async function regenerateToken() {
	const auth = await os.authenticateDialog();
	if (auth.canceled) return;

	misskeyApi('i/regenerate-token', {
		password: auth.result.password,
		token: auth.result.token,
	});
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.security,
	icon: 'ti ti-lock',
}));
</script>

<style lang="scss" scoped>
.timnmucd {
	padding: 12px;

	&:first-child {
		border-top-left-radius: 6px;
		border-top-right-radius: 6px;
	}

	&:last-child {
		border-bottom-left-radius: 6px;
		border-bottom-right-radius: 6px;
	}

	&:not(:last-child) {
		border-bottom: solid 0.5px var(--MI_THEME-divider);
	}

	> header {
		display: flex;
		align-items: center;

		> .icon {
			width: 1em;
			margin-right: 0.75em;

			&.succ {
				color: var(--MI_THEME-success);
			}

			&.fail {
				color: var(--MI_THEME-error);
			}
		}

		> .ip {
			flex: 1;
			min-width: 0;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
			margin-right: 12px;
		}

		> .time {
			margin-left: auto;
			opacity: 0.7;
		}
	}
}

.oidcLinkItem {
	padding: 12px;
}
</style>
