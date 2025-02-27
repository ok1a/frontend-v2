import {
  Ref,
  onMounted,
  ref,
  computed,
  ComputedRef,
  reactive,
  toRefs
} from 'vue';
import { useStore } from 'vuex';
import { useIntervalFn } from '@vueuse/core';
import { BigNumber } from 'bignumber.js';
import { Pool } from '@balancer-labs/sor/dist/types';
import { SubgraphPoolBase, SwapTypes } from '@balancer-labs/sor2';
import { useI18n } from 'vue-i18n';

import { scale, bnum } from '@/lib/utils';
import {
  getWrapOutput,
  unwrap,
  wrap,
  WrapType
} from '@/lib/utils/balancer/wrapper';
import {
  SorManager,
  SorReturn,
  LiquiditySelection
} from '@/lib/utils/balancer/helpers/sor/sorManager';
import { swapIn, swapOut } from '@/lib/utils/balancer/swapper';
import { configService } from '@/services/config/config.service';
import { rpcProviderService } from '@/services/rpc-provider/rpc-provider.service';

import useFathom from '../useFathom';
import useWeb3 from '@/services/web3/useWeb3';

import { TransactionResponse } from '@ethersproject/providers';
import useEthers from '../useEthers';
import { TradeQuote } from './types';
import useTransactions, { TransactionAction } from '../useTransactions';
import useNumbers from '../useNumbers';
import { TokenInfo, TokenInfoMap } from '@/types/TokenList';
import useTokens from '../useTokens';
import { getStETHByWstETH } from '@/lib/utils/balancer/lido';
import { formatUnits, parseUnits } from 'ethers/lib/utils';

const GAS_PRICE = process.env.VUE_APP_GAS_PRICE || '100000000000';
const MAX_POOLS = process.env.VUE_APP_MAX_POOLS || '4';
const SWAP_COST = process.env.VUE_APP_SWAP_COST || '100000';
const MIN_PRICE_IMPACT = 0.0001;
const HIGH_PRICE_IMPACT_THRESHOLD = 0.05;
const state = reactive({
  errors: {
    highPriceImpact: false
  }
});

type Props = {
  exactIn: Ref<boolean>;
  tokenInAddressInput: Ref<string>;
  tokenInAmountInput: Ref<string>;
  tokenOutAddressInput: Ref<string>;
  tokenOutAmountInput: Ref<string>;
  tokens: Ref<TokenInfoMap>;
  wrapType: Ref<WrapType>;
  tokenInAmountScaled?: ComputedRef<BigNumber>;
  tokenOutAmountScaled?: ComputedRef<BigNumber>;
  sorConfig?: {
    refetchPools: boolean;
    handleAmountsOnFetchPools: boolean;
  };
  tokenIn: ComputedRef<TokenInfo>;
  tokenOut: ComputedRef<TokenInfo>;
  slippageBufferRate: ComputedRef<number>;
};

export type UseSor = ReturnType<typeof useSor>;

