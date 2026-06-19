<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<SearchMarker path="/admin/external-services" :label="i18n.ts.externalServices" :keywords="['external', 'services', 'thirdparty']" icon="ti ti-link">
			<div class="_gaps_m">
				<SearchMarker v-slot="slotProps" :keywords="['oidc', 'openid', 'login', 'signin']">
					<MkFolder :defaultOpen="slotProps.isParentOfTarget">
						<template #label><SearchLabel>{{ i18n.ts.oidcSignin }}</SearchLabel></template>

						<div class="_gaps_m">
							<SearchMarker>
								<MkSwitch v-model="enableOidc">
									<template #label><SearchLabel>{{ i18n.ts.enable }}</SearchLabel></template>
								</MkSwitch>
							</SearchMarker>

							<SearchMarker>
								<MkInput v-model="oidcProviderName">
									<template #label><SearchLabel>{{ i18n.ts.oidcProviderName }}</SearchLabel></template>
								</MkInput>
							</SearchMarker>

							<SearchMarker>
								<MkInput v-model="oidcIssuer">
									<template #label><SearchLabel>{{ i18n.ts.oidcIssuer }}</SearchLabel></template>
									<template #caption>https://idp.example.com</template>
								</MkInput>
							</SearchMarker>

							<SearchMarker>
								<MkInput v-model="oidcClientId">
									<template #label><SearchLabel>{{ i18n.ts.oidcClientId }}</SearchLabel></template>
								</MkInput>
							</SearchMarker>

							<SearchMarker>
								<MkInput v-model="oidcClientSecret" type="password">
									<template #label><SearchLabel>{{ i18n.ts.oidcClientSecret }}</SearchLabel></template>
								</MkInput>
							</SearchMarker>

							<SearchMarker>
								<MkInput v-model="oidcScope">
									<template #label><SearchLabel>{{ i18n.ts.oidcScope }}</SearchLabel></template>
								</MkInput>
							</SearchMarker>

							<SearchMarker>
								<MkInput v-model="oidcUsernameClaim">
									<template #label><SearchLabel>{{ i18n.ts.oidcUsernameClaim }}</SearchLabel></template>
								</MkInput>
							</SearchMarker>

							<SearchMarker>
								<MkSwitch v-model="oidcAutoRegister">
									<template #label><SearchLabel>{{ i18n.ts.oidcAutoRegister }}</SearchLabel></template>
								</MkSwitch>
							</SearchMarker>

							<SearchMarker>
								<MkSwitch v-model="oidcRequireVerifiedEmail">
									<template #label><SearchLabel>{{ i18n.ts.oidcRequireVerifiedEmail }}</SearchLabel></template>
								</MkSwitch>
							</SearchMarker>

							<MkInfo>{{ i18n.tsx.oidcRedirectUri({ url: `${uri}/api/oidc/callback` }) }}</MkInfo>

							<MkButton primary @click="save_oidc">{{ i18n.ts.save }}</MkButton>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker v-slot="slotProps">
					<MkFolder :defaultOpen="slotProps.isParentOfTarget">
						<template #label><SearchLabel>Google Analytics</SearchLabel><span class="_beta">{{ i18n.ts.beta }}</span></template>

						<div class="_gaps_m">
							<SearchMarker>
								<MkInput v-model="googleAnalyticsMeasurementId">
									<template #prefix><i class="ti ti-key"></i></template>
									<template #label><SearchLabel>Measurement ID</SearchLabel></template>
								</MkInput>
							</SearchMarker>

							<MkButton primary @click="save_googleAnalytics">Save</MkButton>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker v-slot="slotProps">
					<MkFolder :defaultOpen="slotProps.isParentOfTarget">
						<template #label><SearchLabel>DeepL Translation</SearchLabel></template>

						<div class="_gaps_m">
							<SearchMarker>
								<MkInput v-model="deeplAuthKey">
									<template #prefix><i class="ti ti-key"></i></template>
									<template #label><SearchLabel>Auth Key</SearchLabel></template>
								</MkInput>
							</SearchMarker>

							<SearchMarker>
								<MkSwitch v-model="deeplIsPro">
									<template #label><SearchLabel>Pro account</SearchLabel></template>
								</MkSwitch>
							</SearchMarker>

							<MkButton primary @click="save_deepl">Save</MkButton>
						</div>
					</MkFolder>
				</SearchMarker>
			</div>
		</SearchMarker>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import MkInput from '@/components/MkInput.vue';
import MkButton from '@/components/MkButton.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkInfo from '@/components/MkInfo.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import MkFolder from '@/components/MkFolder.vue';

const meta = await misskeyApi('admin/meta');

const deeplAuthKey = ref(meta.deeplAuthKey ?? '');
const deeplIsPro = ref(meta.deeplIsPro);
const googleAnalyticsMeasurementId = ref(meta.googleAnalyticsMeasurementId ?? '');
const enableOidc = ref(meta.enableOidc);
const oidcIssuer = ref(meta.oidcIssuer ?? '');
const oidcClientId = ref(meta.oidcClientId ?? '');
const oidcClientSecret = ref(meta.oidcClientSecret ?? '');
const oidcScope = ref(meta.oidcScope);
const oidcProviderName = ref(meta.oidcProviderName);
const oidcAutoRegister = ref(meta.oidcAutoRegister);
const oidcRequireVerifiedEmail = ref(meta.oidcRequireVerifiedEmail);
const oidcUsernameClaim = ref(meta.oidcUsernameClaim);
const uri = meta.uri;

function save_oidc() {
	os.apiWithDialog('admin/update-meta', {
		enableOidc: enableOidc.value,
		oidcIssuer: oidcIssuer.value,
		oidcClientId: oidcClientId.value,
		oidcClientSecret: oidcClientSecret.value,
		oidcScope: oidcScope.value,
		oidcProviderName: oidcProviderName.value,
		oidcAutoRegister: oidcAutoRegister.value,
		oidcRequireVerifiedEmail: oidcRequireVerifiedEmail.value,
		oidcUsernameClaim: oidcUsernameClaim.value,
	}).then(() => {
		fetchInstance(true);
	});
}

function save_deepl() {
	os.apiWithDialog('admin/update-meta', {
		deeplAuthKey: deeplAuthKey.value,
		deeplIsPro: deeplIsPro.value,
	}).then(() => {
		fetchInstance(true);
	});
}

function save_googleAnalytics() {
	os.apiWithDialog('admin/update-meta', {
		googleAnalyticsMeasurementId: googleAnalyticsMeasurementId.value,
	}).then(() => {
		fetchInstance(true);
	});
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.externalServices,
	icon: 'ti ti-link',
}));
</script>
