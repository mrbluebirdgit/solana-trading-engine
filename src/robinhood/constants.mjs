export const ROBINHOOD_CHAIN_ID = 4663;

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const WETH_ADDRESS = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
export const USDG_ADDRESS = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";

export const PONS = Object.freeze({
  v2Factory: "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e",
  v2Router: "0xe33e9e479df8802cb0866d5d05258bec4cf62948",
  v2Locker: "0x267444d099b10fb5ed7c3cc7b7c767adca574952",
  v2Hook: "0xe5e702641ea86f4ae6cc3cdaed2b886f976be044",
  v1Factory: "0xa5aab3f0c6eeadf30ef1d3eb997108e976351feb",
});

export const TOPICS = Object.freeze({
  ponsV2TokenLaunched: "0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607",
  ponsV1TokenLaunched: "0xdb51ea9ad51ab453a65a4cb7e60c3cb378c9501bb002609f8f97778fb6c4235a",
  ponsV1TokenDeployed: "0x1461370115e1c2be79cb529f8cfcbd11316e789d9c6099fc83417b0b4c48c62a",
  curveBuy: "0xec36bf571f136799e8dc0b0b8bea4b04d8bd3d43de838aab0d5fc21d4cbfc455",
  curveSell: "0x8113d738abdcb6b38357e9d53a54a7157861a09031b453651f0fe7fe151f59df",
});

export const KNOWN_QUOTES = new Set([ZERO_ADDRESS, WETH_ADDRESS, USDG_ADDRESS]);

