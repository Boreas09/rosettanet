import { sendRawTransactionHandler } from '../../../src/rpc/calls/sendRawTransaction'

describe('Test sendRawTransaction handler', () => {
  it('Simple decoding', async () => {
    const request = {
      jsonrpc: '2.0',
      method: 'eth_sendRawTransaction',
      params: [
        '0x02f9019201428459682f00850dba9fbbf48303793c947a250d5630b4cf539739df2c5dacb4c659f2488d80b9012438ed1739000000000000000000000000000000000000000000000000000000012a16030000000000000000000000000000000000000000000000000000000004ddd75eac00000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000018c393f77835b9f37ad8500bcbf739bff9f82ce0000000000000000000000000000000000000000000000000000000061b7209200000000000000000000000000000000000000000000000000000000000000030000000000000000000000002b89bf8ba858cd2fcee1fada378d5cd6936968be000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48c001a0c57a8fc131811dce50bbd061ff1f24a6f32a067ce629a51ca3c08287479aac9ea01521d308b35ce9710a19a52f8eaeff43f9b75d2b0f45f515de6a3b5d0c6d6f06',
      ],
      id: 1,
    }
    await sendRawTransactionHandler(request)
  })
})
