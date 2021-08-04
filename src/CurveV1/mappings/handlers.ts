import { log, ethereum, Address, Bytes, BigInt, BigDecimal } from "@graphprotocol/graph-ts";
import { CurveV1GaugeController } from "../../../generated/CurveV1GaugeController/CurveV1GaugeController";
import { CurveV1PoolX2 } from "../../../generated/CurveV1PoolX2cDAI+cUSDC/CurveV1PoolX2";
import { CurveV1PoolX3 } from "../../../generated/CurveV1PoolX3DAI+USDC+USDT/CurveV1PoolX3";
import { CurveV1PoolX4 } from "../../../generated/CurveV1PoolX4yDAI+yUSDC+yUSDT+yTUSD/CurveV1PoolX4";
import { CurveV1ERC20 } from "../../../generated/CurveV1PoolX2cDAI+cUSDC/CurveV1ERC20";
import {
  CurveV1GaugeData,
  CurveV1PoolData,
} from "../../../generated/schema";
import {
  convertBINumToDesiredDecimals,
  toBytes,
} from "../../utils/converters";
import {
  ZERO_ADDRESS,
  ZERO_BYTES,
  ZERO_BD,
} from "../../utils/constants";

export function handleGaugeEntity(
  txnHash: Bytes,
  blockNumber: BigInt,
  timestamp: BigInt,
  controller: Address,
  gauge: Address,
  gaugeWeight: BigInt,
  totalWeight: BigInt
): void {
  let entity = CurveV1GaugeData.load(txnHash.toHex());
  if (!entity) entity = new CurveV1GaugeData(txnHash.toHex());

  log.debug("Saving Gauge Controller at {}", [ controller.toHex() ]);

  entity.blockNumber = blockNumber;
  entity.blockTimestamp = timestamp;
  entity.gaugeController = controller;
  
  let liquidityGauge = gauge
    ? gauge
    : ZERO_ADDRESS;
  entity.liquidityGauge = liquidityGauge;

  let gaugeControllerContract = CurveV1GaugeController.bind(controller);
  entity.gaugeWeight = gaugeWeight
    ? convertBINumToDesiredDecimals(gaugeWeight, 18)
    : gaugeControllerContract.try_get_gauge_weight(liquidityGauge).reverted
      ? ZERO_BD
      : convertBINumToDesiredDecimals(gaugeControllerContract.get_gauge_weight(liquidityGauge), 18);
  entity.totalWeight = totalWeight
    ? convertBINumToDesiredDecimals(totalWeight, 18)
    : gaugeControllerContract.try_get_total_weight().reverted
      ? ZERO_BD
      : convertBINumToDesiredDecimals(gaugeControllerContract.get_total_weight(), 18);

  entity.save();
}

export function handlePoolEntity(
  txnHash: Bytes,
  blockNumber: BigInt,
  timestamp: BigInt,
  vault: Address,
  nCoins: number,
  poolType: string
): void {
  let entity = CurveV1PoolData.load(txnHash.toHex());
  if (!entity) entity = new CurveV1PoolData(txnHash.toHex());

  log.debug("Saving {} at {}", [
    poolType,
    vault.toHex(),
  ]);

  entity.blockNumber = blockNumber;
  entity.blockTimestamp = timestamp;
  entity.vault = vault;

  let balances: Array<BigDecimal> = [];
  let tokens: Array<Bytes> = [];
  for (let i = 0; i < nCoins; i++) {
    balances.push(getBalance(vault, BigInt.fromI32(i), poolType));
    tokens.push(getToken(vault, BigInt.fromI32(i), poolType));
  }
  entity.balance = balances;
  entity.tokens = tokens;
  
  let virtualPrice: ethereum.CallResult<BigInt>;
  if (poolType === "Curve2Pool") {
    let contract = CurveV1PoolX2.bind(vault);
    virtualPrice = contract.try_get_virtual_price();
  } else if (poolType === "Curve3Pool") {
    let contract = CurveV1PoolX3.bind(vault);
    virtualPrice = contract.try_get_virtual_price();
  } else if (poolType === "Curve4Pool") {
    let contract = CurveV1PoolX4.bind(vault);
    virtualPrice = contract.try_get_virtual_price();
  } else {
    log.error("Unknown poolType {}", [ poolType ]);
  }
  entity.virtualPrice = (!virtualPrice || virtualPrice.reverted)
    ? ZERO_BD
    : convertBINumToDesiredDecimals(virtualPrice.value, 18);

  entity.save();
}

function getBalance(
  address: Address,
  coinIndex: BigInt,
  poolType: string
): BigDecimal {
  let balance: ethereum.CallResult<BigInt>;
  let token: ethereum.CallResult<Address>;

  if (poolType === "Curve2Pool") {
    let contract = CurveV1PoolX2.bind(address);
    balance = contract.try_balances(coinIndex);
    token = contract.try_coins(coinIndex);
  } else if (poolType === "Curve3Pool") {
    let contract = CurveV1PoolX3.bind(address);
    balance = contract.try_balances(coinIndex);
    token = contract.try_coins(coinIndex);
  } else if (poolType === "Curve4Pool") {
    let contract = CurveV1PoolX4.bind(address);
    balance = contract.try_balances(coinIndex);
    token = contract.try_coins(coinIndex);
  } else {
    return ZERO_BD;
  }

  if (!balance.reverted && !token.reverted) {
    let tokenContract = CurveV1ERC20.bind(token.value);
    let decimal = tokenContract.try_decimals();
    return decimal.reverted
      ? balance.value.toBigDecimal()
      : convertBINumToDesiredDecimals(balance.value, decimal.value);
  }
  return ZERO_BD;
}

function getToken(
  address: Address,
  coinIndex: BigInt,
  poolType: string
): Bytes {
  let token: ethereum.CallResult<Address>;

  if (poolType === "Curve2Pool") {
    let contract = CurveV1PoolX2.bind(address);
    token = contract.try_coins(coinIndex);
  } else if (poolType === "Curve3Pool") {
    let contract = CurveV1PoolX3.bind(address);
    token = contract.try_coins(coinIndex);
  } else if (poolType === "Curve4Pool") {
    let contract = CurveV1PoolX4.bind(address);
    token = contract.try_coins(coinIndex);
  } else {
    return ZERO_BYTES;
  }
  return token.reverted
    ? ZERO_BYTES
    : toBytes(token.value.toHex());
}