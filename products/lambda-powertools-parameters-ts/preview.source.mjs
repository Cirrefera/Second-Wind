import { readSsmParameter, readSecret } from './src/parameters.mjs';
import { SSMProvider } from '@aws-lambda-powertools/parameters/ssm';
import { SSMClient } from '@aws-sdk/client-ssm';

const SLUG = 'lambda-powertools-parameters-ts';

/** Runs the purchased SSM read helper/provider with an in-memory SDK client fixture. */
export async function preview({ configuration, selected_components } = {}) {
  if (!configuration || configuration.language !== 'javascript'
      || !Number.isSafeInteger(configuration.max_age_seconds) || configuration.max_age_seconds < 0 || configuration.max_age_seconds > 86400
      || !Array.isArray(selected_components) || selected_components.length !== 1
      || selected_components[0] !== 'base') {
    return { ok: false, status: 'invalid', slug: SLUG, operation_count: 0, diagnostic_codes: ['configuration_invalid'] };
  }
  if (typeof readSsmParameter !== 'function' || typeof readSecret !== 'function' || typeof SSMProvider !== 'function') {
    return { ok: false, status: 'unavailable', slug: SLUG, operation_count: 0, diagnostic_codes: ['dependency_unavailable'] };
  }
  const client = new SSMClient({ region: 'us-east-1', credentials: { accessKeyId: 'local-preview', secretAccessKey: 'local-preview' } });
  let sdk_operations = 0;
  client.send = async command => {
    sdk_operations++;
    if (command?.input?.Name !== '/protected-preview/fixture' || command?.input?.WithDecryption !== true) {
      throw new Error('unexpected_ssm_fixture_request');
    }
    return { Parameter: { Name: command.input.Name, Type: 'String', Value: '{"enabled":true}' } };
  };
  try {
    const provider = new SSMProvider({ awsSdkV3Client: client });
    const value = await readSsmParameter('/protected-preview/fixture', {
      max_age_seconds: configuration.max_age_seconds,
      decrypt: true,
      transform: 'json',
    }, { provider });
    if (sdk_operations !== 1 || value?.enabled !== true) throw new Error('ssm_fixture_result_invalid');
    return { ok: true, status: 'valid', slug: SLUG, operation_count: sdk_operations,
      diagnostic_codes: ['local_fixture_only'], selected_components };
  } catch {
    return { ok: false, status: 'unavailable', slug: SLUG, operation_count: 0, diagnostic_codes: ['runtime_unavailable'] };
  } finally {
    client.destroy();
  }
}
