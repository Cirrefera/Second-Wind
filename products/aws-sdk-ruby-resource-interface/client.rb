require 'aws-sdk-s3'
require 'aws-sdk-dynamodb'
require 'aws-sdk-bedrockruntime'

# Build the official service client. Set stub_responses: true for local validation;
# the default client follows the normal AWS SDK credential chain.
def client_for(service, region: 'us-east-1', stub_responses: false, endpoint: nil, credentials: nil)
  options = { region: region, stub_responses: stub_responses }
  raise ArgumentError, 'custom_endpoint_requires_s3' if endpoint && service != 's3'
  options[:endpoint] = endpoint if endpoint
  options[:credentials] = credentials if credentials
  case service
  when 's3' then Aws::S3::Client.new(**options)
  when 'dynamodb' then Aws::DynamoDB::Client.new(**options)
  when 'bedrock-runtime' then Aws::BedrockRuntime::Client.new(**options)
  else raise ArgumentError, 'unsupported_service'
  end
end

# Cloudflare R2 is an explicit S3 target; DynamoDB and Bedrock remain AWS services.
def r2_client(account_id: ENV.fetch('R2_ACCOUNT_ID'),
              access_key_id: ENV.fetch('R2_ACCESS_KEY_ID'),
              secret_access_key: ENV.fetch('R2_SECRET_ACCESS_KEY'))
  raise ArgumentError, 'invalid_r2_account_id' unless /\A[0-9a-f]{32}\z/i.match?(account_id)
  client_for('s3', region: 'auto', endpoint: "https://#{account_id}.r2.cloudflarestorage.com",
             credentials: Aws::Credentials.new(access_key_id, secret_access_key))
end

def put_object(client, bucket:, key:, body:)
  client.put_object(bucket: bucket, key: key, body: body)
end

def get_item(client, table_name:, key_name:, key_value:)
  client.get_item(table_name: table_name, key: { key_name => { 'S' => key_value } })
end

def invoke_model(client, model_id:, body:)
  client.invoke_model(model_id: model_id, body: body, content_type: 'application/json', accept: 'application/json')
end

# Use the actual AWS SDK request pipeline with response stubs for local preview.
def build_request(configuration)
  raise ArgumentError, 'configuration_required' unless configuration.is_a?(Hash)
  client = client_for(configuration.fetch('service'), region: configuration.fetch('region', 'us-east-1'), stub_responses: true)
  case configuration.fetch('service')
  when 's3'
    put_object(client, bucket: configuration.fetch('bucket'), key: configuration.fetch('key'), body: configuration.fetch('body'))
    { operation: 'PutObject', service: 's3', request_built: true }
  when 'dynamodb'
    get_item(client, table_name: configuration.fetch('table_name'), key_name: configuration.fetch('key_name'), key_value: configuration.fetch('key_value'))
    { operation: 'GetItem', service: 'dynamodb', request_built: true }
  when 'bedrock-runtime'
    invoke_model(client, model_id: configuration.fetch('model_id'), body: configuration.fetch('body'))
    { operation: 'InvokeModel', service: 'bedrock-runtime', request_built: true }
  else
    raise ArgumentError, 'unsupported_service'
  end
end
