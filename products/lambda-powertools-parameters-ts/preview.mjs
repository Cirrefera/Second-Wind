import { SSMProvider } from '@aws-lambda-powertools/parameters/ssm';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const SLUG = 'lambda-powertools-parameters-ts';

/** Native Node preview: execute Powertools SSM provider and JSON transform using an explicit local SDK fixture. */
export async function preview({ configuration, selected_components } = {}) {
  if (!configuration || configuration.language !== 'javascript'
      || !Number.isSafeInteger(configuration.max_age_seconds) || configuration.max_age_seconds < 0 || configuration.max_age_seconds > 86400
      || !Array.isArray(selected_components) || selected_components.length !== 1
      || selected_components[0] !== 'base') {
    return { ok: false, status: 'invalid', slug: SLUG, operation_count: 0, diagnostic_codes: ['configuration_invalid'] };
  }
  try {
    const client = new SSMClient({ region: 'us-east-1', credentials: { accessKeyId: 'local-preview', secretAccessKey: 'local-preview' } });
    client.send = async command => {
      if (!(command instanceof GetParameterCommand) || command.input.Name !== '/protected-preview/fixture') throw new Error('fixture_command_mismatch');
      return { Parameter: { Name: '/protected-preview/fixture', Type: 'String', Value: '{"mode":"fixture"}' } };
    };
    const provider = new SSMProvider({ awsSdkV3Client: client });
    const value = await provider.get('/protected-preview/fixture', { transform: 'json', forceFetch: true, maxAge: 0 });
    if (value?.mode !== 'fixture') throw new Error('provider_transform_failed');
    return { ok: true, status: 'valid', slug: SLUG, operation_count: 1, verification_count: 1, diagnostic_codes: ['local_sdk_fixture_not_aws'], selected_components };
  } catch {
    return { ok: false, status: 'unavailable', slug: SLUG, operation_count: 0, diagnostic_codes: ['runtime_unavailable'] };
  }
}
