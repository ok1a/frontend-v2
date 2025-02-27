import { Network } from '@/constants/network';
import { POOLS } from '@/constants/pools';
import { configService } from '@/services/config/config.service';
import { merge } from 'lodash';

const defaultArgs = {
  first: 1000,
  orderBy: 'totalLiquidity',
  orderDirection: 'desc',
  where: {
    totalShares_gt: 0.01,
    id_not_in: POOLS.BlockList,
    poolType_not: 'Element'
  }
};

const defaultAttrs = {
  id: true,
  name: true,
  poolType: true,
  swapFee: true,
  tokensList: true,
  totalLiquidity: true,
  totalSwapVolume: true,
  totalSwapFee: true,
  totalShares: true,
  owner: true,
  factory: true,
  amp: true,
  swapEnabled: true,
  tokens: {
    address: true,
    balance: true,
    weight: true
  }
};

if (configService.network.chainId !== Network.POLYGON) {
  defaultAttrs.tokens['priceRate'] = true;
}

export default (args = {}, attrs = {}) => ({
  pools: {
    __args: merge({}, defaultArgs, args),
    ...merge({}, defaultAttrs, attrs)
  }
});
