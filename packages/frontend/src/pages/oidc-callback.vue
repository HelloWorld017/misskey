<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_spacer" style="--MI_SPACER-w: 500px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
	<div class="_panel" :class="$style.root">
		<MkLoading v-if="waiting"/>
		<MkResult v-else type="error" :text="message"/>
	</div>
</div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { login } from '@/accounts.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';

const props = defineProps<{
	ticket?: string;
	error?: string;
}>();

const waiting = ref(true);
const message = ref('');

const errorMessages: Record<string, string> = {
	not_configured: i18n.ts.oidcSigninFailedDescription,
	invalid_state: i18n.ts.oidcSigninExpiredDescription,
	invalid_claims: i18n.ts.oidcSigninFailedDescription,
	account_not_linked: i18n.ts.oidcAccountNotLinkedDescription,
	suspended: i18n.ts.suspended,
	signin_failed: i18n.ts.oidcSigninFailedDescription,
};

async function consumeTicket(): Promise<void> {
	if (props.error != null) {
		message.value = errorMessages[props.error] ?? i18n.ts.oidcSigninFailedDescription;
		waiting.value = false;
		return;
	}

	if (props.ticket == null) {
		message.value = i18n.ts.oidcSigninExpiredDescription;
		waiting.value = false;
		return;
	}

	try {
		const res = await misskeyApi('oidc/consume', { ticket: props.ticket });
		await login(res.i, '/');
	} catch (_) {
		message.value = i18n.ts.oidcSigninExpiredDescription;
		waiting.value = false;
	}
}

consumeTicket();

const title = computed(() => i18n.ts.oidcSignin);

definePage(() => ({
	title: title.value,
	icon: 'ti ti-login-2',
}));
</script>

<style lang="scss" module>
.root {
	padding: 32px;
	text-align: center;
}
</style>
