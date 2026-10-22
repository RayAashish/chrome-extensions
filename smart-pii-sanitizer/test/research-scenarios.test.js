import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitize } from '../core/sanitizer.js';
import { reverseMap } from '../core/reverse.js';
import { Vault } from '../core/vault.js';
import { isValidIBAN } from '../core/detectors.js';

test('Research Scenarios - Configs: Docker Compose, K8s, Terraform, npmrc, pypirc, GCP, Azure, logfmt', () => {
  const vault = new Vault();

  // 1. Docker Compose
  const dockerCompose = `services:
  db:
    image: postgres:15
    environment:
      - POSTGRES_PASSWORD=mySuperSecretDbPass123
      - DB_NAME=analytics`;
  const resDocker = sanitize(dockerCompose, { vault });
  assert.ok(!resDocker.sanitizedText.includes('mySuperSecretDbPass123'), 'Docker compose password redacted');
  assert.ok(resDocker.sanitizedText.includes('- POSTGRES_PASSWORD='), 'Docker compose key preserved');

  // 2. Kubernetes Secret Manifest
  const k8sSecret = `apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
data:
  db-password: bXlTZWNyZXRQYXNzd29yZA==
  api-token: c29tZXRva2VuMTIzNDU2Nzg=`;
  const resK8s = sanitize(k8sSecret, { vault });
  assert.ok(!resK8s.sanitizedText.includes('bXlTZWNyZXRQYXNzd29yZA=='), 'K8s secret password redacted');
  assert.ok(!resK8s.sanitizedText.includes('c29tZXRva2VuMTIzNDU2Nzg='), 'K8s secret token redacted');

  // 3. Terraform state snippet
  const tfState = `{"attributes":{"sensitive_value":"prod_db_master_secret_99","id":"res-123"}}`;
  const resTf = sanitize(tfState, { vault });
  assert.ok(!resTf.sanitizedText.includes('prod_db_master_secret_99'), 'Terraform sensitive attribute redacted');

  // 4. .npmrc _authToken
  const npmrc = `//registry.npmjs.org/:_authToken=npm_1234567890abcdefghijklmnopqrstuv`;
  const resNpm = sanitize(npmrc, { vault });
  assert.ok(!resNpm.sanitizedText.includes('npm_1234567890abcdefghijklmnopqrstuv'), '.npmrc token redacted');

  // 5. .pypirc
  const pypirc = `[pypi]
username = __token__
password = pypi-AgEIcHlwaS5vcmcCJDFiNDZhNTQ0LWJmZjgtNDM0MC1iNmFjLWExYzEwMjgyNGVhNAACJXsicGVybWlzc2lvbnMiOiAidXNlciIsICJ2ZXJzaW9uIjogMX0AAAYg4c`;
  const resPypi = sanitize(pypirc, { vault });
  assert.ok(!resPypi.sanitizedText.includes('pypi-AgEI'), 'PyPI token redacted');

  // 6. GCP service-account JSON with escaped \n in private_key
  const gcpJson = `{"type":"service_account","project_id":"my-gcp-proj","private_key":"-----BEGIN PRIVATE KEY-----\\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC789012345678901234567890\\n-----END PRIVATE KEY-----\\n","client_email":"sa@my-gcp-proj.iam.gserviceaccount.com"}`;
  const resGcp = sanitize(gcpJson, { vault });
  assert.ok(!resGcp.sanitizedText.includes('MIIEvgIBADAN'), 'GCP private key redacted');
  assert.ok(!resGcp.sanitizedText.includes('sa@my-gcp-proj.iam.gserviceaccount.com'), 'GCP service account email redacted');

  // 7. Azure Connection String
  const azureConn = `DefaultEndpointsProtocol=https;AccountName=mystorage;AccountKey=AbCdEfGhIjKlMnOpQrStUvWxYz0123456789+/==;EndpointSuffix=core.windows.net`;
  const resAzure = sanitize(azureConn, { vault });
  assert.ok(!resAzure.sanitizedText.includes('AbCdEfGhIjKlMnOpQrStUvWxYz0123456789+/=='), 'Azure AccountKey redacted');

  // 8. Logfmt key=value logs
  const logfmt = `level=info ts=2026-10-22T10:14:03Z caller=auth.go:42 msg="user auth" email=bob@corp.internal token=sec_val_987654321 ip=172.16.0.4`;
  const resLogfmt = sanitize(logfmt, { vault });
  assert.ok(!resLogfmt.sanitizedText.includes('bob@corp.internal'), 'Logfmt email redacted');
  assert.ok(!resLogfmt.sanitizedText.includes('sec_val_987654321'), 'Logfmt token redacted');
  assert.ok(!resLogfmt.sanitizedText.includes('172.16.0.4'), 'Logfmt IP redacted');
});

