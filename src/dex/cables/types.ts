import { RequestHeaders } from '../../dex-helper';
import { Token } from '../../types';
import { Method } from '../../dex-helper/irequest-wrapper';
import { AugustusRFQOrderData } from '../augustus-rfq';

export type CablesRFQResponse = {
  order: AugustusRFQOrderData;
  signature: string;
};

export type CablesData = {
  quoteData?: AugustusRFQOrderData;
};

export enum OrderbookSide {
  bids = 'bids',
  asks = 'asks',
}

/**
 * Utils
 */
export type CablesAPIParameters = {
  url: string;
  method: Method;
};
export class CablesRfqError extends Error {}

/**
 * Types
 */
export type PairData = {
  base: string;
  quote: string;
  liquidityUSD: number;
};
type PriceData = {
  bids: string[][];
  asks: string[][];
};
export type PriceDataMap = {
  [network: string]: {
    [pair: string]: PriceData;
  };
};

/**
 * Responses
 */
export type CablesPricesResponse = {
  prices: PriceDataMap;
};
export type CablesBlacklistResponse = {
  blacklist: string[];
};
export type CablesTokensResponse = {
  tokens: Record<string, Token>;
};
export type CablesPairsResponse = {
  pairs: Record<string, PairData>;
};

/**
 * Rate Fetcher
 */
export type CablesRateFetcherConfig = {
  rateConfig: {
    pairsReqParams: {
      url: string;
      headers?: RequestHeaders;
      params?: any;
    };
    pricesReqParams: {
      url: string;
      headers?: RequestHeaders;
      params?: any;
    };
    blacklistReqParams: {
      url: string;
      headers?: RequestHeaders;
      params?: any;
    };
    tokensReqParams: {
      url: string;
      headers?: RequestHeaders;
      params?: any;
    };
    pairsIntervalMs: number;
    pricesIntervalMs: number;
    blacklistIntervalMs: number;
    tokensIntervalMs: number;

    pairsCacheKey: string;
    pricesCacheKey: string;
    blacklistCacheKey: string;
    tokensCacheKey: string;

    blacklistCacheTTLSecs: number;
    pairsCacheTTLSecs: number;
    pricesCacheTTLSecs: number;
    tokensCacheTTLSecs: number;
  };
};
