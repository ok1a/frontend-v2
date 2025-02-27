import { SUPPORTED_FIAT } from '@/constants/currency';
import { PriceService } from './api/price.service';
import { coingeckoClient } from './coingecko.client';

export const getNativeAssetId = (chainId: string): string => {
  const mapping = {
    '1': 'ethereum',
    '4': 'ethereum',
    '42': 'ethereum',
    '137': 'matic-network',
    '43113': 'avalanche-2',
    '43114': 'avalanche-2',
    '250': 'fantom'
  };

  return mapping[chainId] || 'ethereum';
};

export const getPlatformId = (chainId: string): string => {
  const mapping = {
    '1': 'ethereum',
    '4': 'fantom',
    '42': 'ethereum',
    '137': 'polygon-pos',
    '43113': 'avalanche',
    '43114': 'avalanche',
    '250': 'fantom'
  };

  return mapping[chainId] || 'ethereum';
};

export class CoingeckoService {
  supportedFiat: string;
  prices: PriceService;

  constructor(
    public readonly client = coingeckoClient,
    priceServiceClass = PriceService
  ) {
    this.supportedFiat = SUPPORTED_FIAT.join(',');
    this.prices = new priceServiceClass(this);
  }
}

export const coingeckoService = new CoingeckoService();
