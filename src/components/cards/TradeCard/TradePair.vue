<template>
  <div>
    <div class="dark:border-b dark:border-gray-850">
      <div
        class="p-2 flex justify-between text-sm rounded-t-lg dark:bg-gray-900 border dark:border-gray-900 w-full border-b-0"
      >
        <div>{{ $t('send') }}</div>
        <div v-if="tokenInValue > 0" class="text-gray-500">
          {{ fNum(tokenInValue, 'usd') }}
        </div>
      </div>
    </div>
    <BalTextInput
      name="tokenIn"
      :model-value="tokenInAmountInput"
      @input="value => handleInAmountChange(value)"
      type="number"
      :decimal-limit="tokenInDecimals"
      min="0"
      step="any"
      placeholder="0"
      validate-on="input"
      square-top
      prepend-border
    >
      <template v-slot:prepend>
        <div
          class="flex items-center w-32 h-full cursor-pointer"
          @click="openModalSelectToken('input')"
        >
          <BalAsset
            v-if="tokenInAddressInput"
            :address="tokenInAddressInput"
            :size="28"
          />
          <div class="flex flex-col ml-3 w-24 leading-none truncate">
            <BalTooltip v-if="tokenInSymbol.length > 5">
              <template v-slot:activator>
                <span class="font-bold">
                  {{ tokenInSymbol }}
                </span>
              </template>
              <div>
                {{ tokenInSymbol }}
              </div>
            </BalTooltip>
            <span v-else class="font-bold">
              {{ tokenInSymbol }}
            </span>
          </div>
          <BalIcon
            :name="'chevron-down'"
            :size="'sm'"
            class="text-green-500 group-hover:text-red-500"
          />
        </div>
      </template>
      <template v-slot:info>
        <div class="cursor-pointer" @click="handleMax">
          {{ $t('balance') }}: {{ fNum(balanceLabel, 'token') }}
        </div>
      </template>
      <template v-slot:append>
        <div class="p-2">
          <BalBtn size="xs" color="white" @click="handleMax">
            {{ $t('max') }}
          </BalBtn>
        </div>
      </template>
    </BalTextInput>
    <div class="flex items-center mb-4">
      <TradePairToggle @toggle="handleSwitchTokens" />
      <div v-if="rateMessage" class="flex-auto ml-4">
        <span
          class="text-sm text-gray-500 cursor-pointer"
          @click="toggleRate"
          v-text="rateMessage"
        />
      </div>
    </div>
    <div class="dark:border-b dark:border-gray-850">
      <div
        class="p-2 flex justify-between text-sm rounded-t-lg dark:bg-gray-900 border dark:border-gray-900 w-full border-b-0"
      >
        <div>{{ $t('receive') }}</div>
        <div v-if="tokenOutValue > 0" class="text-gray-500">
          {{ fNum(tokenOutValue, 'usd') }}
        </div>
      </div>
    </div>
    <BalTextInput
      :name="'tokenOut'"
      :model-value="tokenOutAmountInput"
      @input="value => handleOutAmountChange(value)"
      type="number"
      :decimal-limit="tokenOutDecimals"
      min="0"
      step="any"
      placeholder="0"
      validate-on="input"
      prepend-border
      square-top
    >
      <template v-slot:prepend>
        <div
          class="flex items-center w-32 h-full cursor-pointer"
          @click="openModalSelectToken('output')"
        >
          <BalAsset
            v-if="tokenOutAddressInput"
            :address="tokenOutAddressInput"
            :size="28"
          />
          <div class="flex flex-col ml-3 w-24 leading-none truncate">
            <BalTooltip v-if="tokenOutSymbol.length > 5">
              <template v-slot:activator>
                <span class="font-bold">
                  {{ tokenOutSymbol }}
                </span>
              </template>
              <div>
                {{ tokenOutSymbol }}
              </div>
            </BalTooltip>
            <span v-else class="font-bold">
              {{ tokenOutSymbol }}
            </span>
          </div>
          <BalIcon
            :name="'chevron-down'"
            :size="'sm'"
            class="text-green-500 group-hover:text-red-500"
          />
        </div>
      </template>
      <template v-slot:info>
        <div>
          {{ $t('priceImpact') }}:
          {{ fNum(priceImpact, 'percent') }}
        </div>
      </template>
    </BalTextInput>
  </div>
  <teleport to="#modal">
    <SelectTokenModal
      v-if="modalSelectTokenIsOpen"
      :excludedTokens="[tokenInAddressInput, tokenOutAddressInput]"
      @close="modalSelectTokenIsOpen = false"
      @select="handleSelectToken"
      include-ether
    />
  </teleport>
</template>

<script lang="ts">
import { defineComponent, toRefs, computed, ref } from 'vue';

import useNumbers from '@/composables/useNumbers';

import TradePairToggle from '@/components/cards/TradeCard/TradePairToggle.vue';
import SelectTokenModal from '@/components/modals/SelectTokenModal/SelectTokenModal.vue';
import useTokens from '@/composables/useTokens';
import { NATIVE_ASSET_ADDRESS } from '@/constants/tokens';

const ETH_BUFFER = 0.1;

