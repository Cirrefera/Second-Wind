import { CommerceError } from './contracts.js';

export const SANDBOX_ELIGIBLE_SKUS=Object.freeze([
  'AWS-0550','AWS-0551','AWS-0552','AWS-0553','AWS-0554','AWS-0555',
  'AWS-0556','AWS-0557','AWS-0558','AWS-0559','AWS-0560','AWS-0561',
  'AWS-0568',
  'AWS-0629','AWS-0630','AWS-0631','AWS-0632','AWS-0633','AWS-0634',
  'AWS-0635','AWS-0636','AWS-0637','AWS-0638','AWS-0639','AWS-0640',
  'AWS-0641','AWS-0642','AWS-0643','AWS-0644','AWS-0645','AWS-0646',
  'AWS-0647','AWS-0648','AWS-0649','AWS-0650','AWS-0651','AWS-0652',
  'AWS-0653','AWS-0654','AWS-0655','AWS-0656','AWS-0657','AWS-0658',
  'AWS-0659','AWS-0660','AWS-0661','AWS-0662','AWS-0663','AWS-0664',
  'AWS-0665','AWS-0666','AWS-0667','AWS-0668','AWS-0669','AWS-0670',
  'AWS-0671','AWS-0672','AWS-0673',
  'AWS-0676','AWS-0677','AWS-0678','AWS-0679',
  'AWS-0681','AWS-0682','AWS-0683','AWS-0684','AWS-0685','AWS-0686',
  'AWS-0687','AWS-0688','AWS-0689','AWS-0690',
]);

const eligible=new Set(SANDBOX_ELIGIBLE_SKUS);

export function isSandboxEligible(sku) {
  return typeof sku==='string' && eligible.has(sku);
}

export function requireSandboxEligible(sku) {
  if (!isSandboxEligible(sku)) throw new CommerceError('sandbox_not_eligible',403);
  return sku;
}
