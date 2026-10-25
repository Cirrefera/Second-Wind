require 'json'
require_relative 'lib/object_store'
# Performs an actual GetObject. Never emits object bytes or AWS response bodies.
begin
  body = ObjectStore.get(client: ObjectStore.client, bucket: ENV.fetch('S3_BUCKET'), key: ENV.fetch('S3_KEY'))
  bytes = 0
  while (chunk = body.read(16 * 1024))
    bytes += chunk.bytesize
    raise 'object_too_large' if bytes > 16 * 1024 * 1024
  end
  puts JSON.generate(ok: true, status: 'object_read', object_bytes: bytes)
rescue Aws::S3::Errors::NoSuchKey
  puts JSON.generate(ok: false, status: 'blocked', diagnostic_codes: ['object_not_found'])
  exit 2
rescue Aws::Errors::ServiceError
  puts JSON.generate(ok: false, status: 'blocked', diagnostic_codes: ['s3_request_failed'])
  exit 2
end
