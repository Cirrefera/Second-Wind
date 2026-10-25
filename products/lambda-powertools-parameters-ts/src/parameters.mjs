import { getParameter } from '@aws-lambda-powertools/parameters/ssm';
import { getSecret } from '@aws-lambda-powertools/parameters/secrets';

function validateName(name) {
  if (typeof name !== 'string' || !name.trim() || name.length > 2048) throw new Error('parameter_name_required');
  return name;
}
function validateAge(max_age_seconds) {
  if (!Number.isSafeInteger(max_age_seconds) || max_age_seconds < 0 || max_age_seconds > 86400) {
    throw new Error('invalid_max_age');
  }
  return max_age_seconds;
}

export async function readSsmParameter(name, { max_age_seconds = 5, decrypt = true, transform } = {}) {
  validateAge(max_age_seconds);
  if (typeof decrypt !== 'boolean') throw new Error('invalid_decrypt_option');
  return getParameter(validateName(name), {
    maxAge: max_age_seconds,
    decrypt,
    ...(transform ? { transform } : {}),
  });
}

export async function readSecret(name, { max_age_seconds = 5, transform } = {}) {
  validateAge(max_age_seconds);
  return getSecret(validateName(name), {
    maxAge: max_age_seconds,
    ...(transform ? { transform } : {}),
  });
}
