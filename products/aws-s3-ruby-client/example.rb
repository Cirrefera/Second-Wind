require_relative 'lib/object_store'
client = ObjectStore.client
ObjectStore.put(client: client, bucket: ENV.fetch('S3_BUCKET'), key: 'demo/hello.txt', body: 'hello', content_type: 'text/plain')
puts ObjectStore.get(client: client, bucket: ENV.fetch('S3_BUCKET'), key: 'demo/hello.txt').read