test('Research Scenarios - Structured formats: XML, CSV, JSON Lines, Minified JSON', () => {
  const vault = new Vault();

  // 9. XML / SOAP
  const soapXml = `<Envelope><Body><LoginRequest><username>admin</username><password>Pass@12345</password></LoginRequest></Body></Envelope>`;
  const resXml = sanitize(soapXml, { vault });
  assert.ok(!resXml.sanitizedText.includes('Pass@12345'), 'XML password redacted');
  assert.ok(resXml.sanitizedText.includes('<password>'), 'XML tag preserved');

  // 10. CSV with quoted fields
  const csv = `id,email,api_token,notes
1,alice@example.com,"whsec_1234567890abcdef12345678",active user`;
  const resCsv = sanitize(csv, { vault });
  assert.ok(!resCsv.sanitizedText.includes('alice@example.com'), 'CSV email redacted');
  assert.ok(!resCsv.sanitizedText.includes('whsec_1234567890abcdef12345678'), 'CSV token redacted');

  // 11. JSON Lines
  const jsonl = `{"req_id":1,"user_email":"dev1@acme.org","secret":"passOne"}
{"req_id":2,"user_email":"dev2@acme.org","secret":"passTwo"}`;
  const resJsonl = sanitize(jsonl, { vault });
  assert.ok(!resJsonl.sanitizedText.includes('dev1@acme.org'));
  assert.ok(!resJsonl.sanitizedText.includes('passOne'));
  assert.ok(!resJsonl.sanitizedText.includes('dev2@acme.org'));
  assert.ok(!resJsonl.sanitizedText.includes('passTwo'));

  // 12. Minified JSON
  const minJson = `{"auth":{"token":"ghp_abcdef123456789012345678901234567890","ip":"192.168.1.10"}}`;
  const resMin = sanitize(minJson, { vault });
  assert.ok(!resMin.sanitizedText.includes('ghp_abcdef123456789012345678901234567890'));
  assert.ok(!resMin.sanitizedText.includes('192.168.1.10'));
  assert.doesNotThrow(() => JSON.parse(resMin.sanitizedText), 'Minified JSON remains parseable');
});

test('Research Scenarios - HTTP & Auth: Cookies, Headers, Signed URLs, Webhooks', () => {
  const vault = new Vault();

  // 13. Cookie header
  const cookieHeader = `Cookie: session_id=s%3Aabc123xyz789; auth_token=tok_456789; theme=dark`;
  const resCookie = sanitize(cookieHeader, { vault });
  assert.ok(!resCookie.sanitizedText.includes('tok_456789'), 'Cookie auth_token redacted');

  // 14. Set-Cookie header
  const setCookie = `Set-Cookie: auth_token=secret_val_998877; Path=/; Secure; HttpOnly`;
  const resSetCookie = sanitize(setCookie, { vault });
  assert.ok(!resSetCookie.sanitizedText.includes('secret_val_998877'), 'Set-Cookie auth_token redacted');

  // 15. X-API-Key header
  const apiKeyHeader = `X-API-Key: my_secret_api_key_123456`;
  const resApi = sanitize(apiKeyHeader, { vault });
  assert.ok(!resApi.sanitizedText.includes('my_secret_api_key_123456'), 'X-API-Key redacted');

  // 16. OAuth refresh_token
  const oauthJson = `{"token_type":"Bearer","refresh_token":"rfr_1234567890abcdef123456","expires_in":3600}`;
  const resOauth = sanitize(oauthJson, { vault });
  assert.ok(!resOauth.sanitizedText.includes('rfr_1234567890abcdef123456'), 'OAuth refresh_token redacted');

  // 17. Signed URL query string
  const signedUrl = `https://s3.amazonaws.com/my-bucket/report.pdf?X-Amz-Signature=abcdef1234567890abcdef1234567890&token=sec9988`;
  const resSigned = sanitize(signedUrl, { vault });
  assert.ok(!resSigned.sanitizedText.includes('abcdef1234567890abcdef1234567890'), 'Signed URL signature redacted');

  // 18. Slack Webhook
  const slackHook = `Post alerts to https://hooks.slack.com/services/T01234567/B01234567/abcdefghijklmnopqrstuvwx daily`;
  const resSlack = sanitize(slackHook, { vault });
  assert.ok(!resSlack.sanitizedText.includes('https://hooks.slack.com/services/T01234567/B01234567/abcdefghijklmnopqrstuvwx'), 'Slack webhook redacted');

  // 19. Discord Webhook
  const discordHook = `Webhook: https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz0123456789012345678901234567890123456789`;
  const resDiscord = sanitize(discordHook, { vault });
  assert.ok(!resDiscord.sanitizedText.includes('123456789012345678/abcdefghijkl'), 'Discord webhook redacted');

  // 20. Bearer token header
  const bearer = `Authorization: Bearer my_super_secret_bearer_token_12345`;
  const resBearer = sanitize(bearer, { vault });
  assert.ok(!resBearer.sanitizedText.includes('my_super_secret_bearer_token_12345'), 'Bearer token redacted');
});

