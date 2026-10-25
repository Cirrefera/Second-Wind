import * as cdk from 'aws-cdk-lib';
import * as backup from 'aws-cdk-lib/aws-backup';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as events from 'aws-cdk-lib/aws-events';

export function createStack(app, config) {
  const stack = new cdk.Stack(app, 'cdk-backup', { env: config.env });
  const vault = new backup.BackupVault(stack, 'Vault', { backupVaultName: config.vaultName ?? 'application-backups', encryptionKey: new kms.Key(stack, 'VaultKey', { enableKeyRotation: true }), removalPolicy: cdk.RemovalPolicy.RETAIN });
  const plan = new backup.BackupPlan(stack, 'Plan', { backupPlanName: 'daily-backups', backupVault: vault });
  plan.addRule(new backup.BackupPlanRule({ ruleName: 'daily-retain-35-days', scheduleExpression: events.Schedule.cron({ minute: '0', hour: '5' }), deleteAfter: cdk.Duration.days(35), enableContinuousBackup: true }));
  return stack;
}