export default function useSor({
  exactIn,
  tokenInAddressInput,
  tokenInAmountInput,
  tokenOutAddressInput,
  tokenOutAmountInput,
  tokens,
  wrapType,
  tokenInAmountScaled,
  tokenOutAmountScaled,
  sorConfig = {
    refetchPools: true,
    handleAmountsOnFetchPools: true
  },
  tokenIn,
  tokenOut,
  slippageBufferRate
}: Props) {
  let sorManager: SorManager | undefined = undefined;
  const pools = ref<(Pool | SubgraphPoolBase)[]>([]);
  const sorReturn = ref<SorReturn>({
    isV1swap: false,
    isV1best: false,
    hasSwaps: false,
    tokenIn: '',
    tokenOut: '',
    returnDecimals: 18,
    returnAmount: new BigNumber(0),
    marketSpNormalised: new BigNumber(0),
    v1result: [[], new BigNumber(0), new BigNumber(0)],
    v2result: {
      tokenAddresses: [],
      swaps: [],
      swapAmount: new BigNumber(0),
      returnAmount: new BigNumber(0),
      returnAmountConsideringFees: new BigNumber(0),
      tokenIn: '',
      tokenOut: '',
      marketSp: new BigNumber(0)
    }
  });
  const trading = ref(false);
  const confirming = ref(false);
  const priceImpact = ref(0);
  const latestTxHash = ref('');
  const latestTx = ref<TransactionResponse | null>(null);
  const poolsLoading = ref(true);
  const slippageError = ref(false);

  // COMPOSABLES
  const store = useStore();
  const {
    getProvider: getWeb3Provider,
    isV1Supported,
    appNetworkConfig
  } = useWeb3();
  const provider = computed(() => getWeb3Provider());
  const { trackGoal, Goals } = useFathom();
  const { txListener } = useEthers();
  const { addTransaction } = useTransactions();
  const { fNum } = useNumbers();
  const { t } = useI18n();
  const { injectTokens, priceFor } = useTokens();

  const liquiditySelection = computed(() => store.state.app.tradeLiquidity);

  onMounted(async () => {
    const unknownAssets: string[] = [];
    if (!tokens.value[tokenInAddressInput.value]) {
      unknownAssets.push(tokenInAddressInput.value);
    }
    if (!tokens.value[tokenOutAddressInput.value]) {
      unknownAssets.push(tokenOutAddressInput.value);
    }
    await injectTokens(unknownAssets);
    await initSor();
    await handleAmountChange();
  });

  useIntervalFn(async () => {
    if (sorConfig.refetchPools && sorManager) {
      fetchPools();
    }
  }, 30 * 1e3);

  function resetState() {
    state.errors.highPriceImpact = false;
  }

  async function initSor(): Promise<void> {
    const poolsUrlV1 = `${
      configService.network.poolsUrlV1
    }?timestamp=${Date.now()}`;
    const poolsUrlV2 = `${
      configService.network.poolsUrlV2
    }?timestamp=${Date.now()}`;
    const subgraphUrl = configService.network.subgraph;

    // If V1 previously selected on another network then it uses this and returns no liquidity.
    if (!isV1Supported) {
      store.commit('app/setTradeLiquidity', LiquiditySelection.V2);
    }

    sorManager = new SorManager(
      isV1Supported,
      rpcProviderService.jsonProvider,
      new BigNumber(GAS_PRICE),
      Number(MAX_POOLS),
      configService.network.chainId,
      configService.network.addresses.weth,
      poolsUrlV1,
      poolsUrlV2,
      subgraphUrl
    );

    fetchPools();
  }

  async function fetchPools(): Promise<void> {
    if (!sorManager) {
      return;
    }

    console.time('[SOR] fetchPools');
    await sorManager.fetchPools();
    console.timeEnd('[SOR] fetchPools');
    poolsLoading.value = false;
    // Updates any swaps with up to date pools/balances
    if (sorConfig.handleAmountsOnFetchPools) {
      handleAmountChange();
    }
  }

  async function handleAmountChange(): Promise<void> {
    const amount = exactIn.value
      ? tokenInAmountInput.value
      : tokenOutAmountInput.value;
    // Avoid using SOR if querying a zero value or (un)wrapping trade
    const zeroValueTrade = amount === '' || new BigNumber(amount).isZero();
    if (zeroValueTrade) {
      tokenInAmountInput.value = amount;
      tokenOutAmountInput.value = amount;
      priceImpact.value = 0;
      sorReturn.value.hasSwaps = false;
      sorReturn.value.returnAmount = new BigNumber(0);
      return;
    }

    const tokenInAddress = tokenInAddressInput.value;
    const tokenOutAddress = tokenOutAddressInput.value;

    if (!tokenInAddress || !tokenOutAddress) {
      if (exactIn.value) tokenOutAmountInput.value = '';
      else tokenInAmountInput.value = '';
      return;
    }

    const tokenInDecimals = tokens.value[tokenInAddressInput.value]?.decimals;
    const tokenOutDecimals = tokens.value[tokenOutAddressInput.value]?.decimals;

    if (wrapType.value !== WrapType.NonWrap) {
      const wrapper =
        wrapType.value === WrapType.Wrap ? tokenOutAddress : tokenInAddress;

      if (exactIn.value) {
        tokenInAmountInput.value = amount;

        const outputAmount = await getWrapOutput(
          wrapper,
          wrapType.value,
          scale(bnum(amount), tokenInDecimals).toString()
        );
        tokenOutAmountInput.value = scale(
          bnum(outputAmount),
          -tokenInDecimals
        ).toString();
      } else {
        tokenOutAmountInput.value = amount;

        const inputAmount = await getWrapOutput(
          wrapper,
          wrapType.value === WrapType.Wrap ? WrapType.Unwrap : WrapType.Wrap,
          scale(bnum(amount), tokenOutDecimals).toString()
        );
        tokenInAmountInput.value = scale(
          bnum(inputAmount),
          -tokenOutDecimals
        ).toString();
      }

      sorReturn.value.hasSwaps = false;
      priceImpact.value = 0;
      return;
    }

    if (!sorManager || !sorManager.hasPoolData()) {
      if (exactIn.value) tokenOutAmountInput.value = '';
      else tokenInAmountInput.value = '';
      return;
    }

    if (exactIn.value) {
      await setSwapCost(
        tokenOutAddressInput.value,
        tokenOutDecimals,
        sorManager
      );

      const tokenInAmountNormalised = new BigNumber(amount); // Normalized value
      const tokenInAmountScaled = scale(
        tokenInAmountNormalised,
        tokenInDecimals
      );

      console.log('[SOR Manager] swapExactIn');

      const swapReturn: SorReturn = await sorManager.getBestSwap(
        tokenInAddress,
        tokenOutAddress,
        tokenInDecimals,
        tokenOutDecimals,
        SwapTypes.SwapExactIn,
        tokenInAmountScaled,
        tokenInDecimals,
        liquiditySelection.value
      );

      sorReturn.value = swapReturn; // TO DO - is it needed?
      const tokenOutAmountNormalised = scale(
        swapReturn.returnAmount,
        -tokenOutDecimals
      );
      tokenOutAmountInput.value =
        tokenOutAmountNormalised.toNumber() > 0
          ? tokenOutAmountNormalised.toFixed(6, BigNumber.ROUND_DOWN)
          : '';

      if (!sorReturn.value.hasSwaps) {
        priceImpact.value = 0;
      } else {
        let returnAmtNormalised = scale(
          swapReturn.returnAmount,
          -tokenOutDecimals
        );

        returnAmtNormalised = await adjustedPiAmount(
          returnAmtNormalised,
          tokenOutAddress,
          tokenOutDecimals
        );

        const effectivePrice = tokenInAmountNormalised.div(returnAmtNormalised);
        const priceImpactCalc = effectivePrice
          .div(swapReturn.marketSpNormalised)
          .minus(1);

        priceImpact.value = BigNumber.max(
          priceImpactCalc,
          MIN_PRICE_IMPACT
        ).toNumber();
      }
    } else {
      // Notice that outputToken is tokenOut if swapType == 'swapExactIn' and tokenIn if swapType == 'swapExactOut'
      await setSwapCost(tokenInAddressInput.value, tokenInDecimals, sorManager);

      let tokenOutAmountNormalised = new BigNumber(amount);
      const tokenOutAmount = scale(tokenOutAmountNormalised, tokenOutDecimals);

      console.log('[SOR Manager] swapExactOut');

      const swapReturn: SorReturn = await sorManager.getBestSwap(
        tokenInAddress,
        tokenOutAddress,
        tokenInDecimals,
        tokenOutDecimals,
        SwapTypes.SwapExactOut,
        tokenOutAmount,
        tokenOutDecimals,
        liquiditySelection.value
      );

      sorReturn.value = swapReturn; // TO DO - is it needed?

      const tradeAmount: BigNumber = swapReturn.returnAmount;
      const tokenInAmountNormalised = scale(tradeAmount, -tokenInDecimals);
      tokenInAmountInput.value =
        tokenInAmountNormalised.toNumber() > 0
          ? tokenInAmountNormalised.toFixed(6, BigNumber.ROUND_UP)
          : '';

      if (!sorReturn.value.hasSwaps) {
        priceImpact.value = 0;
      } else {
        tokenOutAmountNormalised = await adjustedPiAmount(
          tokenOutAmountNormalised,
          tokenOutAddress,
          tokenOutDecimals
        );

        const effectivePrice = tokenInAmountNormalised.div(
          tokenOutAmountNormalised
        );
        const priceImpactCalc = effectivePrice
          .div(swapReturn.marketSpNormalised)
          .minus(1);

        priceImpact.value = BigNumber.max(
          priceImpactCalc,
          MIN_PRICE_IMPACT
        ).toNumber();
      }
    }

    pools.value = sorManager.selectedPools;

    state.errors.highPriceImpact =
      priceImpact.value >= HIGH_PRICE_IMPACT_THRESHOLD;
  }

  function txHandler(tx: TransactionResponse, action: TransactionAction): void {
    confirming.value = false;

    let summary = '';
    const tokenInAmountFormatted = fNum(tokenInAmountInput.value, 'token');
    const tokenOutAmountFormatted = fNum(tokenOutAmountInput.value, 'token');

    const tokenInSymbol = tokenIn.value.symbol;
    const tokenOutSymbol = tokenOut.value.symbol;

    if (['wrap', 'unwrap'].includes(action)) {
      summary = t('transactionSummary.wrapUnwrap', [
        tokenInAmountFormatted,
        tokenInSymbol,
        tokenOutSymbol
      ]);
    } else {
      summary = `${tokenInAmountFormatted} ${tokenInSymbol} -> ${tokenOutAmountFormatted} ${tokenOutSymbol}`;
    }

    addTransaction({
      id: tx.hash,
      type: 'tx',
      action,
      summary,
      details: {
        tokenIn: tokenIn.value,
        tokenOut: tokenOut.value,
        tokenInAddress: tokenInAddressInput.value,
        tokenOutAddress: tokenOutAddressInput.value,
        tokenInAmount: tokenInAmountInput.value,
        tokenOutAmount: tokenOutAmountInput.value,
        exactIn: exactIn.value,
        quote: getQuote(),
        priceImpact: priceImpact.value,
        slippageBufferRate: slippageBufferRate.value
      }
    });

    txListener(tx, {
      onTxConfirmed: () => {
        trading.value = false;
        latestTxHash.value = tx.hash;
        latestTx.value = tx;
        trackGoal(Goals.Swapped);
      },
      onTxFailed: () => {
        trading.value = false;
      }
    });
  }

  async function trade(successCallback?: () => void) {
    trackGoal(Goals.ClickSwap);
    trading.value = true;
    confirming.value = true;

    const tokenInAddress = tokenInAddressInput.value;
    const tokenOutAddress = tokenOutAddressInput.value;
    const tokenInDecimals = tokens.value[tokenInAddress].decimals;
    const tokenOutDecimals = tokens.value[tokenOutAddress].decimals;
    const tokenInAmountNumber = new BigNumber(tokenInAmountInput.value);
    const tokenInAmountScaled = scale(tokenInAmountNumber, tokenInDecimals);

    if (wrapType.value == WrapType.Wrap) {
      try {
        const tx = await wrap(
          appNetworkConfig.key,
          provider.value as any,
          tokenOutAddress,
          tokenInAmountScaled
        );
        console.log('Wrap tx', tx);

        txHandler(tx, 'wrap');

        if (successCallback != null) {
          successCallback();
        }
      } catch (e) {
        console.log(e);
        trading.value = false;
        confirming.value = false;
      }
      return;
    } else if (wrapType.value == WrapType.Unwrap) {
      try {
        const tx = await unwrap(
          appNetworkConfig.key,
          provider.value as any,
          tokenInAddress,
          tokenInAmountScaled
        );
        console.log('Unwrap tx', tx);

        txHandler(tx, 'unwrap');

        if (successCallback != null) {
          successCallback();
        }
      } catch (e) {
        console.log(e);
        trading.value = false;
        confirming.value = false;
      }
      return;
    }

    if (exactIn.value) {
      const tokenOutAmountNumber = new BigNumber(tokenOutAmountInput.value);
      const tokenOutAmount = scale(tokenOutAmountNumber, tokenOutDecimals);
      const minAmount = getMinOut(tokenOutAmount);
      const sr: SorReturn = sorReturn.value as SorReturn;

      try {
        const tx = await swapIn(
          appNetworkConfig.key,
          provider.value as any,
          sr,
          tokenInAmountScaled,
          minAmount
        );
        console.log('Swap in tx', tx);

        txHandler(tx, 'trade');

        if (successCallback != null) {
          successCallback();
        }
      } catch (e) {
        if (isSlippageError(e)) {
          slippageError.value = true;
        }

        console.log(e);
        trading.value = false;
        confirming.value = false;
      }
    } else {
      const tokenInAmountMax = getMaxIn(tokenInAmountScaled);
      const sr: SorReturn = sorReturn.value as SorReturn;
      const tokenOutAmountNormalised = new BigNumber(tokenOutAmountInput.value);
      const tokenOutAmountScaled = scale(
        tokenOutAmountNormalised,
        tokenOutDecimals
      );

      try {
        const tx = await swapOut(
          appNetworkConfig.key,
          provider.value as any,
          sr,
          tokenInAmountMax,
          tokenOutAmountScaled
        );
        console.log('Swap out tx', tx);

        txHandler(tx, 'trade');

        if (successCallback != null) {
          successCallback();
        }
      } catch (e) {
        if (isSlippageError(e)) {
          slippageError.value = true;
        }

        console.log(e);
        trading.value = false;
        confirming.value = false;
      }
    }
  }

  // Uses stored market prices to calculate swap cost in token denomination
  function calculateSwapCost(tokenAddress: string): BigNumber {
    const ethPriceFiat = priceFor(appNetworkConfig.nativeAsset.address);
    const tokenPriceFiat = priceFor(tokenAddress);
    const gasPriceWei = store.state.market.gasPrice || 0;
    const gasPriceScaled = scale(bnum(gasPriceWei), -18);
    const ethPriceToken = bnum(Number(ethPriceFiat) / Number(tokenPriceFiat));
    const swapCost = bnum(SWAP_COST);
    const costSwapToken = gasPriceScaled.times(swapCost).times(ethPriceToken);
    return costSwapToken;
  }

  // Sets SOR swap cost for more efficient routing
  async function setSwapCost(
    tokenAddress: string,
    tokenDecimals: number,
    sorManager: SorManager
  ): Promise<void> {
    // If using Polygon get price of swap using stored market prices
    // If mainnet price retrieved on-chain using SOR
    if (appNetworkConfig.chainId === 137) {
      const swapCostToken = calculateSwapCost(tokenOutAddressInput.value);
      await sorManager.setCostOutputToken(
        tokenAddress,
        tokenDecimals,
        swapCostToken
      );
    } else {
      await sorManager.setCostOutputToken(tokenAddress, tokenDecimals);
    }
  }

  function getMaxIn(amount: BigNumber) {
    return amount
      .times(1 + slippageBufferRate.value)
      .integerValue(BigNumber.ROUND_DOWN);
  }

  function getMinOut(amount: BigNumber) {
    return amount
      .div(1 + slippageBufferRate.value)
      .integerValue(BigNumber.ROUND_DOWN);
  }

  function getQuote(): TradeQuote {
    const maximumInAmount =
      tokenInAmountScaled != null
        ? getMaxIn(tokenInAmountScaled.value).toString()
        : '';

    const minimumOutAmount =
      tokenOutAmountScaled != null
        ? getMinOut(tokenOutAmountScaled.value).toString()
        : '';

    return {
      feeAmountInToken: '0',
      feeAmountOutToken: '0',
      maximumInAmount,
      minimumOutAmount
    };
  }

  function isSlippageError(e) {
    return e.message.indexOf('BAL#507') !== -1;
  }

  /**
   * Under certain circumstance we need to adjust an amount
   * for the price impact calc due to background wrapping taking place
   * e.g. when trading weth to wstEth.
   */
  async function adjustedPiAmount(
    amount: BigNumber,
    address: string,
    decimals: number
  ): Promise<BigNumber> {
    if (address === appNetworkConfig.addresses.wstETH) {
      const denormAmount = parseUnits(amount.toString(), decimals);
      const denormStEthAmount = await getStETHByWstETH(denormAmount);
      return bnum(formatUnits(denormStEthAmount, decimals));
    }
    return amount;
  }

  return {
    ...toRefs(state),
    sorManager,
    sorReturn,
    pools,
    initSor,
    handleAmountChange,
    exactIn,
    trade,
    trading,
    priceImpact,
    latestTxHash,
    latestTx,
    fetchPools,
    poolsLoading,
    getQuote,
    resetState,
    confirming,
    slippageError
  };
}
