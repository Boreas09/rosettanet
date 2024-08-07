import { decodeSignedRawTransaction } from '../../src/utils/encoding'

describe('Transaction decoding', () => {
  it('Decodes example EIP 1559 raw transaction', () => {
    const exampleTx =
      '0x02f8b3018306209b8459682f0085022f05a27e82b59b94dac17f958d2ee523a2206206994597c13d831ec780b844a9059cbb000000000000000000000000d6961614be1ebe6b8273b99aa851bc2d99c5e3930000000000000000000000000000000000000000000000000000000001118ee1c001a0d819cc1d62274e3154fd3abb5f2a2e9fd14d0a1bae048767bf4944f69012de1ea060ba548fd61f41a92ef19916b07c0a2fe5628ffd7e7907b9ef1862cf9470cb18'
    decodeSignedRawTransaction(exampleTx)

    const wrongTx =
      '0x02f8b3018306209b8459682f0085022f05a27e82b58b94dac17f958d2ee523a2206206994597c13d831ec780b844a9059cbb000000000000000000000000d6961614be1ebe6b8273b99aa851bc2d99c5e3930000000000000000000000000000000000000000000000000000000001118ee1c001a0d819cc1d62274e3154fd3abb5f2a2e9fd14d0a1bae048767bf4944f69012de1ea060ba548fd61f41a92ef19916b07c0a2fe5628ffd7e7907b9ef1862cf9470cb18'
    decodeSignedRawTransaction(wrongTx)

    // TODO: check values
  })

  it('Decodes example EIP 2930 raw transaction', () => {
    // TODO
  })

  it('Decodes example Legacy raw transaction', () => {
    // TODO
  })
})
