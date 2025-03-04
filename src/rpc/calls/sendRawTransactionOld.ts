/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-unused-vars */

import {
  EVMDecodeError,
  EVMDecodeResult,
  PrepareCalldataError,
  RPCError,
  RPCRequest,
  RPCResponse,
  SignedRawTransaction,
  StarknetContract,
  StarknetContractReadError,
  StarknetRPCError,
  ValidationError,
} from '../../types/types'
import { Transaction } from 'ethers'
import {
  AccountDeployError,
  AccountDeployResult,
  deployRosettanetAccount,
  getRosettaAccountAddress,
  RosettanetAccountResult,
} from '../../utils/rosettanet'
import { callStarknet } from '../../utils/callHelper'
import { validateRawTransaction } from '../../utils/validations'
import {
  getSnAddressFromEthAddress,
  precalculateStarknetAccountAddress,
} from '../../utils/wrapper'
import {
  CairoNamedConvertableType,
  getContractAbiAndMethods,
  getEthereumInputsCairoNamed,
} from '../../utils/starknet'
import {
  ConvertableType,
  initializeStarknetAbi,
} from '../../utils/converters/abiFormatter'
import {
  findStarknetCallableMethod,
  StarknetCallableMethod,
} from '../../utils/match'
import {
  decodeEVMCalldata,
  decodeMulticallCalldata,
  decodeMulticallFeatureCalldata,
  getFunctionSelectorFromCalldata,
} from '../../utils/calldata'
import {
  prepareRosettanetCalldata,
  prepareStarknetInvokeTransaction,
} from '../../utils/transaction'
import { StarknetInvokeTransaction } from '../../types/transactions.types'

import {
  isAccountDeployError,
  isAccountDeployResult,
  isEVMDecodeError,
  isPrepareCalldataError,
  isRPCError,
  isSignedRawTransaction,
  isStarknetContract,
  isStarknetRPCError,
} from '../../types/typeGuards'

