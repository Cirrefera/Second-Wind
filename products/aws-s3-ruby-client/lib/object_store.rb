require 'aws-sdk-s3'

module ObjectStore
  module_function
  def client(region: ENV.fetch('AWS_REGION'), endpoint: ENV['S3_ENDPOINT'], force_path_style: false)
    options = {region: region}
    options[:endpoint] = endpoint if endpoint
    options[:force_path_style] = true if force_path_style
    Aws::S3::Client.new(**options)
  end
  # R2 uses the official S3 SDK and R2 S3 API credentials, not an AWS account.
  def r2_client(account_id: ENV.fetch('R2_ACCOUNT_ID'),
                access_key_id: ENV.fetch('R2_ACCESS_KEY_ID'),
                secret_access_key: ENV.fetch('R2_SECRET_ACCESS_KEY'))
    raise ArgumentError, 'invalid_r2_account_id' unless /\A[0-9a-f]{32}\z/i.match?(account_id)
    Aws::S3::Client.new(
      endpoint: "https://#{account_id}.r2.cloudflarestorage.com", region: 'auto',
      access_key_id: access_key_id, secret_access_key: secret_access_key
    )
  end
  def put(client:, bucket:, key:, body:, content_type: 'application/octet-stream')
    raise ArgumentError, 'bucket and key are required' if bucket.to_s.empty? || key.to_s.empty?
    client.put_object(bucket: bucket, key: key, body: body, content_type: content_type)
  end
  def get(client:, bucket:, key:)
    client.get_object(bucket: bucket, key: key).body
  end
  def delete(client:, bucket:, key:)
    client.delete_object(bucket: bucket, key: key)
  end
end
