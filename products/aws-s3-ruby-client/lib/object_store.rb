require 'aws-sdk-s3'

module ObjectStore
  module_function
  def client(region: ENV.fetch('AWS_REGION'), endpoint: ENV['S3_ENDPOINT'], force_path_style: false)
    options = {region: region}
    options[:endpoint] = endpoint if endpoint
    options[:force_path_style] = true if force_path_style
    Aws::S3::Client.new(**options)
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
