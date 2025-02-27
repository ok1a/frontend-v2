<template>
  <div id="modal" />
  <div id="app" class="flex flex-col">
    <AppNav />
    <div class="relative">
      <AppHero v-if="isHomePage" />
      <GlobalStats />
    </div>
    <div class="pb-12">
      <router-view :key="$route.path" class="flex-auto" />
    </div>
    <AppFooterNav v-if="upToLargeBreakpoint" />

    <div class="flex flex-1 items-end relative">
      <img src="~@/assets/images/community-image.png" />
      <div
        class="absolute bottom-0 left-1/2 transform -translate-x-1/2 flex justify-center pb-6 ml-8"
      >
        <a href="https://twitter.com/beethoven_x" class="mr-12">
          <img
            src="~@/assets/images/twitter-icon.png"
            width="40"
            class="mx-auto"
          />
        </a>
        <a href="https://beethovenxio.medium.com/" class="mr-12">
          <img
            src="~@/assets/images/medium-icon.png"
            width="40"
            class="mx-auto"
          />
        </a>
        <a href="https://discord.gg/jedS4zGk28" class="mr-12">
          <img
            src="~@/assets/images/discord-icon.png"
            width="40"
            class="mx-auto"
          />
        </a>
        <a href="https://docs.beethovenx.io/" class="mr-12">
          <img
            src="~@/assets/images/gitbook-logo.png"
            width="40"
            class="mx-auto"
          />
        </a>
        <a href="https://github.com/beethovenxfi">
          <img
            src="~@/assets/images/github-logo.png"
            width="40"
            class="mx-auto"
          />
        </a>
      </div>
    </div>
    <!--    <BalBtn
      v-else
      id="intercom-activator"
      circle
      size="lg"
      color="blue"
      class="fixed bottom-0 right-0 m-4 z-100"
    >
      <BalIcon name="message-square" size="lg" />
    </BalBtn>-->
    <VueQueryDevTools />
    <WalletSelectModal
      :isVisible="isWalletSelectVisible"
      @close="toggleWalletSelectModal"
    />
    <Notifications />
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, onBeforeMount } from 'vue';
import { VueQueryDevTools } from 'vue-query/devtools';
import { useStore } from 'vuex';
import BigNumber from 'bignumber.js';
import { useRoute } from 'vue-router';
import SafeAppsSDK from '@gnosis.pm/safe-apps-sdk';

import useDarkMode from './composables/useDarkMode';
import useWeb3Watchers from '@/composables/useWeb3Watchers';
import AppNav from '@/components/navs/AppNav/AppNav.vue';
import AppHero from '@/components/heros/AppHero.vue';
import WalletSelectModal from '@/components/web3/WalletSelectModal.vue';
import useWeb3 from '@/services/web3/useWeb3';
import { DEFAULT_TOKEN_DECIMALS } from './constants/tokens';
import Notifications from '@/components/notifications/Notifications.vue';
import useBreakpoints from './composables/useBreakpoints';
import { tryPromiseWithTimeout } from './lib/utils/promise';
import AppFooterNav from '@/components/navs/AppFooterNav/AppFooterNav.vue';
import FarmsHero from '@/components/heros/FarmsHero.vue';
import GlobalStats from '@/components/stats/GlobalStats.vue';

BigNumber.config({ DECIMAL_PLACES: DEFAULT_TOKEN_DECIMALS });

const isGnosisSafeApp = async (): Promise<boolean> => {
  // Can't be a Safe app if we're not running in an iframe
  if (window.self === window.top) return false;

  // Try to connect to the Gnosis UI by querying Safe info
  // If we get no response then we're not in a Safe app
  try {
    await tryPromiseWithTimeout(new SafeAppsSDK().safe.getInfo(), 1000);
    return true;
  } catch {
    return false;
  }
};

export default defineComponent({
  components: {
    AppNav,
    AppFooterNav,
    AppHero,
    VueQueryDevTools,
    WalletSelectModal,
    Notifications,
    GlobalStats
  },

  setup() {
    // COMPOSABLES
    useWeb3Watchers();
    const {
      isWalletSelectVisible,
      connectWallet,
      toggleWalletSelectModal
    } = useWeb3();
    const store = useStore();
    const route = useRoute();
    const { upToLargeBreakpoint } = useBreakpoints();
    const { darkMode, toggleDarkMode } = useDarkMode();

    // COMPUTED
    const isHomePage = computed(() => route.path === '/');
    const isFarmsPage = computed(() => route.path === '/farm');

    // CALLBACKS
    onBeforeMount(async () => {
      // If we're running as a Safe App we want to automatically
      // connect to the provided safe.
      if (await isGnosisSafeApp()) {
        await connectWallet('gnosis');
        // Disable darkmode by default
        if (darkMode) toggleDarkMode();
      }

      store.dispatch('app/init');
    });

    return {
      // computed
      isWalletSelectVisible,
      isHomePage,
      isFarmsPage,
      upToLargeBreakpoint,
      // methods
      toggleWalletSelectModal
    };
  }
});
</script>
<style>
.VueQueryDevtoolsPanel + button {
  @apply text-black bg-gray-100 p-2 rounded text-sm;
}

#intercom-activator {
  z-index: 2147483004;
}
</style>