test('Research Scenarios - Provider Tokens & Keys: Twilio, SendGrid, OpenAI, Anthropic, HuggingFace, PyPI, Telegram, Mailgun', () => {
  const vault = new Vault();

  // 21. Twilio Account SID & Auth SID
  const twilio = `TWILIO_ACCOUNT_SID=AC1234567890abcdef1234567890abcdef
TWILIO_API_KEY=SK1234567890abcdef1234567890abcdef`;
  const resTwilio = sanitize(twilio, { vault });
  assert.ok(!resTwilio.sanitizedText.includes('AC1234567890abcdef1234567890abcdef'), 'Twilio AC redacted');
  assert.ok(!resTwilio.sanitizedText.includes('SK1234567890abcdef1234567890abcdef'), 'Twilio SK redacted');

  // 22. SendGrid Key
  const sendgrid = `export SENDGRID_API_KEY=SG.1234567890123456789012.1234567890123456789012345678901234567890123`;
  const resSg = sanitize(sendgrid, { vault });
  assert.ok(!resSg.sanitizedText.includes('SG.1234567890123456789012'), 'SendGrid API key redacted');

  // 23. Mailgun Key
  const mailgun = `MAILGUN_API_KEY=key-1234567890abcdef1234567890abcdef`;
  const resMg = sanitize(mailgun, { vault });
  assert.ok(!resMg.sanitizedText.includes('key-1234567890abcdef1234567890abcdef'), 'Mailgun key redacted');

  // 24. OpenAI project key
  const openai = `OPENAI_API_KEY=sk-proj-1234567890abcdefghijklmnopqrstuvwxyz1234567890abcdef`;
  const resOai = sanitize(openai, { vault });
  assert.ok(!resOai.sanitizedText.includes('sk-proj-1234567890abcdef'), 'OpenAI key redacted');

  // 25. Anthropic key
  const anthropic = `ANTHROPIC_API_KEY=sk-ant-api03-1234567890abcdefghijklmnopqrstuvwxyz1234567890abcdef1234567890`;
  const resAnt = sanitize(anthropic, { vault });
  assert.ok(!resAnt.sanitizedText.includes('sk-ant-api03-1234567890'), 'Anthropic key redacted');

  // 26. HuggingFace token
  const hf = `HF_TOKEN=hf_1234567890abcdefghijklmnopqrstuvwxyz`;
  const resHf = sanitize(hf, { vault });
  assert.ok(!resHf.sanitizedText.includes('hf_1234567890abcdef'), 'HuggingFace token redacted');

  // 27. Telegram Bot Token
  const tg = `TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUvwxYZ123456789`;
  const resTg = sanitize(tg, { vault });
  assert.ok(!resTg.sanitizedText.includes('123456789:ABCdefGHIjklMNOpqrSTUvwxYZ123456789'), 'Telegram token redacted');

  // 28. AWS ARN with 12-digit account ID
  const arn = `Role ARN: arn:aws:iam::123456789012:role/ProductionAdmin`;
  const resArn = sanitize(arn, { vault });
  assert.ok(!resArn.sanitizedText.includes('123456789012'), '12-digit AWS account ID redacted');
  assert.ok(resArn.sanitizedText.includes('arn:aws:iam::'), 'ARN prefix preserved');
});