export async function sendRawTransactionHandler(
  request: RPCRequest,
): Promise<RPCResponse | RPCError> {
  if (request.params.length != 1) {
    return {
      jsonrpc: request.jsonrpc,
      id: request.id,
      error: {
        code: -32602,
        message: 'Invalid argument, Parameter should length 1.',
      },
    }
  }

  if (typeof request.params[0] !== 'string') {
    return {
      jsonrpc: request.jsonrpc,
      id: request.id,
      error: {
        code: -32602,
        message: 'Invalid argument type, parameter should be string.',
      },
    }
  }

  const rawTxn: string = request.params[0]
  const tx = Transaction.from(rawTxn)

  console.log(tx.toJSON())
  const signedValidRawTransaction: SignedRawTransaction | ValidationError =
    validateRawTransaction(tx)
  // todo improve validations calcualte gas according to tx type https://docs.ethers.org/v5/api/utils/transactions/
  if (!isSignedRawTransaction(signedValidRawTransaction)) {
    return {
      jsonrpc: request.jsonrpc,
      id: request.id,
      error: {
        code: -32603,
        message: signedValidRawTransaction.message,
      },
    }
  }

  const deployedAccountAddress: RosettanetAccountResult =
    await getRosettaAccountAddress(signedValidRawTransaction.from)
  if (!deployedAccountAddress.isDeployed) {
    // This means account is not registered on rosettanet registry. Lets deploy the address
    const accountDeployResult: AccountDeployResult | AccountDeployError =
      await deployRosettanetAccount(signedValidRawTransaction)
    if (!isAccountDeployResult(accountDeployResult)) {
      return {
        jsonrpc: request.jsonrpc,
        id: request.id,
        error: {
          code: -32003,
          message:
            'Error at account deployment : ' + accountDeployResult.message,
        },
      }
    }

    // eslint-disable-next-line no-console
    console.log(`Account Deployed ${accountDeployResult.contractAddress}`)

    return <RPCResponse>{
      jsonrpc: request.jsonrpc,
      id: request.id,
      result: accountDeployResult.transactionHash,
    }
  }

  const starknetAccountAddress = deployedAccountAddress.contractAddress

  let targetContractAddress: string | StarknetRPCError =
    await getSnAddressFromEthAddress(signedValidRawTransaction.to)
  if (isStarknetRPCError(targetContractAddress)) {
    if (targetContractAddress.code === -32700) {
      // This means this contract address is not registered. So we fallback to precalculation
      targetContractAddress = await precalculateStarknetAccountAddress(
        signedValidRawTransaction.to,
      )
      if (isStarknetRPCError(targetContractAddress)) {
        return <RPCError>{
          jsonrpc: request.jsonrpc,
          id: request.id,
          error: targetContractAddress,
        }
      }
    } else {
      return <RPCError>{
        jsonrpc: request.jsonrpc,
        id: request.id,
        error: targetContractAddress,
      }
    }
  }

  const targetFunctionSelector: string | null = getFunctionSelectorFromCalldata(
    signedValidRawTransaction.data,
  )
  if (targetFunctionSelector === null) {
    // Early exit. there is no function call only strk transfer
    const rosettanetCalldata: Array<string> | PrepareCalldataError =
      prepareRosettanetCalldata(signedValidRawTransaction, [], [])

    if (isPrepareCalldataError(rosettanetCalldata)) {
      return <RPCError>{
        jsonrpc: request.jsonrpc,
        id: request.id,
        error: {
          code: -32708,
          message: rosettanetCalldata.message,
        },
      }
    }

    const invokeTransaction: StarknetInvokeTransaction =
      prepareStarknetInvokeTransaction(
        starknetAccountAddress,
        rosettanetCalldata,
        signedValidRawTransaction.signature.arrayified,
        signedValidRawTransaction,
      )
    return await broadcastTransaction(request, invokeTransaction)
  }

  // This is Rosettanet feature transaction.
  // It may be upgrade or multicall so directly broadcast tx
  if (tx.from === tx.to) {
    return broadcastInternalTransaction(
      request,
      starknetAccountAddress,
      signedValidRawTransaction,
      targetFunctionSelector,
    )
  }

  const targetContract: StarknetContract | StarknetContractReadError =
    await getContractAbiAndMethods(targetContractAddress)

  if (!isStarknetContract(targetContract)) {
    return <RPCError>{
      jsonrpc: request.jsonrpc,
      id: request.id,
      error: {
        code: targetContract.code,
        message:
          'Error at reading starknet contract abi: ' + targetContract.message,
      },
    }
  }

  const contractTypeMapping: Map<string, ConvertableType> =
    initializeStarknetAbi(targetContract.abi)

  const starknetFunction: StarknetCallableMethod | undefined =
    findStarknetCallableMethod(
      targetFunctionSelector,
      targetContract.methods,
      contractTypeMapping,
    )
  if (typeof starknetFunction === 'undefined') {
    return <RPCError>{
      jsonrpc: request.jsonrpc,
      id: request.id,
      error: {
        code: -32708,
        message: 'Target function is not found in starknet contract.',
      },
    }
  }

  const starknetFunctionEthereumInputTypes: Array<CairoNamedConvertableType> =
    getEthereumInputsCairoNamed(
      starknetFunction.snFunction,
      contractTypeMapping,
    )

  const ethCalldata = signedValidRawTransaction.data.slice(10)
  const EVMCalldataDecode: EVMDecodeResult | EVMDecodeError = decodeEVMCalldata(
    starknetFunctionEthereumInputTypes,
    ethCalldata,
    targetFunctionSelector,
  )

  if (isEVMDecodeError(EVMCalldataDecode)) {
    return {
      jsonrpc: request.jsonrpc,
      id: request.id,
      error: {
        code: EVMCalldataDecode.code,
        message: EVMCalldataDecode.message,
      },
    }
  }

  const { calldata, directives } = EVMCalldataDecode

  const rosettanetCalldata: Array<string> | PrepareCalldataError =
    prepareRosettanetCalldata(
      signedValidRawTransaction,
      calldata,
      directives,
      starknetFunction,
    )
  if (isPrepareCalldataError(rosettanetCalldata)) {
    return <RPCError>{
      jsonrpc: request.jsonrpc,
      id: request.id,
      error: {
        code: -32708,
        message: rosettanetCalldata.message,
      },
    }
  }
  const invokeTransaction: StarknetInvokeTransaction =
    prepareStarknetInvokeTransaction(
      starknetAccountAddress,
      rosettanetCalldata,
      signedValidRawTransaction.signature.arrayified,
      signedValidRawTransaction,
    )

  return broadcastTransaction(request, invokeTransaction)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function broadcastTransaction(
  request: RPCRequest,
  params: any,
): Promise<RPCResponse | RPCError> {
  const response: RPCResponse | StarknetRPCError = await callStarknet(<
    RPCRequest
  >{
    jsonrpc: request.jsonrpc,
    id: request.id,
    params: params,
    method: 'starknet_addInvokeTransaction',
  })
  if (isStarknetRPCError(response)) {
    if (response.code == 55) {
      return <RPCError>{
        jsonrpc: request.jsonrpc,
        id: request.id,
        error: {
          message: 'Transaction rejected',
          code: -32003,
        },
      }
    }
    return <RPCError>{
      jsonrpc: request.jsonrpc,
      id: request.id,
      error: {
        message: response.message,
        code: -32003,
      },
    }
  }

  const transactionHash = response.result.transaction_hash
  if (typeof transactionHash === 'string') {
    return <RPCResponse>{
      jsonrpc: request.jsonrpc,
      id: request.id,
      result: transactionHash,
    }
  }
  return response
}

// Selector is checked target function
async function broadcastInternalTransaction(
  request: RPCRequest,
  from: string,
  tx: SignedRawTransaction,
  selector: string,
): Promise<RPCResponse | RPCError> {
  if (selector === '0x76971d7f') {
    // Multicall
    const ethCalldata = tx.data.slice(10)
    const decodedMulticallCalldata: EVMDecodeResult | EVMDecodeError =
      decodeMulticallCalldata(ethCalldata, selector) // datadan selector cikart selector ayri gonder
    if (isEVMDecodeError(decodedMulticallCalldata)) {
      return {
        jsonrpc: request.jsonrpc,
        id: request.id,
        error: {
          code: decodedMulticallCalldata.code,
          message: decodedMulticallCalldata.message,
        },
      }
    }
    const rosettanetCalldata: Array<string> | PrepareCalldataError =
      prepareRosettanetCalldata(
        tx,
        decodedMulticallCalldata.calldata,
        decodedMulticallCalldata.directives,
      )

    if (isPrepareCalldataError(rosettanetCalldata)) {
      return <RPCError>{
        jsonrpc: request.jsonrpc,
        id: request.id,
        error: {
          code: -32708,
          message: rosettanetCalldata.message,
        },
      }
    }
    const invokeTx = prepareStarknetInvokeTransaction(
      from,
      rosettanetCalldata,
      tx.signature.arrayified,
      tx,
    )

    const response = await broadcastTransaction(request, invokeTx)
    return response
  } else if (selector === '0x74d0bb9d') {
    // Upgrade
    const rosettanetCalldata: Array<string> | PrepareCalldataError =
      prepareRosettanetCalldata(tx, ['0x74d0bb9d'], [])

    if (isPrepareCalldataError(rosettanetCalldata)) {
      return <RPCError>{
        jsonrpc: request.jsonrpc,
        id: request.id,
        error: {
          code: -32708,
          message: rosettanetCalldata.message,
        },
      }
    }
    const invokeTx = prepareStarknetInvokeTransaction(
      from,
      rosettanetCalldata,
      tx.signature.arrayified,
      tx,
    )

    return broadcastTransaction(request, invokeTx)
  } else {
    return <RPCError>{
      jsonrpc: request.jsonrpc,
      id: request.id,
      error: {
        message: 'Feature function selector not found',
        code: -32003,
      },
    }
  }
}
