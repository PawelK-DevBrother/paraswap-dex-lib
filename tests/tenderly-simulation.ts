/* eslint-disable no-console */
import axios from 'axios';
import { Address } from '@paraswap/core';
import { TxObject } from '../src/types';
import { StateOverrides, StateSimulateApiOverride } from './smart-tokens';
import { StaticJsonRpcProvider, Provider } from '@ethersproject/providers';
import Web3 from 'web3';

const TENDERLY_TOKEN = process.env.TENDERLY_TOKEN;
const TENDERLY_ACCOUNT_ID = process.env.TENDERLY_ACCOUNT_ID;
const TENDERLY_PROJECT = process.env.TENDERLY_PROJECT;
const TENDERLY_FORK_ID = process.env.TENDERLY_FORK_ID;
const TENDERLY_TEST_NET_RPC = process.env.TENDERLY_TEST_NET_RPC;
const TENDERLY_FORK_LAST_TX_ID = process.env.TENDERLY_FORK_LAST_TX_ID;

export type SimulationResult = {
  success: boolean;
  gasUsed?: string;
  url?: string;
  transaction?: any;
};

export interface TransactionSimulator {
  forkId: string;
  setup(): Promise<void>;

  simulate(
    params: TxObject,
    stateOverrides?: StateOverrides,
  ): Promise<SimulationResult>;
}

export class EstimateGasSimulation implements TransactionSimulator {
  forkId: string = '0';

  constructor(private provider: Provider) {}

  async setup() {}

  async simulate(
    params: TxObject,
    _: StateOverrides,
  ): Promise<SimulationResult> {
    try {
      const result = await this.provider.estimateGas(params);
      return {
        success: true,
        gasUsed: result.toNumber().toString(),
      };
    } catch (e) {
      console.error(`Estimate gas simulation failed:`, e);
      return {
        success: false,
      };
    }
  }
}

export class TenderlySimulation implements TransactionSimulator {
  testNetRPC: StaticJsonRpcProvider | null = null;
  lastTx: string = '';
  forkId: string = '';
  maxGasLimit = 80000000;

  constructor(
    private network: Number = 1,
    forkId?: string,
    lastTransactionId?: string,
  ) {
    if (forkId && lastTransactionId) {
      this.forkId = forkId;
      this.lastTx = lastTransactionId;
    }
  }

  async setup() {
    // Fork the mainnet
    if (!TENDERLY_TOKEN)
      throw new Error(
        `TenderlySimulation_setup: TENDERLY_TOKEN not found in the env`,
      );

    if (this.forkId && this.lastTx) return;

    if (TENDERLY_FORK_ID) {
      if (!TENDERLY_FORK_LAST_TX_ID) throw new Error('Always set last tx id');
      this.forkId = TENDERLY_FORK_ID;
      this.lastTx = TENDERLY_FORK_LAST_TX_ID;
      return;
    }

    if (TENDERLY_TEST_NET_RPC) {
      this.testNetRPC = new StaticJsonRpcProvider(TENDERLY_TEST_NET_RPC);
      return;
    }

    try {
      await process.nextTick(() => {}); // https://stackoverflow.com/questions/69169492/async-external-function-leaves-open-handles-jest-supertest-express
      let res = await axios.post(
        `https://api.tenderly.co/api/v1/account/${TENDERLY_ACCOUNT_ID}/project/${TENDERLY_PROJECT}/fork`,
        {
          network_id: this.network.toString(),
        },
        {
          timeout: 20000,
          headers: {
            'x-access-key': TENDERLY_TOKEN,
          },
        },
      );
      this.forkId = res.data.simulation_fork.id;
      this.lastTx = res.data.root_transaction.id;
    } catch (e) {
      console.error(`TenderlySimulation_setup:`, e);
      throw e;
    }
  }

  async simulate(params: TxObject, stateOverrides?: StateOverrides) {
    let _params = {
      from: params.from,
      to: params.to,
      save: true,
      root: this.lastTx,
      value: params.value || '0',
      gas: this.maxGasLimit,
      input: params.data,
      state_objects: {},
    };
    try {
      if (this.testNetRPC) return this.executeTransactionOnTestnet(params);

      if (stateOverrides) {
        await process.nextTick(() => {}); // https://stackoverflow.com/questions/69169492/async-external-function-leaves-open-handles-jest-supertest-express
        const result = await axios.post(
          `
        https://api.tenderly.co/api/v1/account/${TENDERLY_ACCOUNT_ID}/project/${TENDERLY_PROJECT}/contracts/encode-states`,
          stateOverrides,
          {
            headers: {
              'x-access-key': TENDERLY_TOKEN!,
            },
          },
        );

        _params.state_objects = Object.keys(result.data.stateOverrides).reduce(
          (acc, contract) => {
            const _storage = result.data.stateOverrides[contract].value;

            acc[contract] = {
              storage: _storage,
            };
            return acc;
          },
          {} as Record<Address, StateSimulateApiOverride>,
        );
      }

      await process.nextTick(() => {}); // https://stackoverflow.com/questions/69169492/async-external-function-leaves-open-handles-jest-supertest-express
      const { data } = await axios.post(
        `https://api.tenderly.co/api/v1/account/${TENDERLY_ACCOUNT_ID}/project/${TENDERLY_PROJECT}/fork/${this.forkId}/simulate`,
        _params,
        {
          timeout: 30 * 1000,
          headers: {
            'x-access-key': TENDERLY_TOKEN!,
          },
        },
      );

      const lastTx = data.simulation.id;
      if (data.transaction.status) {
        this.lastTx = lastTx;
        return {
          success: true,
          gasUsed: data.transaction.gas_used,
          url: `https://dashboard.tenderly.co/${TENDERLY_ACCOUNT_ID}/${TENDERLY_PROJECT}/fork/${this.forkId}/simulation/${lastTx}`,
          transaction: data.transaction,
        };
      } else {
        return {
          success: false,
          url: `https://dashboard.tenderly.co/${TENDERLY_ACCOUNT_ID}/${TENDERLY_PROJECT}/fork/${this.forkId}/simulation/${lastTx}`,
          error: `Simulation failed: ${data.transaction.error_info.error_message} at ${data.transaction.error_info.address}`,
        };
      }
    } catch (e) {
      return {
        success: false,
      };
    }
  }

  async executeTransactionOnTestnet(params: TxObject) {
    const txParams = {
      from: params.from,
      to: params.to,
      value: Web3.utils.toHex(params.value || '0'),
      data: params.data,
      gas: '0x4c4b40', // 5,000,000
      gasPrice: '0x0', // 0
    };
    const txHash = await this.testNetRPC!.send('eth_sendTransaction', [
      txParams,
    ]);
    const transaction = await this.testNetRPC!.waitForTransaction(txHash);
    if (transaction.status) {
      return {
        success: true,
        url: txHash,
        gasUsed: transaction.gasUsed.toString(),
        transaction,
      };
    } else {
      return {
        success: false,
        error: `Transaction on testnet failed, hash: ${txHash}`,
      };
    }
  }
}
