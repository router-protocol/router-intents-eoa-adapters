# Router Nitro Periphery Contracts

Router Nitro Periphery Contracts contains smart contracts for various cross-chain products created using Router Nitro.

Smart Contracts is designed in such a way that it is:

- Modular => highly customizable and extendable.
- Optimized => highly gas optimized.

# How to run the project

This project demonstrates an advanced Hardhat use case, integrating other tools commonly used alongside Hardhat in the ecosystem.

## 1. Install

```shell
> npm install
// or
> yarn install
```

## 2. Configure

Place required fields in a `.env` file in the root folder of the project (requirements are stored in .env.example file).

### 3. Run

```shell
npx hardhat test

// other
npx hardhat accounts
npx hardhat compile
npx hardhat clean
npx hardhat node
npx hardhat help
REPORT_GAS=true npx hardhat test
npx hardhat coverage
npx hardhat run scripts/deploy.ts
TS_NODE_FILES=true npx ts-node scripts/deploy.ts
npx eslint '**/*.{js,ts}'
npx eslint '**/*.{js,ts}' --fix
npx prettier '**/*.{json,sol,md}' --check
npx prettier '**/*.{json,sol,md}' --write
npx solhint 'contracts/**/*.sol'
npx solhint 'contracts/**/*.sol' --fix
```

# Performance optimizations

For faster runs of your tests and scripts, consider skipping ts-node's type checking by setting the environment variable `TS_NODE_TRANSPILE_ONLY` to `1` in hardhat's environment. For more details see [the documentation](https://hardhat.org/guides/typescript.html#performance-optimizations).
