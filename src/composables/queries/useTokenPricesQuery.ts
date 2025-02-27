import { reactive, ref, Ref } from 'vue';
import { useQuery } from 'vue-query';
import { UseQueryOptions } from 'react-query/types';
import QUERY_KEYS from '@/constants/queryKeys';
import { coingeckoService } from '@/services/coingecko/coingecko.service';
import { TokenPrices } from '@/services/coingecko/api/price.service';
import { sleep } from '@/lib/utils';
import useUserSettings from '@/composables/useUserSettings';
import useWeb3 from '@/services/web3/useWeb3';
import { getBeetsPrice } from '@/composables/queries/useProtocolDataQuery';

/**
 * TYPES
 */
type QueryResponse = TokenPrices;

/**
 * CONSTANTS
 */
const PER_PAGE = 1000;

/**
 * Fetches token prices for all provided addresses.
 */
export default function useTokenPricesQuery(
  addresses: Ref<string[]> = ref([]),
  options: UseQueryOptions<QueryResponse> = {}
) {
  const queryKey = reactive(QUERY_KEYS.Tokens.Prices(addresses));
  const { currency } = useUserSettings();
  const { appNetworkConfig } = useWeb3();

  const queryFn = async () => {
    // Sequential pagination required to avoid coingecko rate limits.
    let prices: TokenPrices = {};
    const pageCount = Math.ceil(addresses.value.length / PER_PAGE);
    const pages = Array.from(Array(pageCount).keys());

    for (const page of pages) {
      if (page !== 0) await sleep(1000);
      const pageAddresses = addresses.value.slice(
        PER_PAGE * page,
        PER_PAGE * (page + 1)
      );
      console.log('Fetching', pageAddresses.length, 'prices');
      prices = {
        ...prices,
        ...(await coingeckoService.prices.getTokens(pageAddresses))
      };
    }

    // TODO: kill this with fire as soon as Coingecko supports BEETS
    const beetsPrice = await getBeetsPrice(
      appNetworkConfig.addresses.beetsUsdcReferencePricePool,
      appNetworkConfig.addresses.beets,
      appNetworkConfig.addresses.usdc
    );

    prices[appNetworkConfig.addresses.beets] = {
      [currency.value]: beetsPrice
    };

    return prices;
  };

  const queryOptions = reactive({
    enabled: true,
    ...options
  });

  return useQuery<QueryResponse>(queryKey, queryFn, queryOptions);
}
