<template>
  <BalLink
    :href="EXTERNAL_LINKS.Balancer.BalForGas"
    external
    class="block hover:no-underline"
  >
    <div v-if="isActive()" class="message relative px-2 py-3">
      <div class="ml-12">
        <h6 v-text="$t('highGasFees')" class="relative text-sm" />
        <div class="relative text-sm text-gray-500">
          {{ text }}
        </div>
      </div>
    </div>
  </BalLink>
</template>

<script lang="ts">
import { PropType, defineComponent, computed, onBeforeMount, ref } from 'vue';
import { useStore } from 'vuex';
import BigNumber from 'bignumber.js';
import { SorReturn } from '@/lib/utils/balancer/helpers/sor/sorManager';
import { isBudgetLeft } from '@/lib/utils/balancer/bal4gas';
import eligibleAssetList from '@balancer-labs/assets/lists/eligible.json';
import { useI18n } from 'vue-i18n';
import { EXTERNAL_LINKS } from '@/constants/links';
import useWeb3 from '@/services/web3/useWeb3';
import { NATIVE_ASSET_ADDRESS, TOKENS } from '@/constants/tokens';
import useTokens from '@/composables/useTokens';
import { coingeckoService } from '@/services/coingecko/coingecko.service';

export default defineComponent({
  props: {
    addressIn: {
      type: String,
      required: true
    },
    addressOut: {
      type: String,
      required: true
    },
    sorReturn: {
      type: Object as PropType<SorReturn>,
      required: true
    }
  },

  setup(props) {
    const store = useStore();
    const { appNetworkConfig } = useWeb3();
    const isBalForGasBudget = ref<boolean>(false);
    const { t } = useI18n();
    const { priceFor } = useTokens();

    const eligibleAssetMeta = eligibleAssetList[appNetworkConfig.network] ?? {};
    const eligibleAssets = Object.fromEntries(
      Object.entries(eligibleAssetMeta).map(assetEntry => {
        const [address] = assetEntry;
        return [address.toLowerCase(), ''];
      })
    );

    const reimburseAmount = computed(() => {
      // If no swaps set costs to 0 so no price shown
      if (!props.sorReturn.hasSwaps) {
        return {
          bal: new BigNumber(0),
          usd: new BigNumber(0)
        };
      }

      const ethPrice = priceFor(appNetworkConfig.nativeAsset.address);
      const balPrice = priceFor(
        coingeckoService.prices.addressMapOut(
          TOKENS.AddressMap[appNetworkConfig.key].BAL
        )
      );
      const gasPrice = store.state.market.gasPrice || 0;

      const addressInIsEligible =
        props.addressIn === NATIVE_ASSET_ADDRESS ||
        props.addressIn.toLowerCase() in eligibleAssets;
      const addressOutIsEligible =
        props.addressOut === NATIVE_ASSET_ADDRESS ||
        props.addressOut.toLowerCase() in eligibleAssets;
      const reimburseAllSwaps = addressInIsEligible && addressOutIsEligible;

      if (props.sorReturn.isV1swap) {
        let numSwaps = props.sorReturn.v1result[0].flat().length;
        if (!reimburseAllSwaps) {
          const eligibleSwaps = props.sorReturn.v1result[0]
            .flat()
            .filter(hop => {
              return (
                hop.tokenIn in eligibleAssets && hop.tokenOut in eligibleAssets
              );
            });

          numSwaps = eligibleSwaps.length;
        }
        const gasLimit =
          numSwaps === 1
            ? 130000
            : numSwaps === 2
            ? 220000
            : numSwaps === 3
            ? 300000
            : numSwaps >= 4
            ? 400000
            : 0;
        const gasLimitNumber = new BigNumber(gasLimit);
        const gasCostWei = gasLimitNumber.times(gasPrice);
        const gasCost = gasCostWei.div(1e18);
        return {
          bal: gasCost.times(ethPrice).div(balPrice),
          usd: gasCost.times(ethPrice)
        };
      } else {
        let numSwaps = props.sorReturn.v2result.swaps.length;
        if (!reimburseAllSwaps) {
          const tokensList = props.sorReturn.v2result.tokenAddresses;
          numSwaps = 0;
          props.sorReturn.v2result.swaps.forEach(swap => {
            if (
              tokensList[swap.assetInIndex] in eligibleAssets &&
              tokensList[swap.assetOutIndex] in eligibleAssets
            )
              numSwaps++;
          });
        }
        const gasLimit =
          numSwaps === 1
            ? 90000
            : numSwaps === 2
            ? 140000
            : numSwaps === 3
            ? 140000
            : numSwaps >= 4
            ? 140000
            : 0;
        const gasLimitNumber = new BigNumber(gasLimit);
        const gasCostWei = gasLimitNumber.times(gasPrice);
        const gasCost = gasCostWei.div(1e18);
        return {
          bal: gasCost.times(ethPrice).div(balPrice),
          usd: gasCost.times(ethPrice)
        };
      }
    });

    const text = computed(() => {
      const isEligible =
        reimburseAmount.value && reimburseAmount.value.usd.gt(0);

      return isEligible
        ? `${t('tradeEarns')} ~${reimburseAmount.value.bal.toFixed(
            1,
            BigNumber.ROUND_DOWN
          )} BAL (${formatUSD(reimburseAmount.value.usd)})`
        : t('earnBAL');
    });

    function formatUSD(amount: BigNumber): string {
      return `$${new BigNumber(amount).toFixed(2)}`;
    }

    function isActive(): boolean {
      return appNetworkConfig.key === '1' && isBalForGasBudget.value;
    }

    // CALLBACKS
    onBeforeMount(async () => {
      isBalForGasBudget.value = await isBudgetLeft();
    });

    return {
      text,
      isActive,
      EXTERNAL_LINKS
    };
  }
});
</script>

<style scoped>
.message {
  @apply bg-gradient-to-tr from-blue-50 to-pink-50;
  border-radius: 10px;
}

.message::before {
  @apply absolute px-4 py-3 inset-0.5 text-2xl bg-white dark:bg-gray-900 rounded-lg;
  content: '🤝';
}

@media only screen and (max-width: 768px) {
  .message {
    width: initial;
  }
}
</style>
