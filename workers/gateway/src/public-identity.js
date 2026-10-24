/** Present descriptive product identities without changing durable SKU keys.
 * Only service-owned metadata is projected. Buyer inputs/results, signed payment
 * data and content-addressed artifact bytes are never recursively rewritten.
 */
const services = {'SW-SANDBOX':'sandbox-preview','SW-EXEC':'javascript-execution'};

export function requestProduct(body) {
  if (body.slug !== undefined && body.sku !== undefined && body.slug !== body.sku) {
    throw Object.assign(new Error('conflicting_product_identifiers'),{status:400});
  }
  return body.slug ?? body.sku;
}

export async function buyerView(db,value) {
  const identities=new Map();
  async function visit(record,inheritedSlug) {
    if(Array.isArray(record)) return Promise.all(record.map(item=>visit(item)));
    if(!record || typeof record!=='object') return record;
    const result={...record};
    let slug=record.slug || inheritedSlug;
    if(typeof record.sku==='string') {
      if(!slug) {
        if(!identities.has(record.sku)) identities.set(record.sku,services[record.sku]
          || (await db.prepare('SELECT slug FROM items WHERE sku=?1').bind(record.sku).first())?.slug || null);
        slug=identities.get(record.sku);
      }
      delete result.sku;
      if(result.product_id===record.sku) delete result.product_id;
      result.slug=slug;
    }
    for(const field of ['scope','receipt','routing']) if(record[field]) result[field]=await visit(record[field],slug);
    if(record.composition) result.composition=Object.fromEntries(await Promise.all(Object.entries(record.composition).map(async ([key,items])=>[key,await visit(items)])));
    for(const field of ['matches','tools','items']) if(Array.isArray(record[field])) result[field]=await visit(record[field]);
    // Sandbox admission configuration contains server identity fields as well as
    // buyer input. Do not expose the ledger key or the credential hash.
    if(record.config?.trial_token_hash && record.config?.trial_id) {
      const {sku,product_key,trial_token_hash,...config}=record.config;
      result.config={...config,slug:(await visit({sku})).slug};
    }
    return result;
  }
  return visit(value);
}

export function publicProduct(product) {
  const {sku,...metadata}=product;
  if(metadata.product_id===sku) delete metadata.product_id;
  if(metadata.routing) metadata.routing=publicProduct(metadata.routing);
  return metadata;
}

export function paymentProduct(quote) {
  const snapshot=JSON.parse(quote.snapshot_json);
  if(snapshot.purchase_purpose==='sandbox-access') return {
    slug:'sandbox-preview',description:`Sandbox preview: ${snapshot.trial_product?.slug || 'selected product'}`,
  };
  if(quote.kind==='execution') return {slug:'javascript-execution',description:'One JavaScript Code Mode invocation'};
  return {slug:snapshot.slug || null,description:`Second Wind ${snapshot.slug || 'product'} v${quote.version}`};
}
