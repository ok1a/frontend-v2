<template>
  <BalModal
    :show="isVisible"
    @close="$emit('close')"
    title="Connect to a wallet"
  >
    <WalletButton v-for="wallet in wallets" :wallet="wallet" :key="wallet" />
    <div
      class="p-4 rounded-lg bg-gradient-to-b from-gray-50 dark:from-gray-900 to-gray-100 dark:to-gray-850"
    >
      <h6>New to Fantom?</h6>
      <p class="text-sm">
        Beethovenx is a DeFi app on Fantom Opera. To invest and trade here,
        you'll first need to set up an Ethereum compatible wallet.
        <BalLink :href="EXTERNAL_LINKS.Ethereum.Wallets" external>
          Learn More
          <span class="align-middle"
            ><BalIcon name="arrow-up-right" size="sm"
          /></span>
        </BalLink>
      </p>
    </div>
  </BalModal>
</template>

<script lang="ts">
import { SupportedWallets } from '@/services/web3/web3.plugin';
import WalletButton from '@/components/web3/WalletButton.vue';
import { EXTERNAL_LINKS } from '@/constants/links';
import { defineComponent } from 'vue';
export default defineComponent({
  emits: ['close'],
  components: {
    WalletButton
  },
  props: {
    isVisible: {
      type: Boolean,
      default: false
    }
  },
  setup() {
    return {
      wallets: SupportedWallets.filter(id => id !== 'gnosis'),
      EXTERNAL_LINKS
    };
  }
});
</script>
