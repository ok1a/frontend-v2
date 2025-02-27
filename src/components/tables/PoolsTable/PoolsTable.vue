<template>
  <BalCard
    shadow="lg"
    class="mt-4"
    :square="upToLargeBreakpoint"
    :noBorder="upToLargeBreakpoint"
    noPad
  >
    <BalTable
      :columns="columns"
      :data="data"
      :is-loading="isLoading"
      :is-loading-more="isLoadingMore"
      skeleton-class="h-64"
      sticky="both"
      :square="upToLargeBreakpoint"
      :link="{
        to: 'pool',
        getParams: pool => ({ id: pool.id })
      }"
      :on-row-click="handleRowClick"
      :is-paginated="isPaginated"
      @load-more="$emit('loadMore')"
      :initial-state="{
        sortColumn: 'poolValue',
        sortDirection: 'desc'
      }"
    >
      <template v-slot:iconColumnHeader>
        <div class="flex items-center">
          <img
            v-if="darkMode"
            :src="require('@/assets/images/icons/tokens_white.svg')"
          />
          <img
            v-else
            :src="require('@/assets/images/icons/tokens_black.svg')"
          />
        </div>
      </template>
      <template v-slot:iconColumnCell="farm">
        <div v-if="!isLoading" class="px-6 py-4">
          <BalAssetSet
            :addresses="orderedTokenAddressesFor(farm)"
            :width="100"
          />
        </div>
      </template>
      <template v-slot:poolNameCell="pool">
        <div v-if="!isLoading" class="px-6 py-4">
          <h5 class="mb-2 text-left">{{ pool.name }}</h5>
          <TokenPills
            :tokens="orderedPoolTokens(pool)"
            :isStablePool="isStableLike(pool)"
          />
        </div>
      </template>
      <template v-slot:aprCell="pool">
        <div class="px-6 py-4 -mt-1 flex justify-end">
          {{
            Number(pool.dynamic.apr.pool) > 10000
              ? '-'
              : fNum(pool.dynamic.apr.total, 'percent')
          }}
          <LiquidityMiningTooltip :pool="pool" />
        </div>
      </template>
    </BalTable>
  </BalCard>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';

import {
  DecoratedPoolWithShares,
  PoolToken
} from '@/services/balancer/subgraph/types';

import { getAddress } from '@ethersproject/address';

import useNumbers from '@/composables/useNumbers';
import useFathom from '@/composables/useFathom';

import LiquidityMiningTooltip from '@/components/tooltips/LiquidityMiningTooltip.vue';
import TokenPills from './TokenPills/TokenPills.vue';

import { ColumnDefinition } from '@/components/_global/BalTable/BalTable.vue';
import useDarkMode from '@/composables/useDarkMode';
import useBreakpoints from '@/composables/useBreakpoints';
import { isStableLike } from '@/composables/usePool';

export default defineComponent({
  components: {
    LiquidityMiningTooltip,
    TokenPills
  },

  emits: ['loadMore'],

  props: {
    data: {
      type: Array
    },
    isLoading: {
      type: Boolean
    },
    isLoadingMore: {
      type: Boolean,
      default: false
    },
    showPoolShares: {
      type: Boolean,
      default: false
    },
    noPoolsLabel: {
      type: String,
      default: 'No pools'
    },
    isPaginated: {
      type: Boolean,
      default: false
    }
  },

  setup(props) {
    // COMPOSABLES
    const { fNum } = useNumbers();
    const router = useRouter();
    const { t } = useI18n();
    const { trackGoal, Goals } = useFathom();
    const { darkMode } = useDarkMode();
    const { upToLargeBreakpoint } = useBreakpoints();

    // DATA
    const columns = ref<ColumnDefinition<DecoratedPoolWithShares>[]>([
      {
        name: 'Icons',
        id: 'icons',
        accessor: 'uri',
        Header: 'iconColumnHeader',
        Cell: 'iconColumnCell',
        width: 125,
        noGrow: true
      },
      {
        name: 'Pool',
        id: 'poolName',
        accessor: 'name',
        //Cell: 'poolNameCell',
        width: 350
      },
      {
        name: t('myBalance'),
        accessor: pool => fNum(pool.shares, 'usd', { forcePreset: true }),
        align: 'right',
        id: 'myBalance',
        hidden: !props.showPoolShares,
        sortKey: pool => Number(pool.shares),
        width: 150
      },
      {
        name: t('poolValue'),
        accessor: pool => fNum(pool.totalLiquidity, 'usd'),
        align: 'right',
        id: 'poolValue',
        sortKey: pool => {
          const apr = Number(pool.totalLiquidity);
          if (apr === Infinity || isNaN(apr)) return 0;
          return apr;
        },
        width: 150
      },
      {
        name: t('volume24h', [t('hourAbbrev')]),
        accessor: pool => fNum(pool.dynamic.volume, 'usd'),
        align: 'right',
        id: 'poolVolume',
        sortKey: pool => {
          const apr = Number(pool.dynamic.volume);
          if (apr === Infinity || isNaN(apr)) return 0;
          return apr;
        },
        width: 175
      },
      {
        name: t('apr'),
        Cell: 'aprCell',
        accessor: pool => pool.dynamic.apr.total,
        align: 'right',
        id: 'poolApr',
        sortKey: pool => {
          const apr = Number(pool.dynamic.apr.total);
          if (apr === Infinity || isNaN(apr)) return 0;
          return apr;
        },
        width: 150
      }
    ]);

    // METHODS
    function orderedTokenAddressesFor(pool: DecoratedPoolWithShares) {
      const sortedTokens = orderedPoolTokens(pool);
      return sortedTokens.map(token => getAddress(token.address));
    }

    function orderedPoolTokens(pool: DecoratedPoolWithShares): PoolToken[] {
      if (isStableLike(pool)) return pool.tokens;

      const sortedTokens = pool.tokens.slice();
      sortedTokens.sort((a, b) => parseFloat(b.weight) - parseFloat(a.weight));
      return sortedTokens;
    }

    function handleRowClick(pool: DecoratedPoolWithShares) {
      trackGoal(Goals.ClickPoolsTableRow);
      router.push({ name: 'pool', params: { id: pool.id } });
    }

    return {
      // data
      columns,

      // computed
      darkMode,
      upToLargeBreakpoint,

      // methods
      handleRowClick,
      getAddress,
      fNum,
      orderedTokenAddressesFor,
      orderedPoolTokens,
      isStableLike
    };
  }
});
</script>
