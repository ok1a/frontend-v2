<template>
  <div :class="['app-hero', classes]">
    <div class="w-full max-w-3xl mx-auto">
      <template v-if="isWalletReady">
        <div class="flex justify-center mt-4 mb-2">
          <img
            v-if="darkMode"
            src="~@/assets/images/farms-headline.svg"
            width="236"
          />
        </div>
        <div class="grid grid-cols-3 sm:grid-cols-3 xl:grid-cols-3 gap-4 pb-12">
          <template v-if="loading">
            <BalLoadingBlock v-for="n in 3" :key="n" class="h-28" />
          </template>
          <template v-else
            ><BalCard>
              <div class="text-sm text-gray-500 font-medium mb-2 text-left">
                Average APR
              </div>
              <div class="text-xl font-medium truncate flex items-center">
                {{ data.apr }}
              </div>
              <div class="text-sm text-gray-500 font-medium mt-1 text-left">
                {{ data.dailyApr }} Daily
              </div>
            </BalCard>
            <BalCard>
              <div class="text-sm text-gray-500 font-medium mb-2 text-left">
                Total Deposit
              </div>
              <div class="text-xl font-medium truncate flex items-center">
                {{ data.totalBalance }}
              </div>
              <div class="text-sm text-gray-500 font-medium mt-1 text-left">
                {{ data.numFarms }} {{ data.numFarms === 1 ? 'Farm' : 'Farms' }}
              </div>
            </BalCard>

            <BalCard>
              <div class="text-sm text-gray-500 font-medium mb-2 text-left">
                Pending Rewards
              </div>
              <div class="text-xl font-medium truncate flex items-center">
                {{ data.pendingBeets }}
              </div>
              <div class="text-sm text-gray-500 font-medium mt-1 text-left">
                {{ data.pendingBeetsValue }}
              </div>
            </BalCard>
          </template>
        </div>
      </template>
      <template v-else>
        <div class="flex justify-center mt-2">
          <img
            v-if="darkMode"
            src="~@/assets/images/headline.svg"
            width="400"
          />
        </div>
        <div class="flex justify-center mt-4">
          <BalBtn
            :color="darkMode ? 'gray' : 'white'"
            class="mr-3"
            @click="onClickConnect"
          >
            {{ $t('connectWallet') }}
          </BalBtn>
          <BalBtn
            tag="a"
            href="https://docs.beethovenx.io/"
            target="_blank"
            rel="noreferrer"
            color="white"
            outline
            @click="trackGoal(Goals.ClickHeroLearnMore)"
          >
            {{ $t('learnMore') }}
            <BalIcon name="arrow-up-right" size="sm" class="ml-1" />
          </BalBtn>
        </div>
      </template>
    </div>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, PropType } from 'vue';

import useNumbers from '@/composables/useNumbers';

import { EXTERNAL_LINKS } from '@/constants/links';
import useFathom from '@/composables/useFathom';
import useWeb3 from '@/services/web3/useWeb3';
import useDarkMode from '@/composables/useDarkMode';
import { sumBy } from 'lodash';
import numeral from 'numeral';

export default defineComponent({
  name: 'FarmsHero',

  props: {
    decoratedFarms: {
      type: Array as PropType<any[]>,
      required: true
    },
    loading: {
      type: Boolean,
      required: true
    }
  },

  setup(props) {
    // COMPOSABLES
    const { fNum } = useNumbers();
    const { isWalletReady, toggleWalletSelectModal } = useWeb3();
    const { trackGoal, Goals } = useFathom();
    const { darkMode } = useDarkMode();

    const classes = computed(() => ({
      ['h-72']: !isWalletReady.value,
      //['h-0']: isWalletReady.value
      ['h-60']: isWalletReady.value
    }));

    function onClickConnect() {
      toggleWalletSelectModal(true);
      trackGoal(Goals.ClickHeroConnectWallet);
    }

    const data = computed(() => {
      const farms = props.decoratedFarms;
      const averageApr =
        sumBy(farms, farm => farm.apr * (farm.stake || 0)) /
        sumBy(farms, farm => farm.stake || 0);

      return {
        numFarms: farms.filter(farm => farm.stake > 0).length,
        totalBalance: fNum(
          sumBy(farms, farm => farm.stake || 0),
          'usd'
        ),
        pendingBeets:
          numeral(sumBy(farms, farm => farm.pendingBeets)).format('0,0.[00]') +
          ' BEETS',
        pendingBeetsValue: fNum(
          sumBy(farms, farm => farm.pendingBeetsValue),
          'usd'
        ),
        apr: fNum(averageApr, 'percent'),
        dailyApr: fNum(averageApr / 365, 'percent')
      };
    });

    return {
      // data
      Goals,

      // computed
      isWalletReady,
      classes,
      darkMode,
      data,

      // methods
      toggleWalletSelectModal,
      fNum,
      onClickConnect,
      trackGoal,
      // constants
      EXTERNAL_LINKS
    };
  }
});
</script>