export default defineComponent({
  components: {
    TradePairToggle,
    SelectTokenModal
  },
  props: {
    tokenInAmountInput: {
      type: String,
      required: true
    },
    tokenInAddressInput: {
      type: String,
      required: true
    },
    tokenOutAmountInput: {
      type: String,
      required: true
    },
    tokenOutAddressInput: {
      type: String,
      required: true
    },
    exactIn: {
      type: Boolean,
      required: true
    },
    priceImpact: {
      type: Number,
      required: true
    }
  },
  emits: [
    'tokenInAddressChange',
    'tokenInAmountChange',
    'tokenOutAddressChange',
    'tokenOutAmountChange',
    'exactInChange',
    'change'
  ],
  setup(props, { emit }) {
    const { tokens, balances, injectTokens } = useTokens();
    const { fNum, toFiat } = useNumbers();

    const {
      tokenInAmountInput,
      tokenInAddressInput,
      tokenOutAmountInput,
      tokenOutAddressInput,
      exactIn
    } = toRefs(props);

    const tokenInValue = computed(() =>
      toFiat(tokenInAmountInput.value, tokenInAddressInput.value)
    );

    const tokenInSymbol = computed(() => {
      const tokenIn = tokens.value[tokenInAddressInput.value];
      const symbol = tokenIn ? tokenIn.symbol : '';
      return symbol;
    });

    const tokenOutValue = computed(() =>
      toFiat(tokenOutAmountInput.value, tokenOutAddressInput.value)
    );

    const tokenOutSymbol = computed(() => {
      const tokenOut = tokens.value[tokenOutAddressInput.value];
      const symbol = tokenOut ? tokenOut.symbol : '';
      return symbol;
    });

    const tokenInDecimals = computed(() => {
      const decimals = tokens.value[tokenInAddressInput.value]
        ? tokens.value[tokenInAddressInput.value].decimals
        : 18;
      return decimals;
    });

    const tokenOutDecimals = computed(() => {
      const decimals = tokens.value[tokenOutAddressInput.value]
        ? tokens.value[tokenOutAddressInput.value].decimals
        : 18;
      return decimals;
    });

    const isInRate = ref(true);
    const modalSelectTokenType = ref('input');
    const modalSelectTokenIsOpen = ref(false);

    function handleMax(): void {
      const balance = balances.value[tokenInAddressInput.value] || '0';
      const balanceNumber = parseFloat(balance);
      const maxAmount =
        tokenInAddressInput.value !== NATIVE_ASSET_ADDRESS
          ? balance
          : balanceNumber > ETH_BUFFER
          ? (balanceNumber - ETH_BUFFER).toString()
          : '0';
      handleInAmountChange(maxAmount);
    }

    function handleInAmountChange(value: string): void {
      emit('exactInChange', true);
      emit('tokenInAmountChange', value);
      emit('change', value);
    }

    function handleOutAmountChange(value: string): void {
      emit('exactInChange', false);
      emit('tokenOutAmountChange', value);
      emit('change', value);
    }

    function handleSwitchTokens(): void {
      emit('exactInChange', !exactIn.value);
      emit('tokenInAmountChange', tokenOutAmountInput.value);
      emit('tokenInAddressChange', tokenOutAddressInput.value);
      emit('tokenOutAmountChange', tokenInAmountInput.value);
      emit('tokenOutAddressChange', tokenInAddressInput.value);
    }

    function handleSelectToken(address: string): void {
      if (modalSelectTokenType.value === 'input') {
        if (address === tokenOutAddressInput.value) {
          handleSwitchTokens();
          return;
        } else emit('tokenInAddressChange', address);
      } else {
        if (address === tokenInAddressInput.value) {
          handleSwitchTokens();
          return;
        } else emit('tokenOutAddressChange', address);
      }
      injectTokens([address]);
    }

    const rateMessage = computed(() => {
      const tokenIn = tokens.value[tokenInAddressInput.value];
      const tokenOut = tokens.value[tokenOutAddressInput.value];
      if (!tokenIn || !tokenOut) {
        return '';
      }
      const tokenInAmount = parseFloat(tokenInAmountInput.value);
      const tokenOutAmount = parseFloat(tokenOutAmountInput.value);
      if (!tokenInAmount || !tokenOutAmount) {
        return '';
      }
      if (isInRate.value) {
        const rate = tokenOutAmount / tokenInAmount;
        const message = `1 ${tokenIn.symbol} = ${fNum(rate, 'token')} ${
          tokenOut.symbol
        }`;
        return message;
      } else {
        const rate = tokenInAmount / tokenOutAmount;
        const message = `1 ${tokenOut.symbol} = ${fNum(rate, 'token')} ${
          tokenIn.symbol
        }`;
        return message;
      }
    });

    function toggleRate(): void {
      isInRate.value = !isInRate.value;
    }

    function openModalSelectToken(type: string): void {
      modalSelectTokenIsOpen.value = true;
      modalSelectTokenType.value = type;
    }

    const balanceLabel = computed(
      () => balances.value[tokenInAddressInput.value]
    );

    return {
      fNum,
      handleMax,
      balanceLabel,
      handleInAmountChange,
      handleOutAmountChange,
      handleSwitchTokens,
      rateMessage,
      toggleRate,
      tokenInValue,
      tokenInSymbol,
      tokenOutValue,
      tokenOutSymbol,
      modalSelectTokenIsOpen,
      openModalSelectToken,
      handleSelectToken,
      tokenInDecimals,
      tokenOutDecimals
    };
  }
});
</script>
<style>
.prepend {
  @apply group;
}
</style>
