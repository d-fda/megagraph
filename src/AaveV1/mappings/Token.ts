import { log, Address, Bytes, BigInt } from "@graphprotocol/graph-ts";
import {
  AaveV1Token,
  BurnOnLiquidation as BurnOnLiquidationEvent,
  MintOnDeposit as MintOnDepositEvent,
} from "../../../generated/AaveV1TokenaDAI/AaveV1Token";
import { AaveV1TokenData } from "../../../generated/schema";
import { AaveV1LendingPoolAddressesProvider } from "../../../generated/AaveV1TokenaDAI/AaveV1LendingPoolAddressesProvider";
import { AaveV1LendingPoolDataProvider } from "../../../generated/AaveV1TokenaDAI/AaveV1LendingPoolDataProvider";
import { convertBINumToDesiredDecimals } from "../../utils/converters";
import { AaveV1_POOL_PROVIDER_ADDRESS } from "../../utils/constants";

function handleAaveV1Token(
  transactionHash: Bytes,
  blockNumber: BigInt,
  blockTimestamp: BigInt,
  address: Address,
): void {
  let tokenContract = AaveV1Token.bind(address);

  let entity = AaveV1TokenData.load(transactionHash.toHex());
  if (!entity) entity = new AaveV1TokenData(transactionHash.toHex());

  entity.transactionHash = transactionHash;
  entity.blockNumber = blockNumber;
  entity.blockTimestamp = blockTimestamp;
  entity.address = address;
  entity.symbol = tokenContract.try_symbol().reverted ? null : tokenContract.symbol();

  log.debug("Saving AaveV1 Token {} at address {} in block {} with txHash {}", [
    entity.symbol,
    address.toHex(),
    blockNumber.toString(),
    transactionHash.toHex(),
  ]);

  let underlyingAssetAddr = tokenContract.underlyingAssetAddress();
  entity.decimals = tokenContract.decimals();

  let poolProviderContract = AaveV1LendingPoolAddressesProvider.bind(AaveV1_POOL_PROVIDER_ADDRESS);
  let tried_getDataProvider = poolProviderContract.try_getLendingPoolDataProvider();
  if (tried_getDataProvider.reverted) log.error("poolProvider at {} call getDataProvider() reverted", [ poolProviderContract._address.toHex() ]);
  else {
    let dataProviderContract = AaveV1LendingPoolDataProvider.bind(tried_getDataProvider.value);
    
    let tried_getReserveConfigurationData = dataProviderContract.try_getReserveConfigurationData(underlyingAssetAddr);
    if (tried_getReserveConfigurationData.reverted) log.error("dataProvider at {} call getReserveConfigurationData({}) reverted", [ dataProviderContract._address.toHex(), underlyingAssetAddr.toHex() ]);
    else {
      let reserveConfData = tried_getReserveConfigurationData.value;
      entity.ltv = convertBINumToDesiredDecimals(reserveConfData.value0, 4);
      entity.liquidationThreshold = convertBINumToDesiredDecimals(reserveConfData.value1, 4);
      entity.liquidationBonus = convertBINumToDesiredDecimals(reserveConfData.value2, 4);
      entity.interestRateStrategyAddress = reserveConfData.value3;
      entity.usageAsCollateralEnabled = reserveConfData.value4;
      entity.borrowingEnabled = reserveConfData.value5;
      entity.stableBorrowRateEnabled = reserveConfData.value6;
      entity.isActive = reserveConfData.value7;
    }

    let tried_getReserveData = dataProviderContract.try_getReserveData(underlyingAssetAddr);
    if (tried_getReserveData.reverted) log.error("dataProvider at {} call getReserveConfigurationData({}) reverted", [ dataProviderContract._address.toHex(), underlyingAssetAddr.toHex() ]);
    else {
      let reserveData = tried_getReserveData.value;
      entity.totalLiquidity = convertBINumToDesiredDecimals(reserveData.value0, entity.decimals);
      entity.availableLiquidity = convertBINumToDesiredDecimals(reserveData.value1, entity.decimals);
      entity.totalBorrowsStable = convertBINumToDesiredDecimals(reserveData.value2, 27);
      entity.totalBorrowsVariable = convertBINumToDesiredDecimals(reserveData.value3, 27);
      entity.liquidityRate = convertBINumToDesiredDecimals(reserveData.value4, 27);
      entity.variableBorrowRate = convertBINumToDesiredDecimals(reserveData.value5, 27);
      entity.stableBorrowRate = convertBINumToDesiredDecimals(reserveData.value6, 27);
      entity.averageStableBorrowRate = convertBINumToDesiredDecimals(reserveData.value7, 27);
      entity.utilizationRate = convertBINumToDesiredDecimals(reserveData.value8, 27);
      entity.liquidityIndex = reserveData.value9;
      entity.variableBorrowIndex = reserveData.value10;
      entity.aTokenAddress = reserveData.value11;
      entity.lastUpdateTimestamp = reserveData.value12;
    }
  }

  entity.save();
}

export function handleBurnOnLiquidation(event: BurnOnLiquidationEvent): void {
  handleAaveV1Token(
    event.transaction.hash,
    event.block.number,
    event.block.timestamp,
    event.address,
  );
}

export function handleMintOnDeposit(event: MintOnDepositEvent): void {
  handleAaveV1Token(
    event.transaction.hash,
    event.block.number,
    event.block.timestamp,
    event.address,
  );
}