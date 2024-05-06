import { RPCError, RPCRequest, RPCResponse } from '../../types/types'
import { callStarknet } from '../../utils/callHelper'

export async function starknetCallHandler(
  request: RPCRequest,
): Promise<RPCResponse | RPCError> {
  const response: RPCResponse | string = await callStarknet('testnet', {
    jsonrpc: request.jsonrpc,
    method: request.method,
    params: [],
    id: request.id,
  })

  if (typeof response === 'string') {
    return {
      code: 7979,
      message: 'Starknet RPC error',
      data: response,
    }
  }

  return {
    jsonrpc: '2.0',
    id: 1,
    result: response.result,
  }
}
