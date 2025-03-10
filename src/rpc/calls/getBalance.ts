import {
  NativeBalance,
  RPCError,
  RPCRequest,
  RPCResponse,
  StarknetRPCError,
} from '../../types/types'
import { getSTRKBalance } from '../../utils/callHelper'
import { validateEthAddress } from '../../utils/validations'
import { precalculateStarknetAccountAddress } from '../../utils/wrapper'
import { isStarknetRPCError } from '../../types/typeGuards'

export async function getBalanceHandler(
  request: RPCRequest,
): Promise<RPCResponse | RPCError> {
  if (request.params.length == 0) {
    return {
      jsonrpc: request.jsonrpc,
      id: request.id,
      error: {
        code: -32602,
        message:
          'Invalid argument, Parameter should be a valid Ethereum Address and block parameter.',
      },
    }
  }

  const ethAddress = request.params[0] as string
  if (!validateEthAddress(ethAddress)) {
    return {
      jsonrpc: request.jsonrpc,
      id: request.id,
      error: {
        code: -32602,
        message:
          'Invalid argument, Parameter should be a valid Ethereum Address.',
      },
    }
  }

  const snAddress: string | StarknetRPCError =
    await precalculateStarknetAccountAddress(ethAddress)

  if (isStarknetRPCError(snAddress)) {
    if (snAddress.code == -32700) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: '0x0',
      }
    }
    return <RPCError>{
      jsonrpc: request.jsonrpc,
      id: request.id,
      error: snAddress,
    }
  }

  const balance: NativeBalance | StarknetRPCError =
    await getSTRKBalance(snAddress)

  if (isStarknetRPCError(balance)) {
    return <RPCError>{
      jsonrpc: request.jsonrpc,
      id: request.id,
      error: balance,
    }
  }

  return {
    jsonrpc: '2.0',
    id: request.id,
    result: balance.ethereumFormat,
  }
}
