import { RPCError, RPCRequest, RPCResponse } from '../../types/types'
import { validateBlockNumber } from '../../utils/validations'

export async function getUncleCountByBlockNumberHandler(
  request: RPCRequest,
): Promise<RPCResponse | RPCError> {
  if (request.params.length != 1) {
    return {
      jsonrpc: request.jsonrpc,
      id: request.id,
      error: {
        code: -32602,
        message: 'Invalid argument, Parameter lenght should be 1.',
      },
    }
  }

  // Extract the blockNumber
  const blockNumber = request.params[0] as string

  // Validate the blockNumber
  if (!validateBlockNumber(blockNumber)) {
    return {
      jsonrpc: request.jsonrpc,
      id: request.id,
      error: {
        code: -32602,
        message: 'Invalid argument, Invalid blockNumber.',
      },
    }
  }

  return {
    jsonrpc: request.jsonrpc,
    id: request.id,
    error: {
      code: -32000,
      message:
        'the method eth_getUncleCountByBlockNumber does not exist/is not available', // Infura's answer
    },
  }
}