test('Research Scenarios - Financial, Banking & Identity: IBAN, SWIFT, ITIN, Bank Accounts, Obfuscated Emails', () => {
  const vault = new Vault();

  // 29. Valid IBAN (GB82WEST12345698765432 - NatWest valid IBAN)
  assert.ok(isValidIBAN('GB82WEST12345698765432'), 'Algorithm must validate real IBAN');
  const ibanText = `Wire funds to IBAN: GB82WEST12345698765432 for settlement`;
  const resIban = sanitize(ibanText, { vault });
  assert.ok(!resIban.sanitizedText.includes('GB82WEST12345698765432'), 'Valid IBAN redacted');

  // 30. SWIFT / BIC Code
  const swiftText = `Bank SWIFT: DEUTDEDBFXX, branch Frankfurt`;
  const resSwift = sanitize(swiftText, { vault });
  assert.ok(!resSwift.sanitizedText.includes('DEUTDEDBFXX'), 'SWIFT code redacted');

  // 31. US ITIN (9XX-7X/8X/9X-XXXX)
  const itinText = `Taxpayer ITIN is 987-70-1234 on form W-7`;
  const resItin = sanitize(itinText, { vault });
  assert.ok(!resItin.sanitizedText.includes('987-70-1234'), 'US ITIN redacted');

  // 32. Obfuscated email
  const obfEmail = `Contact developer at rahul [at] acme [dot] io for access`;
  const resObf = sanitize(obfEmail, { vault });
  assert.ok(!resObf.sanitizedText.includes('rahul [at] acme [dot] io'), 'Obfuscated email redacted');

  // 33. mailto: link
  const mailtoText = `<a href="mailto:security-team@internal-corp.net">Email Security</a>`;
  const resMailto = sanitize(mailtoText, { vault });
  assert.ok(!resMailto.sanitizedText.includes('security-team@internal-corp.net'), 'mailto email redacted');
  assert.ok(resMailto.sanitizedText.includes('mailto:'), 'mailto: scheme preserved');
});

test('Research Scenarios - False Positive Traps: Images, Hashes, Colors, Templates, Git Commits', () => {
  const vault = new Vault();

  // 34. Base64 Image string (must NOT be corrupted)
  const b64Image = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==`;
  const resImg = sanitize(b64Image, { vault });
  assert.equal(resImg.sanitizedText, b64Image, 'Base64 image data URI must never be corrupted');

  // 35. Git commit SHA
  const gitLog = `commit 7b23f81e3a4b9c5d0e1f2a3b4c5d6e7f8a9b0c1d (HEAD -> main)
Author: Alice Smith
Date:   Wed Oct 22 10:14:03 2026`;
  const resGit = sanitize(gitLog, { vault });
  assert.ok(resGit.sanitizedText.includes('7b23f81e3a4b9c5d0e1f2a3b4c5d6e7f8a9b0c1d'), 'Git commit SHA must not be treated as secret');

  // 36. Template placeholder text like YOUR_API_KEY or <password>
  const templateConfig = `api_key = YOUR_API_KEY
db_password = <password>
token = INSERT_TOKEN_HERE`;
  const resTpl = sanitize(templateConfig, { vault });
  assert.ok(resTpl.sanitizedText.includes('YOUR_API_KEY'), 'YOUR_API_KEY template preserved');
  assert.ok(resTpl.sanitizedText.includes('<password>'), '<password> template preserved');
  assert.ok(resTpl.sanitizedText.includes('INSERT_TOKEN_HERE'), 'INSERT_TOKEN_HERE template preserved');

  // 37. CSS Hex Colors
  const css = `color: #ffffff; background-color: #1a2b3c; border: 1px solid #000;`;
  const resCss = sanitize(css, { vault });
  assert.equal(resCss.sanitizedText, css, 'CSS hex colors must never be touched');
});

test('Research Scenarios - Invariant Properties: Line Count, Unchanged Benign Text, Round Trip', () => {
  const complexPayload = `2026-10-22 10:14:03.456 [main] INFO com.acme.App - Starting job
User: alice.wonderland@acme.corp, IP: 192.168.10.99
Config: {"api_key":"sk_live_51H8xYzAbCdEfGhIjKlMnOpQr","retries":5}
Server: host_internal.corp
DB_PASSWORD="p@ss w0rd 2026!"
Done in 42ms.`;

  const vault = new Vault();
  const { sanitizedText, residualFindings } = sanitize(complexPayload, { vault });

  // 1. Line count preservation
  assert.equal(sanitizedText.split('\n').length, complexPayload.split('\n').length, 'Line count invariant');

  // 2. Benign non-sensitive text preserved
  assert.ok(sanitizedText.includes('2026-10-22 10:14:03.456'), 'Timestamp untouched');
  assert.ok(sanitizedText.includes('[main] INFO com.acme.App - Starting job'), 'Log header untouched');
  assert.ok(sanitizedText.includes('"retries":5'), 'JSON non-sensitive properties untouched');
  assert.ok(sanitizedText.includes('Done in 42ms.'), 'Log footer untouched');

  // 3. No residual sensitive items left in sanitized output
  assert.equal(residualFindings.length, 0, 'Residual scan must be 0 for sanitized payload');

  // 4. Exact byte-for-byte round trip
  const { restoredText } = reverseMap(sanitizedText, vault);
  assert.equal(restoredText, complexPayload, 'Exact round trip byte-for-byte');
});
