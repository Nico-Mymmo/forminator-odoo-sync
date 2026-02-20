import fs from 'node:fs/promises';
import path from 'node:path';
import { google } from 'googleapis';

const SCOPES = [
	'https://www.googleapis.com/auth/gmail.settings.basic',
	'https://www.googleapis.com/auth/admin.directory.user.readonly'
];

const IMPERSONATED_USER = 'nico@mymmo.com';
const TEST_SIGNATURE_HTML = '<div><strong>TEST SIGNATURE</strong><br/>Nico<br/>Founder<br/><a href="https://mymmo.com">mymmo.com</a></div>';

async function loadServiceAccount() {
	const serviceAccountPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH;

	if (!serviceAccountPath) {
		throw new Error('GOOGLE_SERVICE_ACCOUNT_PATH is not set');
	}

	const absolutePath = path.resolve(serviceAccountPath);
	const raw = await fs.readFile(absolutePath, 'utf8');
	return JSON.parse(raw);
}

async function main() {
	const serviceAccount = await loadServiceAccount();

	const auth = new google.auth.JWT({
		email: serviceAccount.client_email,
		key: serviceAccount.private_key,
		scopes: SCOPES,
		subject: IMPERSONATED_USER
	});

	const gmail = google.gmail({ version: 'v1', auth });

	const listResponse = await gmail.users.settings.sendAs.list({
		userId: 'me'
	});

	const sendAsList = listResponse.data.sendAs || [];
	if (sendAsList.length === 0) {
		throw new Error('No sendAs identities found');
	}

	const primarySendAs = sendAsList.find((item) => item.isPrimary) || sendAsList[0];
	const oldSignature = primarySendAs.signature || '';

	console.log(`primary sendAs email: ${primarySendAs.sendAsEmail}`);
	console.log(`oude signature lengte: ${oldSignature.length}`);

	await gmail.users.settings.sendAs.update({
		userId: 'me',
		sendAsEmail: primarySendAs.sendAsEmail,
		requestBody: {
			signature: TEST_SIGNATURE_HTML
		}
	});

	console.log('success: signature updated');
}

main().catch((error) => {
	console.error('error:', error.message);
	process.exit(1);
});
